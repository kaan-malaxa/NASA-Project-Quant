import json
import logging
import time

import pytest

from pipeline.common import cli, config, log, paths


def test_paths_and_cli_override(tmp_path, monkeypatch):
    monkeypatch.setenv("FIREROSETTA_DATA_ROOT", str(tmp_path / "env"))
    assert paths.raw_dir("test") == tmp_path / "env" / "raw" / "test"
    parser = cli.stage_parser("ingest")
    args = parser.parse_args(["--region", "synthland", "--data-root", str(tmp_path / "cli"), "--pass", "N"])
    assert getattr(args, "pass") == "N"
    assert paths.data_root() == tmp_path / "cli"
    functions = {
        "detections": ("clean", "detections_aqua.parquet"),
        "celldays": ("grid", "celldays.parquet"), "coverage": ("grid", "coverage.parquet"),
        "hotspot_counts_daily": ("grid", "hotspot_counts_daily.parquet"),
        "region_cells": ("grid", "region_cells.parquet"), "static_mask": ("grid", "static_mask.parquet"),
        "celldays_nrt": ("grid", "celldays_nrt.parquet"), "daily": ("harmonized", "daily.parquet"),
        "annual_bootstrap": ("harmonized", "annual_bootstrap.parquet"),
        "calibration": ("harmonized", "calibration.json"), "validation_t1": ("harmonized", "validation_t1.json"),
        "naive_annual": ("harmonized", "naive_annual.parquet"), "curve": ("eyesight", "curve.json"),
        "daily_t2": ("eyesight", "daily_t2.parquet"), "validation_t2": ("eyesight", "validation_t2.json"),
        "manifest": ("raw", "MANIFEST.json"), "truth": ("raw", "truth.json"),
        "filter_log": ("clean", "filter_log.json"), "raw_daily_counts": ("clean", "raw_daily_counts.parquet"),
        "static_candidates": ("clean", "static_candidates.parquet"),
    }
    for name, (folder, filename) in functions.items():
        arguments = ("test", "aqua") if name == "detections" else ("test",)
        assert getattr(paths, name)(*arguments) == tmp_path / "cli" / folder / "test" / filename
    assert paths.web_data_dir("test") == paths.PROJECT_ROOT / "web" / "public" / "data" / "test"
    assert paths.harmonized_figures_dir("test") == paths.harmonized_dir("test") / "figures"
    assert paths.eyesight_figures_dir("test") == paths.eyesight_dir("test") / "figures"
    assert paths.tmp_dir() == tmp_path / "cli" / "tmp"
    assert paths.raw_csv("test", "modis", "country", 2023) == (
        tmp_path / "cli" / "raw" / "test" / "modis_country_2023.csv"
    )
    assert paths.env_file() == paths.PROJECT_ROOT / ".env"
    assert paths.region_polygon("test") == paths.config_file("regions") / "test.geojson"
    assert paths.natural_earth_source() == paths.tmp_dir() / "ne_10m_admin_1_states_provinces.geojson"
    candidates = paths.country_csv_candidates("modis", 2023, "United_States")
    assert candidates[0] == tmp_path / "cli" / "MODIS_data" / "modis_2023_United_States.csv"


def test_regions_and_science(tmp_path, monkeypatch):
    assert [r.id for r in config.load_regions()] == ["us", "synthland"]
    assert config.get_region("synthland").synthetic
    assert config.region_centroid("synthland") == (11.0, 11.0)
    with pytest.raises(ValueError, match="Unknown region"):
        config.get_region("unknown")
    monkeypatch.setattr(paths, "config_file", lambda name: tmp_path / name)
    with pytest.raises(FileNotFoundError, match="R3 must supply"):
        config.load_science()
    science = tmp_path / "science.yaml"
    science.write_text("seed: 7\n", encoding="utf-8")
    loaded = config.load_science()
    loaded["seed"] = 999
    assert config.load_science()["seed"] == 7
    assert science.read_text(encoding="utf-8") == "seed: 7\n"


def test_polygon_centroid(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "PROJECT_ROOT", tmp_path)
    polygon = {
        "type": "Polygon",
        "coordinates": [[[0, 0], [6, 0], [0, 6], [0, 0]]],
    }
    (tmp_path / "triangle.geojson").write_text(json.dumps(polygon), encoding="utf-8")
    region = config.Region("test", "Test", "ZZ", [0, 0, 6, 6], "triangle.geojson", "", "", True)
    assert config.region_centroid(region) == (2.0, 2.0)


def test_log_and_finish(capsys):
    logger = log.get_logger("test")
    assert logger is log.get_logger("test")
    assert len(logger.handlers) == 1
    assert logger.handlers[0].formatter.converter is time.gmtime
    assert isinstance(logger, logging.Logger)
    log.finish("test", "synthland", 12, time.perf_counter())
    output = capsys.readouterr().out
    assert output.startswith("OK test synthland rows=12 seconds=")
