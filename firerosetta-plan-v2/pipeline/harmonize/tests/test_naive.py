"""Hand-counted hotspot totals and sensor coverage; no other stage is needed."""

import numpy as np
import pandas as pd
import pytest
from pandas.testing import assert_frame_equal

from pipeline.harmonize.naive import naive_annual
from pipeline.harmonize.tests.fabricate import annual_aggregate_spy


@pytest.fixture
def tables():
    days = pd.date_range("2019-01-01", "2019-12-31")
    sensors = ("aqua", "terra", "snpp", "noaa20")
    hotspots = pd.DataFrame(
        [
            (sensor, day.date(), 4 * offset + number + 1)
            for offset, day in enumerate(days[:5])
            for number, sensor in enumerate(sensors)
        ],
        columns=["sensor", "local_day", "n_det_all"],
    )
    coverage = pd.DataFrame(
        [(sensor, day.date(), True, "ok") for day in days for sensor in sensors],
        columns=["sensor", "local_day", "covered", "reason"],
    )
    science = {"eras": {"record_start": "2019-01-01"}}
    return hotspots, coverage, science


def test_twenty_rows_match_hand_count_and_never_add_noaa(tables):
    hotspots, coverage, science = tables
    assert len(hotspots) == 20
    before = hotspots.copy(deep=True)
    aggregate = annual_aggregate_spy()
    result = naive_annual(hotspots, coverage, science, 2019, aggregate=aggregate)
    assert result.to_dict("records") == [
        {
            "year": 2019,
            "modis_count": 95.0,
            "snpp_count": 55.0,
            "modis_covered_frac": 1.0,
            "snpp_covered_frac": 1.0,
        }
    ]
    # Aqua=1+5+9+13+17=45; Terra=2+6+10+14+18=50; S-NPP=3+7+11+15+19=55.
    assert aggregate.call_count == 2
    assert all(call.kwargs["grain"] == "year" for call in aggregate.call_args_list)
    assert_frame_equal(hotspots, before)


def test_union_coverage_ignores_uncovered_sensor_counts_and_scales(tables):
    hotspots, coverage, science = tables
    coverage = coverage.copy()
    d2, d3 = pd.Timestamp("2019-01-02").date(), pd.Timestamp("2019-01-03").date()
    coverage.loc[coverage["sensor"].eq("terra") & coverage["local_day"].eq(d2), "covered"] = False
    coverage.loc[
        coverage["sensor"].isin(["aqua", "terra", "snpp"]) & coverage["local_day"].eq(d3),
        "covered",
    ] = False
    result = naive_annual(hotspots, coverage, science, 2019, aggregate=annual_aggregate_spy()).iloc[0]
    assert result.modis_covered_frac == result.snpp_covered_frac == pytest.approx(364 / 365)
    assert result.modis_count == pytest.approx((95 - 6 - 9 - 10) * 365 / 364)
    assert result.snpp_count == pytest.approx((55 - 11) * 365 / 364)


def test_uncovered_year_is_null_not_zero(tables):
    hotspots, coverage, science = tables
    coverage = coverage.assign(covered=False)
    result = naive_annual(hotspots, coverage, science, 2019, aggregate=annual_aggregate_spy()).iloc[0]
    assert pd.isna(result.modis_count) and pd.isna(result.snpp_count)
    assert result.modis_covered_frac == result.snpp_covered_frac == 0


def test_leap_year_coverage_fraction_and_missing_sensor(tables):
    hotspots, _, science = tables
    days = pd.date_range("2020-01-01", "2020-12-31")
    coverage = pd.DataFrame({"sensor": "aqua", "local_day": days.date, "covered": True})
    coverage.loc[0, "covered"] = False
    science["eras"]["record_start"] = "2020-01-01"
    result = naive_annual(hotspots, coverage, science, 2020, aggregate=annual_aggregate_spy()).iloc[0]
    assert result.modis_count == 0
    assert result.modis_covered_frac == pytest.approx(365 / 366)
    assert pd.isna(result.snpp_count) and result.snpp_covered_frac == 0


@pytest.mark.parametrize("invalid", [np.nan, np.inf, -1])
def test_invalid_covered_counts_fail(tables, invalid):
    hotspots, coverage, science = tables
    hotspots = hotspots.astype({"n_det_all": "float64"})
    hotspots.loc[0, "n_det_all"] = invalid
    with pytest.raises(ValueError, match="must"):
        naive_annual(hotspots, coverage, science, 2019, aggregate=annual_aggregate_spy())


def test_duplicate_rows_fail_instead_of_double_counting(tables):
    hotspots, coverage, science = tables
    with pytest.raises(ValueError, match="one valid row"):
        naive_annual(
            pd.concat([hotspots, hotspots.iloc[:1]]),
            coverage,
            science,
            2019,
            aggregate=annual_aggregate_spy(),
        )
