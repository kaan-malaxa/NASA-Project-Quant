from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from pipeline.stats.nowcast import build_nowcast
from pipeline.stats.tests.fabricate import HEADER, SCIENCE, daily_table
from pipeline.stats.trend import bootstrap_replacer


def test_bootstrap_preserves_pre_2023_fills_and_correlations():
    draws = pd.DataFrame({"replicate": [0, 0, 1, 1], "year": [2020, 2024, 2020, 2024],
                          "harmonized": [10., 20., 30., 60.]})
    replace = bootstrap_replacer(draws)
    rng = np.random.default_rng(7)
    picked = [replace(rng) for _ in range(20)]
    assert {draw[2020] for draw in picked} == {10., 30.}
    assert all(draw[2024] == 2 * draw[2020] for draw in picked)


def metadata(end, fetched):
    start = end - timedelta(days=6)
    return {"start": start.isoformat(), "end": end.isoformat(), "fetched_at": fetched,
            "days": [{"local_day": (start + timedelta(days=i)).isoformat(), "covered": True} for i in range(7)]}


def test_covered_zero_nrt_survives_an_empty_retained_table_and_missing_calibration():
    nrt = pd.DataFrame(columns=["sensor", "daynight", "local_day", "fetched_at"])
    daily = daily_table(date(2003, 1, 1), date(2025, 12, 31), 0., series=("harmonized",))
    cal = {"k": {"noaa20": [{"month": m, "k": .5, "lo": .4, "hi": .6} for m in range(1, 13)]}}
    args = (nrt, cal, daily, None, "test", "Test", 0., 0., SCIENCE, HEADER)
    doc = build_nowcast(*args, metadata=metadata(date(2026, 11, 14), "2026-11-15T12:00:00Z"))
    assert doc["value"] == 0 and doc["window"]["days_covered"] == 7
    assert doc["status"] == "low_activity"
    cal["k"]["noaa20"] = []
    unavailable = build_nowcast(*args, metadata=metadata(date(2026, 11, 14), "2026-11-15T12:00:00Z"))
    assert unavailable["value"] is None and unavailable["kind"] == "missing"


def test_leap_year_end_comparison_uses_last_day_in_shorter_years():
    from pipeline.common.timebins import doy_window
    daily = pd.DataFrame({"local_day": pd.date_range("2023-12-25", "2023-12-31"), "value": 2.})
    assert doy_window(daily, 366, 7, 2023)["value"] == pytest.approx(14.)


def test_month_to_date_history_does_not_include_march_on_february_29():
    from pipeline.stats.nowcast import _history
    daily = pd.DataFrame({"local_day": pd.date_range("2023-02-01", "2023-03-01").date,
                          "value": [1.] * 28 + [1000.], "kind": "observed"})
    history = _history(daily, date(2024, 2, 29), 29, range(2023, 2024), 24, .8)
    assert history == [{"year": 2023, "value": 28., "kind": "observed"}]
