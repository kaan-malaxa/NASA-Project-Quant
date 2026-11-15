import json
from dataclasses import replace
from datetime import date, datetime

import h3
import pandas as pd
import pytest

from pipeline.common import config, io, paths
from pipeline.ingest import __main__ as entry
from pipeline.ingest import clean, coverage, grid, static_mask

SCIENCE = {
    "grid": {"count_res": 6, "map_res": 5, "mask_res": 8},
    "static_mask": {"min_static_detections": 3, "dilate_rings": 1},
    "eras": {"record_start": "2023-01-01", "snpp_first_day": "2023-01-01"},
}


def detections(types=(0, 0), inside=True):
    cell = h3.latlng_to_cell(11, 11, 6)
    fine = h3.latlng_to_cell(11, 11, 8)
    rows = [{
        "latitude": 11 + i * 0.00001, "longitude": 11,
        "acq_datetime_utc": datetime(2023, 1, 3, 12, i), "local_day": date(2023, 1, 3),
        "daynight": "D", "frp": i + 1.0, "confidence_raw": "n", "scan": 1.0, "track": 1.0,
        "sensor": "snpp", "product": "NRT" if value is None else "SP", "type": value,
        "h3_r6": cell, "h3_r5": h3.cell_to_parent(cell, 5), "h3_r8": fine, "in_region": inside,
    } for i, value in enumerate(types)]
    return clean.typed(pd.DataFrame(rows), "detections")


def test_two_pixels_one_cell_day():
    cells, counts = grid.aggregate_detections({"snpp": detections()})
    assert len(cells) == 1
    assert cells.n_det.iloc[0] == 2
    assert cells.frp_sum.iloc[0] == 3.0
    assert cells.frp_max.iloc[0] == 2.0
    assert counts.n_det_all.iloc[0] == 2
    assert cells.sensor.iloc[0] == "snpp"


def test_static_mask_threshold_dilation_and_null_only():
    frame = detections((None, 0))
    seed = frame.h3_r8.iloc[0]
    candidates = clean.typed(pd.DataFrame({"h3_r8": [seed], "n_static": [3]}), "static_candidates")
    mask = static_mask.build_mask(candidates, SCIENCE)
    assert set(mask.h3_r8) == set(h3.grid_disk(seed, 1))
    filtered = static_mask.apply_mask(frame, set(mask.h3_r8))
    assert len(filtered) == 1 and filtered["type"].iloc[0] == 0
    candidates = clean.typed(pd.DataFrame({"h3_r8": [seed], "n_static": [2]}), "static_candidates")
    assert static_mask.build_mask(candidates, SCIENCE).empty


def test_coverage_outages_missing_bounds_and_fixed_snpp_start():
    raw = clean.typed(pd.DataFrame({
        "sensor": ["aqua", "aqua", "snpp", "snpp"],
        "utc_date": [date(2023, 1, 3), date(2023, 1, 5)] * 2,
        "n_raw_rows": [1, 1, 1, 1],
    }), "raw_daily_counts")
    result = coverage.build_coverage(raw, date(2023, 1, 6), SCIENCE, [
        {"sensor": "aqua", "start": "2023-01-05", "end": None},
    ])
    aqua = result.loc[result.sensor.eq("aqua")].set_index("local_day")
    assert aqua.loc[date(2023, 1, 1), "reason"] == "before_start"
    assert aqua.loc[date(2023, 1, 3), "covered"]
    assert aqua.loc[date(2023, 1, 4), "reason"] == "no_raw_rows"
    assert aqua.loc[date(2023, 1, 5), "reason"] == "outage_list"
    assert aqua.loc[date(2023, 1, 6), "reason"] == "after_end"
    snpp = result.loc[result.sensor.eq("snpp")].set_index("local_day")
    assert snpp.loc[date(2023, 1, 1), "reason"] == "no_raw_rows"
    assert len(result) == 24
    assert not result.loc[result.sensor.eq("noaa20"), "covered"].any()


def test_empty_aggregation_and_out_of_region():
    cells, counts = grid.aggregate_detections({"snpp": detections(inside=False)})
    assert cells.empty and counts.empty
    assert grid.aggregate_detections({})[0].empty


def test_grid_end_to_end_rewrites_masked_rows_and_is_idempotent(tmp_path, monkeypatch):
    monkeypatch.setenv("FIREROSETTA_DATA_ROOT", str(tmp_path))
    region = replace(config.get_region("us"), bbox=[10.99, 10.99, 11.01, 11.01], polygon=None)
    monkeypatch.setattr(config, "get_region", lambda region_id: region)
    monkeypatch.setattr(config, "load_science", lambda: SCIENCE)
    source = detections((None, 0))
    seed = source.h3_r8.iloc[0]
    for sensor in clean.SENSORS:
        frame = source if sensor == "snpp" else clean.typed(pd.DataFrame(), "detections")
        io.write_parquet(frame, paths.detections("us", sensor), "detections")
    io.write_parquet(clean.typed(pd.DataFrame({
        "h3_r8": [seed], "n_static": [3],
    }), "static_candidates"), paths.static_candidates("us"), "static_candidates")
    io.write_parquet(clean.typed(pd.DataFrame({
        "sensor": ["snpp"], "utc_date": [date(2023, 1, 3)], "n_raw_rows": [2],
    }), "raw_daily_counts"), paths.raw_daily_counts("us"), "raw_daily_counts")
    io.write_json([], paths.filter_log("us"))
    assert grid.run("us") == 1
    assert len(io.read_parquet(paths.detections("us", "snpp"), "detections")) == 1
    assert io.read_parquet(paths.celldays("us"), "celldays").n_det.iloc[0] == 1
    members = io.read_parquet(paths.region_cells("us"), "region_cells")
    assert members.attrs["membership"] == "bbox"
    assert all(h3.get_resolution(cell) == 6 for cell in members.h3_r6)
    logs_before = paths.filter_log("us").read_bytes()
    assert grid.run("us") == 1
    assert paths.filter_log("us").read_bytes() == logs_before
    logs = json.loads(logs_before)
    assert next(row for row in logs if row["sensor"] == "snpp")["rows_dropped"] == 1


def test_entrypoint_runs_clean_before_grid(monkeypatch):
    calls = []
    monkeypatch.setattr(clean, "run", lambda region: calls.append("clean") or 2)
    monkeypatch.setattr(grid, "run", lambda region: calls.append("grid") or 1)
    assert entry.main(["--region", "us"]) == 0
    assert calls == ["clean", "grid"]
    calls.clear()
    assert entry.main(["--region", "us", "--steps", "grid"]) == 0
    assert calls == ["grid"]
    assert entry.main(["--region", "us", "--steps", "grid,clean"]) == 1


def test_negative_raw_counts_rejected():
    raw = pd.DataFrame({"sensor": ["aqua"], "utc_date": [date(2023, 1, 1)], "n_raw_rows": [-1]})
    with pytest.raises(ValueError, match="negative"):
        coverage.build_coverage(raw, date(2023, 1, 3), SCIENCE, [])


def test_absent_snpp_uses_fixed_start_and_missing_raw_rows():
    raw = clean.typed(pd.DataFrame(), "raw_daily_counts")
    result = coverage.build_coverage(raw, date(2023, 1, 2), SCIENCE, [])
    snpp = result.loc[result.sensor.eq("snpp")]
    assert set(snpp.reason) == {"no_raw_rows"}
    assert not snpp.covered.any()
