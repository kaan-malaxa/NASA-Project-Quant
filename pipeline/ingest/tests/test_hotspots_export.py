import csv
import gzip
import json
from datetime import date, datetime

import h3
import pandas as pd
import pyarrow as pa
import pytest

from pipeline.common import io, paths
from pipeline.ingest import hotspots_export as export

PREFIX = "https://example.invalid/releases/download/fabricated"
HEADER = [
    "latitude", "longitude", "acq_date", "acq_time", "satellite", "confidence",
    "frp", "daynight", "local_day", "h3_r6", "type", "product",
]


def detection(sensor="aqua", **changes):
    cell = h3.latlng_to_cell(40, -120, 6)
    row = {
        "latitude": 40.123456, "longitude": -120.123456,
        "acq_datetime_utc": datetime(2023, 7, 1, 1, 5), "local_day": date(2023, 6, 30),
        "daynight": "D", "frp": 2.3456, "confidence_raw": "90", "scan": 1.0, "track": 1.0,
        "sensor": sensor, "product": "SP", "type": 0,
        "h3_r6": cell, "h3_r5": h3.cell_to_parent(cell, 5),
        "h3_r8": h3.latlng_to_cell(40, -120, 8), "in_region": True,
    }
    if sensor in {"snpp", "noaa20"}:
        row["confidence_raw"] = "High"
    row.update(changes)
    return row


def write_detections(rows, sensor):
    frame = pa.Table.from_pylist(rows, schema=io.SCHEMAS["detections"]).to_pandas(types_mapper=pd.ArrowDtype)
    io.write_parquet(frame, paths.detections("us", sensor), "detections")


@pytest.fixture
def inputs(tmp_path, monkeypatch):
    monkeypatch.setenv("PROMETHEUS_TORCH_DATA_ROOT", str(tmp_path))
    for sensor in export.SENSORS:
        write_detections([], sensor)
    return tmp_path


def read_archive(path):
    with gzip.open(path, "rt", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        return reader.fieldnames, list(reader)


def test_counts_equal_in_region_sensor_year_and_csv_contract(inputs):
    rows = [
        detection(), detection(daynight="N"), detection(in_region=False),
        detection(acq_datetime_utc=datetime(2024, 1, 1, 1), local_day=date(2023, 12, 31)),
        detection(acq_datetime_utc=datetime(2024, 7, 1, 1), local_day=date(2024, 6, 30)),
    ]
    write_detections(rows, "aqua")
    write_detections([detection("snpp", type=None, product="NRT", daynight="N")], "snpp")
    write_detections([detection("noaa20")], "noaa20")
    write_detections([detection("terra", in_region=False)], "terra")
    before = {sensor: paths.detections("us", sensor).read_bytes() for sensor in export.SENSORS}
    fragment = export.run("us", PREFIX + "/")
    assert set(fragment) == {"schema_version", "region", "hotspot_archives"}
    assert fragment["schema_version"] == "1.0" and fragment["region"] == "us"
    assert [(entry["year"], entry["sensor"]) for entry in fragment["hotspot_archives"]] == [
        (2023, "aqua"), (2023, "noaa20"), (2023, "snpp"), (2024, "aqua"),
    ]
    for entry in fragment["hotspot_archives"]:
        path = paths.hotspot_archive("us", entry["sensor"], entry["year"])
        header, records = read_archive(path)
        source = io.read_parquet(paths.detections("us", entry["sensor"]), "detections")
        expected = source.loc[
            source.in_region & source.local_day.map(lambda day, year=entry["year"]: day.year == year)
        ]
        assert header == HEADER
        assert len(records) == entry["rows"] == len(expected)
        assert entry["bytes"] == path.stat().st_size
        assert entry["url"] == f"{PREFIX}/{path.name}"
        assert set(entry) == {"year", "sensor", "url", "rows", "bytes"}
    _, aqua = read_archive(paths.hotspot_archive("us", "aqua", 2023))
    assert len(aqua) == 3 and {row["daynight"] for row in aqua} == {"D", "N"}
    assert aqua[0]["latitude"] == "40.123" and aqua[0]["longitude"] == "-120.123"
    assert aqua[0]["frp"] == "2.346" and aqua[0]["acq_time"] == "0105"
    assert aqua[-1]["acq_date"] == "2024-01-01" and aqua[-1]["local_day"] == "2023-12-31"
    assert aqua[0]["satellite"] == "Aqua" and aqua[0]["confidence"] == "90"
    _, snpp = read_archive(paths.hotspot_archive("us", "snpp", 2023))
    assert snpp[0]["type"] == "" and snpp[0]["product"] == "NRT"
    assert snpp[0]["satellite"] == "N" and snpp[0]["confidence"] == "h"
    _, noaa20 = read_archive(paths.hotspot_archive("us", "noaa20", 2023))
    assert noaa20[0]["satellite"] == "N20" and noaa20[0]["type"] == "0"
    assert all(paths.detections("us", sensor).read_bytes() == data for sensor, data in before.items())


def test_repeat_exports_are_byte_identical_even_after_input_reordering(inputs):
    rows = [detection(frp=4.0), detection(daynight="N"), detection()]
    write_detections(rows, "aqua")
    fragment = export.run("us", PREFIX)
    path = paths.hotspot_archive("us", "aqua", 2023)
    first = path.read_bytes()
    write_detections(list(reversed(rows)), "aqua")
    assert export.run("us", PREFIX) == fragment
    assert path.read_bytes() == first
    assert first[4:8] == bytes(4)


def test_cli_stdout_is_only_json_and_completion_is_stderr(inputs, capsys):
    write_detections([detection()], "aqua")
    assert export.main(["--region", "us", "--url-prefix", PREFIX]) == 0
    captured = capsys.readouterr()
    assert json.loads(captured.out)["hotspot_archives"][0]["rows"] == 1
    assert captured.err.startswith("OK hotspots_export us rows=1 seconds=")


def test_missing_inputs_fail_without_creating_archives(inputs, capsys):
    paths.detections("us", "snpp").unlink()
    assert export.main(["--region", "us", "--url-prefix", PREFIX]) == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert "Missing cleaned detections: detections_snpp.parquet" in captured.err
    assert not paths.exports_dir().exists()


def test_schema_failure_keeps_old_archives(inputs):
    old = paths.hotspot_archive("us", "aqua", 2023)
    old.parent.mkdir(parents=True)
    old.write_bytes(b"previous archive")
    write_detections([detection()], "aqua")
    pd.DataFrame({"unexpected": [1]}).to_parquet(paths.detections("us", "noaa20"))
    with pytest.raises(ValueError, match="expected columns"):
        export.run("us", PREFIX)
    assert old.read_bytes() == b"previous archive"
    assert sorted(p.name for p in paths.exports_dir().iterdir()) == [old.name]


def test_mislabeled_sensor_is_rejected(inputs):
    write_detections([detection("snpp")], "aqua")
    with pytest.raises(ValueError, match="another sensor"):
        export.run("us", PREFIX)


def test_empty_clean_files_produce_empty_fragment(inputs):
    assert export.run("us", PREFIX)["hotspot_archives"] == []
    assert not list(paths.exports_dir().iterdir())


@pytest.mark.parametrize("prefix", ["relative/path", "file:///tmp/export", "https://example.invalid/?token=x"])
def test_invalid_prefix_is_rejected(inputs, prefix):
    with pytest.raises(ValueError, match="--url-prefix"):
        export.run("us", prefix)
    assert not paths.exports_dir().exists()
