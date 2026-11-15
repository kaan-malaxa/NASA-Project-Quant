"""Tests for pipeline/stats/nowcast.py (R1 prompt C1) on fabricated NRT and history tables."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta

import pandas as pd
import pytest

from pipeline.stats.nowcast import (
    build_nowcast,
    percentile_rank,
    status_of,
    window_dates,
)
from pipeline.stats.tests.fabricate import (
    HEADER,
    SCIENCE,
    contract_validator,
    daily_table,
)

SCI = {**SCIENCE, "anomaly": {"low_activity_threshold": 5, "extreme_pct": 95, "above_pct": 75, "below_pct": 25}}
FETCHED = datetime(2026, 11, 15, 18, 0)         # us: local solar date 15 Nov at centroid and west edge
CONUS = {"centroid_lon": -95.85, "west_lon": -124.8}
CALIBRATION = {"k": {"noaa20": [{"month": m, "k": 0.5, "lo": 0.4, "hi": 0.6} for m in range(1, 13)]}}


def nrt_table(per_day: dict[date, int], fetched: datetime = FETCHED, first: date | None = None) -> pd.DataFrame:
    """celldays_nrt (5.7): one row per NOAA-20 daytime fire cell-day, plus a night row that must be ignored."""
    rows = []
    days = sorted(per_day) if first is None else [first + timedelta(i) for i in range((max(per_day) - first).days + 1)]
    for d in days:
        for i in range(per_day.get(d, 0)):
            rows.append(("noaa20", d, "D", f"86{i:013x}", f"85{i:013x}", 1, 5.0, 5.0, fetched))
        rows.append(("noaa20", d, "N", "86ffffffffffff", "85ffffffffffff", 1, 5.0, 5.0, fetched))
    return pd.DataFrame(rows, columns=["sensor", "local_day", "daynight", "h3_r6", "h3_r5", "n_det", "frp_sum",
                                       "frp_max", "fetched_at"])


def last_31_days(n: int) -> dict[date, int]:
    return {date(2026, 11, 14) - timedelta(i): n for i in range(31)}


def history(per_year_daily: dict[int, float] | float, last: date = date(2026, 11, 13)) -> pd.DataFrame:
    """Harmonized history whose value each day of year y is per_year_daily[y]."""
    def value(d: date) -> float:
        return per_year_daily if isinstance(per_year_daily, float | int) else per_year_daily.get(d.year, 0.0)
    return daily_table(date(2003, 1, 1), last, value, series=("harmonized",))


def run(nrt, hist, coverage=None, **kw):
    return build_nowcast(nrt, CALIBRATION, hist, coverage, "us", "Testland", CONUS["centroid_lon"],
                         CONUS["west_lon"], SCI, HEADER, **kw)


# ------------------------------------------------------------------ SD-11 pieces
def test_percentile_formula_and_ties():
    assert percentile_rank(10, [1, 2, 3, 4]) == 100.0
    assert percentile_rank(5, [3, 5, 5, 7]) == pytest.approx(100 * (1 + 0.5 * 2) / 4)
    assert percentile_rank(0, [0, 0, 0]) == 50.0


@pytest.mark.parametrize(("value", "pct", "past", "expected"), [
    (None, None, [1.0], "unavailable"),
    (2.0, 100.0, [0.0] * 23, "low_activity"),
    (2.0, 100.0, [0.0] * 20 + [9.0, 9.0, 9.0], "extreme"),      # p90 is not < 5: rank it
    (50.0, 95.0, [10.0], "extreme"),
    (50.0, 80.0, [10.0], "above_normal"),
    (50.0, 75.0, [10.0], "normal"),
    (50.0, 24.9, [10.0], "below_normal"),
    (50.0, 25.0, [10.0], "normal"),
])
def test_status_table_first_match_wins(value, pct, past, expected):
    assert status_of(value, pct, past, SCI["anomaly"]) == expected


def test_window_ends_yesterday_at_the_centroid():
    assert window_dates(FETCHED, -95.85, -124.8) == (date(2026, 11, 8), date(2026, 11, 14))


def test_window_never_ends_after_the_last_fully_present_day():
    # Centroid (-95.85) is already 00:30 on 15 Nov, but the west edge (-124.8) is still on 14 Nov.
    fetched = datetime(2026, 11, 15, 0, 30) + timedelta(hours=95.85 / 15)
    assert window_dates(fetched, -95.85, -124.8) == (date(2026, 11, 7), date(2026, 11, 13))


# ------------------------------------------------------------------ whole document
def test_value_beating_22_of_23_years_is_extreme():
    hist = history({y: float(y - 2002) for y in range(2003, 2027)})   # window sums 7 * (1..23)
    doc = run(nrt_table(last_31_days(45)), hist)                       # 7 days * 45 * 0.5 = 157.5
    assert doc["window"] == {"start": "2026-11-08", "end": "2026-11-14", "days_covered": 7}
    assert doc["value"] == pytest.approx(157.5)
    assert doc["lo"] == pytest.approx(126.0) and doc["hi"] == pytest.approx(189.0)
    assert len(doc["history"]) == 23
    assert doc["percentile"] == pytest.approx(95.652, abs=1e-3)
    assert doc["status"] == "extreme"
    assert doc["as_of"] == "2026-11-15T18:00:00Z"
    assert doc["kind"] == "harmonized"
    assert doc["sentence"] == ("In the 7 days to 14 November 2026, Testland had 158 Aqua-equivalent fire cell-days: "
                               "higher than 96% of the same week in 23 past years.")
    assert {h["kind"] for h in doc["history"] if h["year"] <= 2022} == {"observed"}


def test_ties_with_history_count_half():
    hist = history({y: (10.0 if y == 2010 else 1.0) for y in range(2003, 2027)})   # one year sums to 70
    doc = run(nrt_table(last_31_days(20)), hist)                                   # 7 * 20 * 0.5 = 70
    assert doc["value"] == pytest.approx(70.0)
    assert doc["percentile"] == pytest.approx(100 * (22 + 0.5) / 23)


def test_all_zero_history_and_value_two_is_low_activity():
    nrt = nrt_table({date(2026, 11, 10): 2, date(2026, 11, 12): 2}, first=date(2026, 10, 15))   # 4 * 0.5 = 2
    doc = run(nrt, history(0.0))
    assert doc["value"] == pytest.approx(2.0)
    assert doc["status"] == "low_activity"
    assert doc["sentence"] == "Too little burning at this time of year in Testland to rank this week."


def test_empty_nrt_is_unavailable_with_null_value():
    doc = run(nrt_table({}).iloc[0:0], history(1.0))
    assert doc["value"] is None and doc["lo"] is None and doc["percentile"] is None
    assert doc["status"] == "unavailable" and doc["kind"] == "missing" and doc["as_of"] is None
    assert doc["sentence"] == "No recent satellite data."
    assert [e.message for e in contract_validator("nowcast").iter_errors(json.loads(json.dumps(doc)))] == []


def test_uncovered_nrt_days_scale_or_make_the_week_unavailable():
    def cov(days):
        return pd.DataFrame({"sensor": "noaa20", "local_day": days, "covered": False, "reason": "outage_list"})
    two = run(nrt_table(last_31_days(10)), history(1.0), coverage=cov([date(2026, 11, 9), date(2026, 11, 10)]))
    assert two["window"]["days_covered"] == 5
    assert two["value"] == pytest.approx(5 * 10 * 0.5 * 7 / 5)
    three = run(nrt_table(last_31_days(10)), history(1.0),
                coverage=cov([date(2026, 11, 9), date(2026, 11, 10), date(2026, 11, 11)]))
    assert three["value"] is None and three["status"] == "unavailable"


def test_baseline_years_with_too_few_covered_days_are_skipped():
    gaps = [date(2007, 11, 8) + timedelta(i) for i in range(3)]             # 4 covered days in 2007's window
    hist = daily_table(date(2003, 1, 1), date(2026, 11, 13), 1.0, uncovered=gaps, series=("harmonized",))
    doc = run(nrt_table(last_31_days(10)), hist)
    assert [h["year"] for h in doc["history"]] == [y for y in range(2003, 2026) if y != 2007]


def test_month_to_date_uses_harmonized_then_nrt():
    # Harmonized 1.0/day through 13 Nov 2026; NRT gives 14 Nov = 2 * 0.5 = 1.0 -> 14 Nov days total 14.
    doc = run(nrt_table(last_31_days(2)), history(1.0))
    m = doc["month_to_date"]
    assert (m["month"], m["through_day"]) == (11, 14)
    assert m["value"] == pytest.approx(14.0) and m["median"] == pytest.approx(14.0)
    assert m["ratio"] == pytest.approx(1.0) and m["percentile"] == pytest.approx(50.0)


def test_document_validates_against_the_contract():
    doc = run(nrt_table(last_31_days(45)), history({y: float(y - 2002) for y in range(2003, 2027)}))
    text = json.dumps(doc, allow_nan=False)
    assert [e.message for e in contract_validator("nowcast").iter_errors(json.loads(text))] == []
