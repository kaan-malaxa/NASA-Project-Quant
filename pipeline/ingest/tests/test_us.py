"""Fabricated country-export fixtures exercise the real US ingestion and IO."""

import csv
from datetime import date

import h3
import pandas as pd
import pytest

from pipeline.common import config, io, paths
from pipeline.harmonize.__main__ import run_region
from pipeline.ingest.us import ingest_us

COLUMNS = [
    "latitude",
    "longitude",
    "acq_date",
    "acq_time",
    "satellite",
    "instrument",
    "confidence",
    "frp",
    "daynight",
    "type",
]


def write_csv(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(COLUMNS)
        writer.writerows(rows)


@pytest.fixture
def local_us(tmp_path, monkeypatch):
    root = tmp_path / "data"
    monkeypatch.setattr(paths, "source_root", lambda: root)
    monkeypatch.setenv("FIREROSETTA_DATA_ROOT", str(tmp_path / "derived"))
    aqua = [38, -100, "2019-01-01", "1800", "Aqua", "MODIS", 30, 4, "D", 0]
    terra = [38, -100, "2019-01-01", "1800", "Terra", "MODIS", 40, 3, "D", 0]
    low = aqua.copy()
    low[0], low[6] = 39, 29
    static = [
        [40, -101, "2019-01-01", time, "Aqua", "MODIS", 80, 2, "D", 2] for time in ("1800", "1801", "1802")
    ]
    nrt = [40, -101, "2019-01-01", "1900", "N", "VIIRS", "n", 2, "D", None]
    snpp = [
        [38, -100, "2019-01-01", "1800", "N", "VIIRS", "n", 2, "D", 0],
        [38.0001, -100.0001, "2019-01-01", "1801", "N", "VIIRS", "High", 2, "D", 0],
        nrt,
    ]
    noaa = [[38, -100, "2019-01-01", "1800", "N20", "VIIRS", "n", 4, "D", 0]]
    write_csv(root / "MODIS_data/modis_2019_United_States.csv", [aqua, aqua, terra, low, *static])
    write_csv(root / "VIIRS-SNPP_data/viirs-snpp_2019_United_States.csv", snpp)
    write_csv(root / "VIIRS-JPSS_data/viirs-jpss1_2019_United_States.csv", noaa)
    return root


def test_real_ingestion_filters_cells_coverage_and_provenance(local_us):
    assert ingest_us("united_states") == 4
    frame = io.read_parquet(paths.celldays("united_states"), "celldays")
    counts = frame.set_index("sensor")["n_det"].to_dict()
    assert counts == {"aqua": 1, "terra": 1, "snpp": 2, "noaa20": 1}
    assert frame.loc[frame["sensor"].eq("snpp"), "frp_sum"].iloc[0] == 4
    mask = io.read_parquet(paths.grid_dir("united_states") / "static_mask.parquet", "static_mask")
    assert h3.latlng_to_cell(40, -101, config.load_science()["grid"]["mask_res"]) in set(mask["h3_r8"])
    coverage = io.read_parquet(paths.coverage("united_states"), "coverage")
    assert coverage.loc[coverage["local_day"].eq(date(2019, 1, 1)), "covered"].all()
    assert not coverage.loc[coverage["local_day"].eq(date(2003, 1, 1)), "covered"].any()
    io.verify_us_inputs("united_states")
    rows = io.read_json(paths.raw_dir("united_states") / "MANIFEST.json")
    assert len(rows) == 3
    assert all(row["file"].endswith("_United_States.csv") for row in rows)
    first = frame.copy(deep=True)
    ingest_us("united_states")
    pd.testing.assert_frame_equal(first, io.read_parquet(paths.celldays("united_states"), "celldays"))


def test_other_country_files_are_not_read_and_source_symlinks_cannot_escape(local_us, tmp_path):
    write_csv(local_us / "MODIS_data/modis_2019_Canada.csv", [[99, 99, "invalid"]])
    assert len(io.source_inventory()) == 3
    foreign = tmp_path / "outside.csv"
    foreign.write_text("not US data", encoding="utf-8")
    link = local_us / "MODIS_data/modis_2020_United_States.csv"
    try:
        link.symlink_to(foreign)
    except OSError:
        pytest.skip("This platform does not permit test symlinks")
    with pytest.raises(ValueError, match="escapes"):
        paths.source_files()
    link.unlink()
    link.symlink_to(local_us / "MODIS_data/modis_2019_Canada.csv")
    with pytest.raises(ValueError, match="symlinks"):
        paths.source_files()


def test_stale_us_sources_and_derived_inputs_fail(local_us):
    ingest_us("united_states")
    output = paths.celldays("united_states")
    with output.open("ab") as stream:
        stream.write(b"changed")
    with pytest.raises(ValueError, match="derived input changed"):
        io.verify_us_inputs("united_states")
    ingest_us("united_states")
    source = local_us / "MODIS_data/modis_2019_United_States.csv"
    with source.open("a", encoding="utf-8") as stream:
        stream.write("\n")
    with pytest.raises(ValueError, match="source inventory changed"):
        io.verify_us_inputs("united_states")


def test_us_ingestion_to_harmonization_uses_real_shared_modules(local_us):
    for year in range(2013, 2023):
        for folder, prefix, satellite, instrument, confidence, repeats in (
            ("MODIS_data", "modis", "Aqua", "MODIS", 80, 1),
            ("VIIRS-SNPP_data", "viirs-snpp", "N", "VIIRS", "n", 2),
            ("VIIRS-JPSS_data", "viirs-jpss1", "N20", "VIIRS", "n", 3),
        ):
            rows = [
                [38 + offset, -100, f"{year}-01-01", "1800", satellite, instrument, confidence, 4, "D", 0]
                for offset in range(repeats)
            ]
            write_csv(local_us / folder / f"{prefix}_{year}_United_States.csv", rows)
    ingest_us("united_states")
    result = run_region("united_states")
    assert result.calibration["region"] == "united_states"
    assert result.calibration["k_annual"]["snpp"]["k"] == 0.5
    assert result.bootstrap.size == config.load_science()["tier1"]["bootstrap_b"]
    assert (paths.harmonized_dir("united_states") / "annual_bootstrap.parquet").exists()
    assert (paths.harmonized_dir("united_states") / "naive_annual.parquet").exists()
    with pytest.raises(ValueError, match="US-only"):
        run_region("punjab")
