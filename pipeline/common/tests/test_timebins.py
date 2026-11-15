from datetime import UTC, date, datetime, timedelta

import numpy as np
import pandas as pd
import pytest

from pipeline.common import timebins


def daily(year=2023):
    dates = pd.date_range(f"{year}-01-01", f"{year}-12-31")
    return pd.DataFrame({
        "local_day": dates, "value": 2.0, "lo": 1.0, "hi": 3.0,
        "kind": "observed", "source": "aqua",
    })


@pytest.mark.parametrize("year", [2023, 2024])
def test_weeks(year):
    assert timebins.week_of_year(date(year, 1, 1)) == 1
    assert timebins.week_of_year(date(year, 12, 31)) == 52
    assert timebins.week_of_year(date(year, 1, 1) + timedelta(days=356)) == 51
    assert timebins.week_of_year(date(year, 1, 1) + timedelta(days=357)) == 52
    assert timebins.days_in_week(year, 1) == 7
    assert timebins.days_in_week(year, 52) == (9 if year == 2024 else 8)
    result = timebins.aggregate(daily(year), "week")
    assert len(result) == 52
    assert result.value.eq(14).all()
    assert result.lo.eq(7).all()
    assert result.hi.eq(21).all()
    assert not result.missing.any()


@pytest.mark.parametrize("nulls,missing", [(3, True), (2, False)])
def test_week_coverage(nulls, missing):
    frame = daily().iloc[:7].copy()
    frame.loc[:nulls - 1, ["value", "lo", "hi"]] = np.nan
    result = timebins.aggregate(frame, "week").iloc[0]
    assert result.missing == missing
    assert result.n_covered == 7 - nulls
    if missing:
        assert pd.isna(result.value)
        assert result.kind == "missing"
    else:
        assert result.value == 14
        assert result.kind == "observed"


def test_month_coverage_boundary():
    # April: 24/30 = exactly 80%.
    april = daily().loc[lambda frame: frame.local_day.dt.month.eq(4)].copy()
    april.iloc[:6, april.columns.get_loc("value")] = np.nan
    assert timebins.aggregate(april, "month").iloc[0].value == 60
    april.iloc[6, april.columns.get_loc("value")] = np.nan
    assert timebins.aggregate(april, "month").iloc[0].missing
    # A leap February with 23/29 days is 79% after whole-percent rounding.
    february = daily(2024).loc[lambda frame: frame.local_day.dt.month.eq(2)].copy()
    february.iloc[:6, february.columns.get_loc("value")] = np.nan
    assert round(100 * february.value.notna().mean()) == 79
    assert timebins.aggregate(february, "month").iloc[0].missing


@pytest.mark.parametrize("year", [2023, 2024])
def test_annual_coverage(year):
    frame = daily(year)
    frame.loc[:19, ["value", "lo", "hi"]] = np.nan
    result = timebins.aggregate(frame, "year").iloc[0]
    assert result.value == len(frame) * 2
    assert result.n_covered == len(frame) - 20
    frame.loc[:39, ["value", "lo", "hi"]] = np.nan
    assert timebins.aggregate(frame, "year").iloc[0].missing


def test_local_solar_day():
    assert timebins.local_day(datetime(2024, 1, 1, 20, tzinfo=UTC), 75) == date(2024, 1, 2)
    assert timebins.local_day(datetime(2024, 1, 1, 1, tzinfo=UTC), -120) == date(2023, 12, 31)
    result = timebins.local_day(
        pd.Series(pd.to_datetime(["2024-01-01T20:00Z", "2024-01-01T01:00Z"])),
        pd.Series([75, -120]),
    )
    assert result.tolist() == [date(2024, 1, 2), date(2023, 12, 31)]


def test_omitted_days_are_uncovered_and_majority_is_deterministic():
    frame = daily().iloc[:5].copy()
    frame["kind"] = ["harmonized", "harmonized", "observed", "observed", "observed"]
    frame["source"] = ["snpp", "snpp", "aqua", "aqua", "aqua"]
    result = timebins.aggregate(frame, "week").iloc[0]
    assert result.n_days == 7
    assert result.n_covered == 5
    assert result.value == 14
    assert result.kind == "observed" and result.source == "aqua"


def test_explicit_uncovered_does_not_become_zero():
    frame = daily().iloc[:7].copy()
    frame["covered"] = [False] * 3 + [True] * 4
    assert timebins.aggregate(frame, "week").iloc[0].missing


def test_window_crosses_year_and_scales():
    frame = pd.DataFrame({
        "local_day": pd.date_range("2023-12-28", "2024-01-03"), "value": 2.0,
    })
    frame.loc[:1, "value"] = np.nan
    result = timebins.doy_window(frame, end_doy=3, n_days=7, year=2024)
    assert result["value"] == 14
    assert result["n_covered"] == 5


def test_invalid_dates_and_grains():
    with pytest.raises(ValueError, match="one valid row"):
        timebins.aggregate(pd.concat([daily().iloc[:1]] * 2), "week")
    with pytest.raises(ValueError, match="Unknown grain"):
        timebins.aggregate(daily(), "day")
    with pytest.raises(ValueError):
        timebins.days_in_week(2024, 53)
