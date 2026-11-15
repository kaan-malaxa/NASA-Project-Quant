"""Known-answer tests for SD-06 and the reusable fabricated inputs."""

from datetime import date

import numpy as np
import pandas as pd
import pytest
from pandas.testing import assert_frame_equal

from pipeline.harmonize.calibrate import (
    choose_noaa20_method,
    daily_counts,
    fit_chained,
    fit_k,
)
from pipeline.harmonize.tests.fabricate import daily_table, planted_tables


def test_fabricated_season_year_ratios_and_outages():
    dates = ["2013-01-01", "2013-02-01", "2014-01-01"]
    cells, coverage = planted_tables(
        dates,
        seasonal={2: 3},
        year_ratios={2014: 4},
        uncovered={"aqua": [dates[1]]},
    )
    assert (
        cells.groupby(["sensor", "local_day"]).size().loc[("aqua", date(2013, 2, 1))]
        == 12
    )
    assert daily_counts(cells, coverage, "snpp")["count"].tolist() == [8, 24, 16]
    aqua = daily_counts(cells, coverage, "aqua")
    assert aqua["covered"].tolist() == [True, False, True]
    assert pd.isna(aqua.loc[1, "count"])
    assert list(cells.columns) == [
        "sensor",
        "local_day",
        "daynight",
        "h3_r6",
        "h3_r5",
        "n_det",
        "frp_sum",
        "frp_max",
    ]
    assert list(coverage.columns) == ["sensor", "local_day", "covered", "reason"]


def test_daily_counts_distinct_cells_pass_sensor_zeros_and_missing():
    cells, coverage = planted_tables(
        ["2013-01-01", "2013-01-02", "2013-01-03"],
        uncovered={"aqua": ["2013-01-03"]},
    )
    cells = cells.loc[
        ~(cells["sensor"].eq("aqua") & cells["local_day"].eq(date(2013, 1, 2)))
    ]
    duplicate = cells.iloc[[0]].copy()
    night = duplicate.assign(daynight="N", h3_r6="night-cell")
    cells = pd.concat([cells, duplicate, night], ignore_index=True)
    cells_before, coverage_before = cells.copy(deep=True), coverage.copy(deep=True)
    actual = daily_counts(cells, coverage.iloc[::-1], "aqua")
    assert actual["local_day"].tolist() == [
        date(2013, 1, 1),
        date(2013, 1, 2),
        date(2013, 1, 3),
    ]
    assert actual["count"].iloc[:2].tolist() == [4, 0]
    assert pd.isna(actual.loc[2, "count"])
    assert actual["covered"].tolist() == [True, True, False]
    assert daily_counts(cells, coverage, "aqua", pass_="N")["count"].iloc[0] == 1
    assert_frame_equal(cells, cells_before)
    assert_frame_equal(coverage, coverage_before)


def test_daily_counts_empty_detections_and_absent_sensor():
    cells, coverage = planted_tables(["2013-01-01"])
    assert daily_counts(cells.iloc[:0], coverage, "aqua")["count"].tolist() == [0]
    assert daily_counts(cells, coverage, "terra").empty


def test_exact_ratio_every_month_despite_seasonal_activity():
    dates = pd.date_range("2013-01-01", periods=12, freq="MS")
    cells, coverage = planted_tables(
        dates, seasonal={month: month for month in range(1, 13)}
    )
    aqua, viirs = [daily_counts(cells, coverage, sensor) for sensor in ("aqua", "snpp")]
    aqua_before, viirs_before = aqua.copy(deep=True), viirs.copy(deep=True)
    monthly, annual = fit_k(aqua, viirs, "2013-01-01", "2013-12-31", 50)
    assert list(monthly.columns) == ["month", "k", "aqua_celldays", "viirs_celldays"]
    assert monthly["month"].tolist() == list(range(1, 13))
    np.testing.assert_allclose(monthly["k"], 0.5, rtol=0, atol=1e-9)
    assert annual == pytest.approx(0.5, abs=1e-9)
    assert monthly["aqua_celldays"].tolist() == [4 * m for m in range(1, 13)]
    assert_frame_equal(aqua, aqua_before)
    assert_frame_equal(viirs, viirs_before)


def test_monthly_shrinkage_and_empty_months():
    dates = ["2013-01-01", "2013-02-01"]
    monthly, annual = fit_k(
        daily_table(dates, [2, 48]),
        daily_table(dates, [2, 98]),
        dates[0],
        dates[-1],
        50,
    )
    assert annual == 0.5
    assert monthly.loc[0, "k"] == pytest.approx((2 + 25) / (2 + 50))
    assert monthly.loc[0, ["aqua_celldays", "viirs_celldays"]].tolist() == [2, 2]
    assert monthly.loc[2:, "k"].eq(0.5).all()
    assert monthly.loc[2:, ["aqua_celldays", "viirs_celldays"]].eq(0).all().all()


def test_either_sensor_outage_is_ignored_even_with_wild_values():
    dates = pd.date_range("2013-01-01", periods=4)
    aqua = daily_table(dates, [4, 8, 999999, 3], [True, True, False, True])
    viirs = daily_table(dates, [8, 16, 1, 999999], [True, True, True, False])
    actual, annual = fit_k(aqua, viirs, dates[0], dates[-1], 50)
    expected, expected_annual = fit_k(
        aqua.iloc[:2], viirs.iloc[:2], dates[0], dates[-1], 50
    )
    assert_frame_equal(actual, expected)
    assert annual == expected_annual == 0.5
    # Nulls on uncovered days must also be ignored, rather than treated as zeros.
    aqua.loc[2, "count"], viirs.loc[3, "count"] = np.nan, np.nan
    with_nulls, _ = fit_k(aqua, viirs, dates[0], dates[-1], 50)
    assert_frame_equal(with_nulls, expected)


def test_excluded_whole_year_cannot_change_fit():
    dates = ["2013-01-01", "2013-12-31", "2014-01-01", "2014-12-31"]
    cells, coverage = planted_tables(dates, year_ratios={2014: 4})
    aqua, viirs = [daily_counts(cells, coverage, sensor) for sensor in ("aqua", "snpp")]
    monthly, annual = fit_k(aqua, viirs, dates[0], dates[-1], 50, exclude_years=(2014,))
    expected, _ = fit_k(aqua.iloc[:2], viirs.iloc[:2], dates[0], dates[-1], 50)
    assert_frame_equal(monthly, expected)
    assert annual == 0.5
    assert fit_k(aqua, viirs, dates[0], dates[-1], 50)[1] == pytest.approx(1 / 3)
    viirs.loc[2:, "count"] = 1e12
    corrupted, corrupted_annual = fit_k(
        aqua, viirs, dates[0], dates[-1], 50, exclude_years=(2014,)
    )
    assert_frame_equal(corrupted, expected)
    assert corrupted_annual == annual


def test_fit_bounds_are_inclusive_and_days_align_by_date():
    aqua = daily_table(
        ["2013-01-01", "2013-01-02", "2013-01-03", "2013-01-04"],
        [99, 2, 4, 99],
    )
    viirs = daily_table(
        ["2013-01-05", "2013-01-04", "2013-01-03", "2013-01-02", "2013-01-01"],
        [999, 1, 8, 4, 1],
    )
    monthly, annual = fit_k(aqua, viirs, "2013-01-02", "2013-01-03", 50)
    assert annual == 0.5
    assert monthly.loc[0, ["aqua_celldays", "viirs_celldays"]].tolist() == [6, 12]


def test_chained_ratio_is_point_four_and_months_align_by_label():
    dates = pd.date_range("2013-01-01", periods=12, freq="MS")
    cells, coverage = planted_tables(dates)
    aqua, snpp, noaa20 = [
        daily_counts(cells, coverage, sensor) for sensor in ("aqua", "snpp", "noaa20")
    ]
    snpp_fit = fit_k(aqua, snpp, dates[0], dates[-1], 50)
    shuffled = (snpp_fit[0].iloc[::-1], snpp_fit[1])
    monthly_before = shuffled[0].copy(deep=True)
    monthly, annual = fit_chained(shuffled, snpp, noaa20, dates[0], dates[-1], 50)
    np.testing.assert_allclose(monthly["k"], 0.4, rtol=0, atol=1e-9)
    assert annual == pytest.approx(0.4)
    assert monthly["aqua_celldays"].tolist() == [4] * 12
    assert monthly["viirs_celldays"].tolist() == [10] * 12
    assert_frame_equal(shuffled[0], monthly_before)


def test_chained_uses_shrunken_monthly_ratio_and_separate_annual_ratio():
    dates = ["2013-01-01", "2013-02-01"]
    aqua, snpp, noaa20 = [
        daily_table(dates, counts) for counts in ([4, 8], [8, 16], [10, 40])
    ]
    snpp_fit = fit_k(aqua, snpp, dates[0], dates[-1], 50)
    monthly, annual = fit_chained(snpp_fit, snpp, noaa20, dates[0], dates[-1], 50)
    assert annual == pytest.approx(0.5 * 24 / 50)
    assert monthly.loc[0, "k"] == pytest.approx(0.5 * (8 + 50 * 24 / 50) / (10 + 50))
    assert monthly.loc[1, "k"] == pytest.approx(0.5 * (16 + 50 * 24 / 50) / (40 + 50))


def test_chained_aligns_varying_snpp_factors_by_month():
    dates = pd.date_range("2013-01-01", periods=12, freq="MS")
    aqua = daily_table(dates, range(1, 13))
    snpp = daily_table(dates, [20] * 12)
    noaa20 = daily_table(dates, [25] * 12)
    snpp_monthly, snpp_annual = fit_k(aqua, snpp, dates[0], dates[-1], 50)
    monthly, annual = fit_chained(
        (snpp_monthly.iloc[::-1], snpp_annual),
        snpp,
        noaa20,
        dates[0],
        dates[-1],
        50,
    )
    np.testing.assert_allclose(monthly["k"], snpp_monthly["k"] * 0.8)
    assert annual == pytest.approx(snpp_annual * 0.8)


@pytest.mark.parametrize(
    "first,end,minimum,expected",
    [
        (2019, 2022, 3, "direct"),
        (2021, 2022, 3, "chained"),
        (2020, 2022, 3, "direct"),
        (2023, 2022, 3, "chained"),
        (2020, 2022, 4, "chained"),
    ],
)
def test_method_rule(first, end, minimum, expected):
    assert choose_noaa20_method(first, end, minimum) == expected


@pytest.mark.parametrize(
    "case", ["zero", "no_overlap", "all_excluded", "all_uncovered"]
)
def test_zero_viirs_total_has_clear_error(case):
    aqua = daily_table(["2013-01-01"], [4])
    viirs = daily_table(["2013-01-01"], [0 if case == "zero" else 8])
    if case == "no_overlap":
        viirs["local_day"] = [date(2013, 1, 2)]
    if case == "all_uncovered":
        viirs["covered"] = False
    excluded = (2013,) if case == "all_excluded" else ()
    with pytest.raises(ValueError, match="total VIIRS cell-days is zero"):
        fit_k(aqua, viirs, "2013-01-01", "2013-01-02", 50, excluded)


@pytest.mark.parametrize("bad_count", [np.nan, np.inf, -1])
def test_invalid_jointly_covered_counts_rejected(bad_count):
    with pytest.raises(ValueError, match="finite and non-negative"):
        fit_k(
            daily_table(["2013-01-01"], [bad_count]),
            daily_table(["2013-01-01"], [8]),
            "2013-01-01",
            "2013-01-01",
            50,
        )


def test_duplicate_daily_rows_cannot_multiply_fit_totals():
    aqua = daily_table(["2013-01-01"] * 2, [4, 4])
    with pytest.raises(ValueError, match="one row per local_day"):
        fit_k(aqua, daily_table(["2013-01-01"], [8]), "2013-01-01", "2013-01-01", 50)


def test_non_integral_fabricated_cell_counts_rejected():
    with pytest.raises(ValueError, match="integer counts"):
        planted_tables(["2013-01-01"], aqua_per_day=1)
