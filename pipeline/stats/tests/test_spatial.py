"""Tests for pipeline/stats/spatial.py (R1 prompt D1): hex.json, outline.geojson, cells_monthly.csv.

The most important test is the cross-check: summing cells_monthly over all cells and applying the
eras and monthly k of calibration.json must reproduce monthly.json "harmonized" within 0.5 % for
every fully covered month. It runs on a fabricated mini-region always, and on synthland when the
synthland outputs exist (otherwise it is reported as skipped).
"""

from __future__ import annotations

import json
import os
from calendar import monthrange
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from pipeline.stats.calendar import calendar_rows
from pipeline.stats.spatial import (
    CELLS_MONTHLY_HEADER,
    cells_monthly_csv,
    cells_monthly_rows,
    hex_json,
    outline_geojson,
)
from pipeline.stats.tests.fabricate import HEADER, SCIENCE, contract_validator

REPO_ROOT = Path(__file__).resolve().parents[3]
COLUMNS = ["sensor", "local_day", "daynight", "h3_r6", "h3_r5", "n_det", "frp_sum", "frp_max"]


def celldays_rows(rows: list[tuple[str, date, str, str, str]]) -> pd.DataFrame:
    """(sensor, day, pass, h3_r6, h3_r5) -> a celldays.parquet table (5.2)."""
    return pd.DataFrame([(s, d, p, c6, c5, 1, 5.0, 5.0) for s, d, p, c6, c5 in rows], columns=COLUMNS)


# ------------------------------------------------------------------ the cross-check
def cross_check(cells: list[list], calibration: dict, monthly: list[dict], full_months: set[int]):
    """[(ym, from cells, monthly.json harmonized)] for every fully covered month in monthly."""
    sums: dict[int, list[int]] = {}
    for _, ym, a, v in cells:
        s = sums.setdefault(ym, [0, 0])
        s[0] += a
        s[1] += v
    k = {s: {row["month"]: row["k"] for row in calibration["k"][s]} for s in ("snpp", "noaa20")}

    def era_source(ym: int) -> str:
        first = date(ym // 100, ym % 100, 1)
        for era in calibration["eras"]:
            if date.fromisoformat(era["from"]) <= first and (era["to"] is None or first <= date.fromisoformat(era["to"])):
                return era["source"]
        raise AssertionError(f"no era covers {ym}")

    out = []
    for r in monthly:
        ym = r["year"] * 100 + r["month"]
        if r["series"] != "harmonized" or ym not in full_months or r["value"] is None:
            continue
        aqua, viirs = sums.get(ym, [0, 0])
        src = era_source(ym)
        from_cells = float(aqua) if src == "aqua" else viirs * k[src][r["month"]]
        out.append((ym, from_cells, r["value"]))
    return out


def fully_covered_months(daily: pd.DataFrame) -> set[int]:
    h = daily[daily["series"] == "harmonized"]
    days = pd.to_datetime(h["local_day"]).dt.date
    covered = dict(zip(days, h["value"].notna()))
    months = {d.year * 100 + d.month for d in covered}
    return {ym for ym in months
            if all(covered.get(date(ym // 100, ym % 100, dd), False)
                   for dd in range(1, monthrange(ym // 100, ym % 100)[1] + 1))}


def assert_within(rows, rel=0.005):
    assert rows, "no fully covered month to compare"
    bad = [(ym, a, b) for ym, a, b in rows if abs(a - b) > rel * max(abs(b), 1e-9)]
    assert bad == []


CALIBRATION = {
    "eras": [{"from": "2003-01-01", "to": "2022-12-31", "source": "aqua", "kind": "observed"},
             {"from": "2023-01-01", "to": "2025-12-31", "source": "snpp", "kind": "harmonized"},
             {"from": "2026-01-01", "to": None, "source": "noaa20", "kind": "harmonized"}],
    "k": {"snpp": [{"month": m, "k": 0.40 + 0.01 * m, "lo": 0.3, "hi": 0.6} for m in range(1, 13)],
          "noaa20": [{"month": m, "k": 0.45 + 0.01 * m, "lo": 0.3, "hi": 0.6} for m in range(1, 13)]},
}


def mini_region(seed: int = 3):
    """Fabricated celldays (3 res-5 cells x 4 res-6 children) and the harmonized daily table R3 would write."""
    rng = np.random.default_rng(seed)
    r6 = [(f"86{c5}{i}", f"85{c5}") for c5 in "abc" for i in range(4)]
    outage = {date(2022, 5, 3), date(2022, 5, 4), date(2022, 5, 5)}             # Aqua uncovered
    k = {s: {row["month"]: row["k"] for row in CALIBRATION["k"][s]} for s in ("snpp", "noaa20")}
    rows, harm = [], []
    start, end = date(2021, 1, 1), date(2026, 3, 31)
    for i in range((end - start).days + 1):
        d = start + timedelta(i)
        season = 1 + 3 * np.exp(-((d.timetuple().tm_yday - 220) ** 2) / 800)
        picks = {}
        for sensor, rate in (("aqua", 1.0), ("snpp", 2.5), ("noaa20", 2.4)):
            n = min(len(r6), int(rng.poisson(rate * season)))
            picks[sensor] = [r6[j] for j in rng.choice(len(r6), n, replace=False)]
            if sensor == "aqua" and d in outage:
                picks[sensor] = []
            rows += [(sensor, d, "D", c6, c5) for c6, c5 in picks[sensor]]
            rows += [(sensor, d, "N", c6, c5) for c6, c5 in picks[sensor][:1]]     # night: must be ignored
        if d <= date(2022, 12, 31):
            value = None if d in outage else float(len(picks["aqua"]))
            kind, source = "observed", "aqua"
        elif d <= date(2025, 12, 31):
            value, kind, source = len(picks["snpp"]) * k["snpp"][d.month], "harmonized", "snpp"
        else:
            value, kind, source = len(picks["noaa20"]) * k["noaa20"][d.month], "harmonized", "noaa20"
        harm.append((d, "harmonized", value, value, value, kind if value is not None else "missing",
                     source if value is not None else None, value is not None))
    daily = pd.DataFrame(harm, columns=["local_day", "series", "value", "lo", "hi", "kind", "source", "covered"])
    return celldays_rows(rows), daily


def test_cross_check_mini_region_reproduces_monthly_harmonized():
    celldays, daily = mini_region()
    monthly = calendar_rows(daily, "month", date(2026, 3, 31))
    full = fully_covered_months(daily)
    assert 202205 not in full                                   # the outage month is not compared
    rows = cross_check(cells_monthly_rows(celldays, SCIENCE), CALIBRATION, monthly, full)
    assert len(rows) == 63 - 1                                  # Jan 2021 .. Mar 2026, minus May 2022
    assert {ym // 100 for ym, _, _ in rows} == {2021, 2022, 2023, 2024, 2025, 2026}   # all three eras
    assert_within(rows)


def test_cross_check_detects_a_wrong_era():
    celldays, daily = mini_region()
    monthly = calendar_rows(daily, "month", date(2026, 3, 31))
    wrong = {**CALIBRATION, "eras": [{**CALIBRATION["eras"][0], "to": "2023-12-31"}, *CALIBRATION["eras"][1:]]}
    rows = cross_check(cells_monthly_rows(celldays, SCIENCE), wrong, monthly, fully_covered_months(daily))
    with pytest.raises(AssertionError):
        assert_within(rows)


def _data_root() -> Path:
    return Path(os.environ.get("PROMETHEUS_TORCH_DATA_ROOT", REPO_ROOT / "data"))


def test_cross_check_synthland_outputs():
    root = _data_root()
    needed = {"celldays": root / "grid" / "synthland" / "celldays.parquet",
              "calibration": root / "harmonized" / "synthland" / "calibration.json",
              "daily": root / "harmonized" / "synthland" / "daily.parquet"}
    absent = [str(p) for p in needed.values() if not p.is_file()]
    if absent:
        pytest.skip(f"synthland outputs not built yet: {', '.join(absent)}")
    celldays = pd.read_parquet(needed["celldays"])
    daily = pd.read_parquet(needed["daily"])
    calibration = json.loads(needed["calibration"].read_text(encoding="utf-8"))
    monthly_json = REPO_ROOT / "web" / "public" / "data" / "synthland" / "monthly.json"
    last = pd.to_datetime(daily["local_day"]).max().date()
    monthly = (json.loads(monthly_json.read_text(encoding="utf-8"))["rows"] if monthly_json.is_file()
               else calendar_rows(daily, "month", last))
    assert_within(cross_check(cells_monthly_rows(celldays, SCIENCE), calibration, monthly,
                              fully_covered_months(daily)))


# ------------------------------------------------------------------ cells_monthly.csv
def test_cells_monthly_primary_viirs_switches_after_snpp_through():
    rows = celldays_rows([
        ("snpp", date(2025, 12, 31), "D", "86x1", "85x"),       # counted (S-NPP era)
        ("noaa20", date(2025, 12, 31), "D", "86x2", "85x"),     # not counted (not primary yet)
        ("snpp", date(2026, 1, 1), "D", "86x1", "85x"),         # not counted (S-NPP era over)
        ("noaa20", date(2026, 1, 1), "D", "86x2", "85x"),       # counted
        ("aqua", date(2026, 1, 2), "D", "86x3", "85x"),
        ("aqua", date(2026, 1, 2), "N", "86x4", "85x"),         # night: ignored
        ("noaa20", date(2025, 11, 5), "D", "86y1", "85y"),      # only non-primary -> row with both zero: omitted
    ])
    assert cells_monthly_rows(rows, SCIENCE) == [["85x", 202512, 0, 1], ["85x", 202601, 1, 1]]


def test_cells_monthly_csv_header_and_lines():
    text = cells_monthly_csv([["85x", 202512, 0, 1]])
    assert text == ",".join(CELLS_MONTHLY_HEADER) + "\n85x,202512,0,1\n"


# ------------------------------------------------------------------ hex.json
def test_hex_means_per_year_in_critical_weeks_and_all_year():
    rows = []
    for y in range(2013, 2026):
        week30 = date(y, 1, 1) + timedelta(29 * 7)                # inside week 30
        rows += [("snpp", week30, "D", "86a1", "85a"), ("snpp", week30, "D", "86a2", "85a"),
                 ("snpp", date(y, 2, 1), "D", "86a1", "85a")]     # week 5: outside critical weeks
    rows += [("snpp", date(2012, 8, 1), "D", "86b1", "85b"),     # before the hex years
             ("snpp", date(2026, 8, 1), "D", "86b1", "85b"),     # after
             ("aqua", date(2015, 8, 1), "D", "86b1", "85b"),     # other sensor
             ("snpp", date(2015, 8, 1), "N", "86b1", "85b")]     # night
    doc = hex_json(celldays_rows(rows), [29, 30, 31], "testland", SCIENCE, HEADER)
    assert doc["cells"] == [{"h3": "85a", "critical": 2.0, "all_year": 3.0}]
    assert (doc["years"], doc["resolution"], doc["source"], doc["kind"]) == ([2013, 2025], 5, "snpp", "observed")
    assert [e.message for e in contract_validator("hex").iter_errors(json.loads(json.dumps(doc)))] == []


# ------------------------------------------------------------------ outline.geojson
REGION = {"id": "testland", "name": "Testland", "bbox": [-10.0, 40.0, 0.0, 45.0]}


def test_outline_falls_back_to_bbox_rectangle():
    fc = outline_geojson(REGION, None)
    (feature,) = fc["features"]
    assert fc["type"] == "FeatureCollection" and feature["properties"]["membership"] == "bbox"
    assert feature["geometry"]["coordinates"] == [[[-10.0, 40.0], [0.0, 40.0], [0.0, 45.0], [-10.0, 45.0],
                                                   [-10.0, 40.0]]]


def test_outline_merges_several_polygons_into_one_feature():
    square = [[[0, 0], [1, 0], [1, 1], [0, 0]]]
    src = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"name": "A"}, "geometry": {"type": "Polygon", "coordinates": square}},
        {"type": "Feature", "properties": {"name": "B"},
         "geometry": {"type": "MultiPolygon", "coordinates": [square, square]}}]}
    (feature,) = outline_geojson(REGION, src)["features"]
    assert feature["geometry"]["type"] == "MultiPolygon" and len(feature["geometry"]["coordinates"]) == 3
    assert feature["properties"] == {"id": "testland", "name": "Testland", "membership": "polygon"}


def test_outline_keeps_a_single_polygon():
    square = {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]}
    (feature,) = outline_geojson(REGION, {"type": "Feature", "properties": {}, "geometry": square})["features"]
    assert feature["geometry"] == square
