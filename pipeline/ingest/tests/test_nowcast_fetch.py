import csv
import json
import os
from dataclasses import replace
from datetime import date, timedelta
from pathlib import Path

import h3
import pandas as pd
import pytest
import requests

from pipeline.common import config, io, paths
from pipeline.ingest import clean, download
from pipeline.ingest import nowcast_fetch as nowcast

NOW = pd.Timestamp("2026-11-15T12:00:00Z")
SCIENCE = {
    "timebins": {"solar_degrees_per_hour": 15},
    "filters": {"modis_min_confidence": 30, "viirs_keep": ["n", "h"]},
    "grid": {"count_res": 6, "map_res": 5, "mask_res": 8},
}


@pytest.fixture
def environment(tmp_path, monkeypatch):
    region = replace(config.get_region("us"), bbox=[-121, 39, -119, 41], polygon=None)
    monkeypatch.setattr(config, "get_region", lambda region_id: region)
    monkeypatch.setattr(config, "region_centroid", lambda region: (-120, 40))
    monkeypatch.setattr(config, "load_science", lambda: SCIENCE)
    monkeypatch.setenv("FIREROSETTA_DATA_ROOT", str(tmp_path / "derived"))
    source = tmp_path / "originals"
    source.mkdir()
    monkeypatch.setattr(paths, "source_data_root", lambda: source)
    monkeypatch.setattr(paths, "PROJECT_ROOT", tmp_path / "project")
    outages = paths.config_file("outages.yaml")
    outages.parent.mkdir(parents=True)
    outages.write_text("outages: []\n", encoding="utf-8")
    monkeypatch.setattr(clean, "region_cells", lambda *args: {h3.latlng_to_cell(40, -120, 6)})
    paths.tmp_dir().mkdir(parents=True)
    io.write_parquet(clean.typed(pd.DataFrame(), "static_mask"), paths.static_mask("us"), "static_mask")
    return source


def input_csv(directory, days=31, *, version="2NRT", satellite="N20"):
    path = directory / "nrt_viirs_noaa20_fixture.csv"
    start = date(2026, 10, 15)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["latitude", "longitude", "acq_date", "acq_time", "satellite",
                         "instrument", "version", "confidence", "daynight", "frp", "scan", "track"])
        for offset in range(days):
            writer.writerow([40, -120, start + timedelta(days=offset), "1200", satellite,
                             "VIIRS", version, "n", "D", 2, 1, 1])
    return path


def previous_outputs():
    values = {
        paths.celldays_nrt("us"): b"old parquet",
        paths.hotspots_recent("us"): b"old csv",
        paths.manifest("us"): b"[]\n",
    }
    for path, content in values.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    return values


def assert_unchanged(before):
    assert all(path.read_bytes() == content for path, content in before.items())


def test_windows_cover_31_complete_local_days_once():
    start, end = nowcast.recent_window(NOW, -120, 31)
    assert (start, end) == (date(2026, 10, 15), date(2026, 11, 14))
    days = [first + timedelta(days=i) for first, last in download.api_windows(start, end)
            for i in range((last - first).days + 1)]
    assert len(days) == len(set(days)) == 31
    assert days == list(pd.date_range(start, end).date)
    with pytest.raises(nowcast.NowcastUnavailable):
        nowcast.recent_window(NOW, -120, 0)


def test_no_genuine_nrt_leaves_outputs_and_country_files_untouched(environment):
    previous = previous_outputs()
    historical = environment / "viirs-jpss1_2025_United_States.csv"
    historical.write_text("historical file must not be used", encoding="utf-8")
    with pytest.raises(nowcast.NowcastUnavailable, match="No genuine local"):
        nowcast.run("us", 31, now=NOW)
    assert_unchanged(previous)
    assert historical.read_text(encoding="utf-8") == "historical file must not be used"


def test_missing_day_keeps_previous_outputs(environment):
    input_csv(environment, days=30)
    previous = previous_outputs()
    with pytest.raises(nowcast.NowcastUnavailable, match="2026-11-14"):
        nowcast.run("us", 31, now=NOW)
    assert_unchanged(previous)


def test_sp_renamed_to_nrt_is_rejected(environment):
    input_csv(environment, version="2")
    previous = previous_outputs()
    with pytest.raises(nowcast.NowcastUnavailable, match="provenance"):
        nowcast.run("us", 31, now=NOW)
    assert_unchanged(previous)


def test_fake_http_failure_preserves_all_outputs_and_redacts_key(environment, monkeypatch, capsys):
    input_csv(environment)
    previous = previous_outputs()
    def fail(local_paths):
        assert all(isinstance(path, Path) for path in local_paths)
        raise requests.HTTPError("https://example.invalid/private-key")
    original = nowcast.run
    monkeypatch.setattr(nowcast, "run", lambda region, days: original(region, days, now=NOW, fetch=fail))
    assert nowcast.main(["--region", "us"]) == 1
    output = capsys.readouterr()
    assert "private-key" not in output.err + output.out
    assert "HTTPError" in output.err
    assert_unchanged(previous)


def test_success_uses_clean_mask_membership_and_contract_header(environment):
    source = input_csv(environment)
    before = source.read_bytes()
    assert nowcast.run("us", 31, now=NOW) == 31
    assert source.read_bytes() == before
    with paths.hotspots_recent("us").open(encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        assert next(reader) == [
            "latitude", "longitude", "acq_date", "acq_time", "satellite",
            "confidence", "frp", "daynight", "local_day", "h3_r6",
        ]
        rows = list(reader)
    assert len(rows) == 31 and rows[0][3] == "1200" and rows[0][4] == "N20"
    frame = io.read_parquet(paths.celldays_nrt("us"), "celldays_nrt")
    assert len(frame) == 31 and frame.sensor.eq("noaa20").all()
    assert frame.n_det.eq(1).all()
    assert frame.fetched_at.iloc[0] == NOW.tz_localize(None)
    assert not paths.detections("us", "noaa20").exists()
    assert not paths.filter_log("us").exists()
    entries = json.loads(paths.manifest("us").read_text(encoding="utf-8"))
    assert entries[0]["source"] == "VIIRS_NOAA20_NRT" and entries[0]["via"] == "local"
    assert entries[0]["rows"] == 31
    download.update_manifest("us")
    assert len(json.loads(paths.manifest("us").read_text(encoding="utf-8"))) == 1
    assert nowcast.run("us", 31, now=NOW) == 31
    assert json.loads(paths.manifest("us").read_text(encoding="utf-8"))[0]["rows"] == 31


def test_static_mask_can_remove_every_recent_detection(environment):
    input_csv(environment)
    seed = h3.latlng_to_cell(40, -120, 8)
    io.write_parquet(clean.typed(pd.DataFrame({"h3_r8": [seed]}), "static_mask"),
                     paths.static_mask("us"), "static_mask")
    assert nowcast.run("us", 31, now=NOW) == 0
    assert io.read_parquet(paths.celldays_nrt("us"), "celldays_nrt").empty
    assert paths.hotspots_recent("us").read_text(encoding="utf-8").strip() == ",".join(nowcast.HOTSPOT_HEADER)


def test_invalid_coordinates_do_not_break_solar_date_conversion(environment):
    source = input_csv(environment)
    with source.open("a", encoding="utf-8", newline="") as handle:
        csv.writer(handle).writerow([999, "inf", "2026-11-14", "1200", "N20",
                                    "VIIRS", "2NRT", "n", "D", 2, 1, 1])
    assert nowcast.run("us", 31, now=NOW) == 31


def test_missing_mask_and_wrong_sensor_preserve_outputs(environment):
    input_csv(environment)
    previous = previous_outputs()
    paths.static_mask("us").unlink()
    with pytest.raises(nowcast.NowcastUnavailable, match="static_mask"):
        nowcast.run("us", 31, now=NOW)
    assert_unchanged(previous)
    input_csv(environment, satellite="N")
    with pytest.raises(nowcast.NowcastUnavailable, match="other than NOAA-20"):
        nowcast.run("us", 31, now=NOW)
    assert_unchanged(previous)


def test_declared_noaa20_outage_blocks_refresh(environment):
    input_csv(environment)
    previous = previous_outputs()
    paths.config_file("outages.yaml").write_text(
        'outages: [{sensor: noaa20, start: "2026-11-01", end: "2026-11-02"}]\n', encoding="utf-8",
    )
    with pytest.raises(nowcast.NowcastUnavailable, match="declared NOAA-20 outage"):
        nowcast.run("us", 31, now=NOW)
    assert_unchanged(previous)


def test_publication_failure_rolls_back_earlier_replacements(tmp_path, monkeypatch):
    old, new = {}, {}
    for name in ("one", "two"):
        destination = tmp_path / name
        destination.write_text("old " + name, encoding="utf-8")
        source = tmp_path / (name + ".new")
        source.write_text("new " + name, encoding="utf-8")
        old[destination] = destination.read_bytes()
        new[destination] = source
    replace_file = os.replace
    failed = False
    def fail_once(source, destination):
        nonlocal failed
        if Path(destination).name == "two" and not failed:
            failed = True
            raise OSError("simulated publication failure")
        return replace_file(source, destination)
    monkeypatch.setattr(os, "replace", fail_once)
    with pytest.raises(OSError):
        nowcast.publish(new)
    assert_unchanged(old)


def test_clean_historical_run_does_not_consume_nrt_only_manifest(environment):
    input_csv(environment)
    nowcast.run("us", 31, now=NOW)
    with pytest.raises(ValueError, match="No verified historical"):
        clean.run("us")
