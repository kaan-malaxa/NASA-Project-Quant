import csv
import json
from dataclasses import replace
from datetime import date

import h3
import pytest

from pipeline.common import config, io, paths
from pipeline.ingest import __main__ as entry
from pipeline.ingest import clean

SCIENCE = {
    "filters": {"modis_min_confidence": 30, "viirs_keep": ["n", "h"]},
    "grid": {"count_res": 6, "map_res": 5, "mask_res": 8},
}
HEADER = ["latitude", "longitude", "acq_date", "acq_time", "satellite", "instrument",
          "version", "confidence", "daynight", "frp", "scan", "track", "type"]


@pytest.fixture
def setup(tmp_path, monkeypatch):
    monkeypatch.setenv("FIREROSETTA_DATA_ROOT", str(tmp_path))
    region = replace(config.get_region("us"), bbox=[10, 10, 80, 12], polygon=None)
    monkeypatch.setattr(clean, "region_cells", lambda *args: {h3.latlng_to_cell(11, 11, 6)})
    return tmp_path, region


def write_csv(path, rows, include_type=True):
    columns = HEADER if include_type else HEADER[:-1]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(columns)
        writer.writerows(rows if include_type else [row[:-1] for row in rows])
    return path


def row(sensor="Aqua", confidence="30", instrument="MODIS", **updates):
    values = dict(zip(HEADER, [11, 11, "2023-01-01", "0015", sensor, instrument,
                             "61.03" if instrument == "MODIS" else "2",
                             confidence, "D", "2", "1", "1", "0"]))
    values.update(updates)
    return [values[key] for key in HEADER]


def test_twelve_row_pair_known_answers(setup):
    directory, region = setup
    modis = write_csv(directory / "modis_pair.csv", [
        row(confidence="29", acq_time="0000"), row(), row(), row(type="2", acq_time="0100"),
        row(latitude=999), row(longitude=75, acq_time="2030"),
    ])
    viirs = write_csv(directory / "viirs_snpp_pair.csv", [
        row("N", "low", "VIIRS", acq_time="0000"), row("N", "n", "VIIRS"),
        row("N", "High", "VIIRS", acq_time="30"), row("N", "n", "VIIRS", type="2", acq_time="0045"),
        row("N", "n", "VIIRS", acq_time="100", type=""),
        row("N", "h", "VIIRS", longitude=90),
    ])
    before = modis.read_bytes(), viirs.read_bytes()
    assert clean.clean_files([modis, viirs], region, SCIENCE) == 5
    aqua = io.read_parquet(paths.detections("us", "aqua"), "detections")
    snpp = io.read_parquet(paths.detections("us", "snpp"), "detections")
    assert len(aqua) == 2 and len(snpp) == 3
    assert aqua.loc[aqua.longitude.eq(75), "local_day"].iloc[0] == date(2023, 1, 2)
    assert aqua.loc[aqua.longitude.eq(11), "in_region"].iloc[0]
    assert not aqua.loc[aqua.longitude.eq(75), "in_region"].iloc[0]
    nrt = snpp.loc[snpp["product"].eq("NRT")]
    assert len(nrt) == 1 and nrt["type"].isna().all()
    assert snpp.acq_datetime_utc.dt.minute.tolist() == [15, 30, 0]
    counts = io.read_parquet(paths.raw_daily_counts("us"), "raw_daily_counts")
    assert counts.n_raw_rows.sum() == 12
    logs = json.loads(paths.filter_log("us").read_text(encoding="utf-8"))
    aqua_log = {item["step"]: item["rows_dropped"] for item in logs if item["sensor"] == "aqua"}
    assert aqua_log == {"valid_coordinates_date": 1, "duplicates": 1, "bbox": 0, "type": 1, "confidence": 1}
    assert (modis.read_bytes(), viirs.read_bytes()) == before
    static = io.read_parquet(paths.static_candidates("us"), "static_candidates")
    assert static.n_static.sum() == 2
    assert len(io.read_parquet(paths.detections("us", "noaa20"), "detections")) == 0


def test_unknown_satellite_stops_before_publishing(setup):
    directory, region = setup
    source = write_csv(directory / "modis_unknown.csv", [row(sensor="X")])
    with pytest.raises(ValueError, match="Unknown"):
        clean.clean_files([source], region, SCIENCE)
    assert not paths.detections("us", "aqua").exists()


def test_absent_type_and_nrt_version(setup):
    directory, region = setup
    source = write_csv(directory / "nrt_viirs_noaa20_fixture.csv",
                       [row("N20", "nominal", "VIIRS")], include_type=False)
    assert clean.clean_files([source], region, SCIENCE) == 1
    frame = io.read_parquet(paths.detections("us", "noaa20"), "detections")
    assert frame["type"].isna().all() and frame["product"].eq("NRT").all()
    source = write_csv(directory / "viirs_noaa20_version.csv",
                       [row("N20", "h", "VIIRS", version="2 NRT")])
    clean.clean_files([source], region, SCIENCE)
    assert io.read_parquet(paths.detections("us", "noaa20"), "detections")["product"].eq("NRT").all()


def test_real_product_specific_brightness_columns_can_coexist(setup):
    directory, region = setup
    files = []
    for name, extra, values in [
        ("modis_extra.csv", ["brightness", "bright_t31"], row()),
        ("viirs_snpp_extra.csv", ["bright_ti4", "bright_ti5"], row("N", "n", "VIIRS")),
    ]:
        path = directory / name
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(HEADER + extra)
            writer.writerow(values + ["300", "290"])
        files.append(path)
    assert clean.clean_files(files, region, SCIENCE) == 2


def test_cross_file_duplicates_and_invalid_time(setup):
    directory, region = setup
    first = write_csv(directory / "modis_first.csv", [row(), row(acq_time="2460")])
    second = write_csv(directory / "modis_second.csv", [row()])
    assert clean.clean_files([first, second], region, SCIENCE) == 1
    assert io.read_parquet(paths.raw_daily_counts("us"), "raw_daily_counts").n_raw_rows.sum() == 3


def test_region_polygon_and_bbox_fallback(tmp_path):
    region = replace(config.get_region("us"), bbox=[10, 10, 10.1, 10.1], polygon=None)
    cells = clean.region_cells(region, SCIENCE)
    assert cells
    assert all(h3.get_resolution(cell) == SCIENCE["grid"]["count_res"] for cell in cells)


def test_entrypoint_success_and_failure(monkeypatch, capsys):
    monkeypatch.setattr(clean, "run", lambda region: 12)
    assert entry.main(["--region", "us", "--steps", "clean"]) == 0
    assert "OK ingest us rows=12" in capsys.readouterr().out
    assert entry.main(["--region", "us", "--steps", "grid"]) == 1
    assert "grid is pending" in capsys.readouterr().err
