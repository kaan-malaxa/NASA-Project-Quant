"""Planted ratios and slow independent refits check the vectorized bootstrap."""

from copy import deepcopy

import numpy as np
import pandas as pd
import pytest
from pandas.testing import assert_frame_equal

from pipeline.harmonize.bootstrap import (
    BootstrapDraws,
    annual_bootstrap,
    bootstrap_k,
    complete_year_limit,
    precompute_fit_sums,
    with_intervals,
)
from pipeline.harmonize.calibrate import fit_chained, fit_k
from pipeline.harmonize.series import calibration_document, fit_calibrations
from pipeline.harmonize.tests.fabricate import (
    annual_aggregate_spy,
    daily_table,
    ratio_daily_tables,
)


@pytest.fixture
def science():
    return {
        "seed": 7,
        "scope": {"region_id": "united_states", "country": "US"},
        "reference": {"sensor": "aqua", "pass": "D"},
        "grid": {"count_res": 6},
        "eras": {
            "record_start": "2003-01-01",
            "aqua_trusted_through": "2022-12-31",
            "snpp_through": "2025-12-31",
            "snpp_first_day": "2012-01-20",
        },
        "tier1": {
            "n0": 50,
            "bootstrap_b": 500,
            "interval_percentiles": [5, 95],
            "snpp_fit": ["2013-01-01", "2022-12-31"],
            "n20_min_detection_days": 12,
            "n20_min_fit_years": 3,
            "monthly": True,
        },
    }


@pytest.mark.parametrize("method", ["direct", "chained"])
def test_constant_ratio_has_zero_width_for_both_sensors(science, method):
    counts, cells = ratio_daily_tables([0.5])
    if method == "chained":
        science["tier1"]["n20_min_fit_years"] = 100
    fits = fit_calibrations(counts, cells, science)
    assert fits.noaa20_method == method
    draws = bootstrap_k(counts, science, fits)
    doc = with_intervals(calibration_document("united_states", science, fits), draws, [5, 95])
    for sensor, expected in (("snpp", 0.5), ("noaa20", 0.4)):
        assert doc["k_annual"][sensor] == {
            "k": expected,
            "lo": expected,
            "hi": expected,
        }
        for entry in doc["k"][sensor]:
            assert entry["lo"] == entry["k"] == entry["hi"] == expected
        assert np.ptp(draws.monthly[sensor], axis=0).max() == 0


def test_variable_year_ratios_cover_half_within_planted_range(science):
    counts, cells = ratio_daily_tables([0.4, 0.45, 0.5, 0.55, 0.6])
    fits = fit_calibrations(counts, cells, science)
    draws = bootstrap_k(counts, science, fits)
    before = calibration_document("united_states", science, fits)
    doc = with_intervals(before, draws, science["tier1"]["interval_percentiles"])
    annual = doc["k_annual"]["snpp"]
    assert 0.4 <= annual["lo"] < 0.5 < annual["hi"] <= 0.6
    for entry in doc["k"]["snpp"]:
        assert 0.4 <= entry["lo"] < 0.5 < entry["hi"] <= 0.6
    assert before["k_annual"]["snpp"]["lo"] == before["k_annual"]["snpp"]["k"]


def test_seed_reproducibility_and_no_global_rng_mutation(science):
    counts, cells = ratio_daily_tables([0.4, 0.6])
    fits = fit_calibrations(counts, cells, science)
    first = bootstrap_k(counts, science, fits)
    second = bootstrap_k(counts, science, fits)
    for sensor in first.monthly:
        np.testing.assert_array_equal(first.monthly[sensor], second.monthly[sensor])
        np.testing.assert_array_equal(first.weights[sensor][1], second.weights[sensor][1])
    altered = deepcopy(science)
    altered["seed"] += 1
    different = bootstrap_k(counts, altered, fits)
    assert not np.array_equal(first.monthly["snpp"], different.monthly["snpp"])
    # Local Generator use leaves the legacy global RNG alone.
    state = np.random.get_state()
    bootstrap_k(counts, science, fits)
    after = np.random.get_state()
    np.testing.assert_array_equal(state[1], after[1])
    assert state[2:] == after[2:]


def weighted(frame, years, weights):
    result = frame.copy()
    dates = pd.to_datetime(result["local_day"])
    frequencies = dates.dt.year.map(dict(zip(years, weights, strict=True))).fillna(0)
    result["count"] *= frequencies
    return result


@pytest.mark.parametrize("method", ["direct", "chained"])
def test_vectorized_draws_equal_independent_slow_refits(science, method):
    counts, cells = ratio_daily_tables([0.4, 0.6, 0.5])
    even_months = pd.to_datetime(counts["aqua"]["local_day"]).dt.month.mod(2).eq(0)
    counts["aqua"].loc[even_months, "count"] *= 0.5
    science["tier1"]["bootstrap_b"] = 8
    if method == "chained":
        science["tier1"]["n20_min_fit_years"] = 100
    fits = fit_calibrations(counts, cells, science)
    draws = bootstrap_k(counts, science, fits)
    for replicate in range(draws.size):
        years, weights = draws.weights["snpp"]
        snpp_fit = fit_k(
            weighted(counts["aqua"], years, weights[replicate]),
            weighted(counts["snpp"], years, weights[replicate]),
            *science["tier1"]["snpp_fit"],
            science["tier1"]["n0"],
        )
        np.testing.assert_allclose(draws.monthly["snpp"][replicate], snpp_fit[0]["k"])
        years, weights = draws.weights["noaa20"]
        start = f"{fits.n20_first_full_year}-01-01"
        noaa20 = weighted(counts["noaa20"], years, weights[replicate])
        if method == "direct":
            n20_fit = fit_k(
                weighted(counts["aqua"], years, weights[replicate]),
                noaa20,
                start,
                science["tier1"]["snpp_fit"][1],
                science["tier1"]["n0"],
            )
        else:
            n20_fit = fit_chained(
                snpp_fit,
                weighted(counts["snpp"], years, weights[replicate]),
                noaa20,
                start,
                science["eras"]["snpp_through"],
                science["tier1"]["n0"],
            )
        np.testing.assert_allclose(draws.monthly["noaa20"][replicate], n20_fit[0]["k"])
        assert draws.annual["noaa20"][replicate] == pytest.approx(n20_fit[1])


def test_bootstrap_excludes_uncovered_and_post_fit_values(science):
    counts, cells = ratio_daily_tables([0.4, 0.6])
    counts["aqua"].loc[0, "covered"] = False
    fits = fit_calibrations(counts, cells, science)
    before = bootstrap_k(counts, science, fits)
    counts["aqua"].loc[0, "count"] = 1e12
    dates = pd.to_datetime(counts["aqua"]["local_day"])
    counts["aqua"].loc[dates.dt.year > 2022, "count"] = 1e12
    altered = bootstrap_k(counts, science, fits)
    for sensor in before.monthly:
        np.testing.assert_array_equal(before.monthly[sensor], altered.monthly[sensor])
    assert before.weights["snpp"][0].tolist() == list(range(2013, 2023))


def test_unavailable_noaa_and_annual_only_fallback(science):
    counts, cells = ratio_daily_tables([0.4, 0.6])
    science["tier1"]["n20_min_detection_days"] = 366
    science["tier1"]["monthly"] = False
    fits = fit_calibrations(counts, cells, science)
    draws = bootstrap_k(counts, science, fits)
    assert set(draws.monthly) == {"snpp"}
    np.testing.assert_array_equal(draws.monthly["snpp"], np.repeat(draws.annual["snpp"][:, None], 12, axis=1))


def test_empty_years_are_not_dropped_and_undefined_draws_fail(science):
    dates = ["2013-01-01", "2014-01-01"]
    sums = precompute_fit_sums(
        daily_table(dates, [4, 0]),
        daily_table(dates, [8, 0]),
        *science["tier1"]["snpp_fit"],
    )
    assert sums.years.tolist() == list(range(2013, 2023))
    counts, cells = ratio_daily_tables([0.5])
    counts["snpp"].loc[:, "count"] = 0
    counts["snpp"].loc[0, "count"] = 100
    fits = fit_calibrations(counts, cells, science)
    with pytest.raises(ValueError, match="no undefined replicate was discarded"):
        bootstrap_k(counts, science, fits)


def annual_daily_fixture():
    days = pd.date_range("2003-01-01", "2023-12-31")
    observed = days.year <= 2022
    harmonic = pd.DataFrame(
        {
            "local_day": days.date,
            "series": "harmonized",
            "value": 4.0,
            "kind": np.where(observed, "observed", "harmonized"),
            "source": np.where(observed, "aqua", "snpp"),
            "covered": True,
        }
    )
    snpp = harmonic.assign(series="snpp_raw", value=8.0, kind="observed", source="snpp")
    noaa20 = harmonic.assign(series="noaa20_raw", value=10.0, kind="observed", source="noaa20")
    return pd.concat([harmonic, snpp, noaa20], ignore_index=True)


def test_annual_aqua_fixed_translated_year_varies_and_calls_common_once(science):
    factors = np.array([0.4, 0.5, 0.6])
    draws = BootstrapDraws({"snpp": np.repeat(factors[:, None], 12, axis=1)}, {"snpp": factors}, {})
    aggregate = annual_aggregate_spy()
    result = annual_bootstrap(annual_daily_fixture(), draws, science, 2023, aggregate=aggregate)
    assert aggregate.call_count == 1
    assert aggregate.call_args.kwargs["grain"] == "year"
    assert len(aggregate.call_args.kwargs["value_cols"]) == 25
    assert result.groupby("year")["harmonized"].var().loc[:2022].eq(0).all()
    assert result.loc[result["year"].eq(2003), "harmonized"].tolist() == [1460] * 3
    np.testing.assert_allclose(
        result.loc[result["year"].eq(2023), "harmonized"].astype(float),
        8 * 365 * factors,
    )
    assert str(result["replicate"].dtype) == str(result["year"].dtype) == "int32"
    assert_frame_equal(
        result,
        annual_bootstrap(
            annual_daily_fixture(),
            draws,
            science,
            2023,
            aggregate=annual_aggregate_spy(),
        ),
    )


def test_aqua_outage_fill_inherits_uncertainty(science):
    daily = annual_daily_fixture()
    outage = daily["series"].eq("harmonized") & daily["local_day"].eq(pd.Timestamp("2020-06-01").date())
    daily.loc[outage, ["kind", "source"]] = ["harmonized", "snpp"]
    factors = np.array([0.4, 0.5, 0.6])
    draws = BootstrapDraws({"snpp": np.repeat(factors[:, None], 12, axis=1)}, {"snpp": factors}, {})
    result = annual_bootstrap(daily, draws, science, 2023, aggregate=annual_aggregate_spy())
    # Leap-year Aqua contributes 365 fixed days and one translated outage day.
    np.testing.assert_allclose(
        result.loc[result["year"].eq(2020), "harmonized"].astype(float),
        365 * 4 + 8 * factors,
    )
    assert result.loc[result["year"].eq(2019), "harmonized"].nunique() == 1


def test_annual_components_use_each_month_and_actual_fallback_sensor(science):
    daily = annual_daily_fixture()
    fallback = daily["series"].eq("harmonized") & daily["local_day"].eq(pd.Timestamp("2023-01-01").date())
    daily.loc[fallback, "source"] = "noaa20"
    snpp = np.array([np.arange(1, 13) / 20, np.arange(1, 13) / 10])
    noaa20 = np.array([np.full(12, 0.3), np.full(12, 0.4)])
    draws = BootstrapDraws(
        {"snpp": snpp, "noaa20": noaa20},
        {"snpp": snpp.mean(axis=1), "noaa20": noaa20.mean(axis=1)},
        {},
    )
    result = annual_bootstrap(daily, draws, science, 2023, aggregate=annual_aggregate_spy())
    month_days = np.array([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])
    expected = 8 * (snpp @ month_days - snpp[:, 0]) + 10 * noaa20[:, 0]
    np.testing.assert_allclose(result.loc[result["year"].eq(2023), "harmonized"].astype(float), expected)


def test_missing_annual_stays_null_and_complete_year_limit(science):
    daily = annual_daily_fixture()
    missing = daily["series"].eq("harmonized") & pd.to_datetime(daily["local_day"]).dt.year.eq(2023)
    daily.loc[missing, ["value", "kind", "covered"]] = [np.nan, "missing", False]
    draws = BootstrapDraws({"snpp": np.full((2, 12), 0.5)}, {"snpp": np.full(2, 0.5)}, {})
    result = annual_bootstrap(daily, draws, science, 2023, aggregate=annual_aggregate_spy())
    assert result.loc[result["year"].eq(2023), "harmonized"].isna().all()
    assert complete_year_limit("2026-11-13", "2026-11-14") == 2025
    assert complete_year_limit("2025-12-31", "2026-01-01") == 2025
    assert complete_year_limit("2026-12-31", "2026-11-14") == 2025
    assert complete_year_limit("2024-06-01", "2026-11-14") == 2023


def test_custom_percentiles_are_used_exactly(science):
    counts, cells = ratio_daily_tables([0.4, 0.6])
    fits = fit_calibrations(counts, cells, science)
    draws = bootstrap_k(counts, science, fits)
    doc = with_intervals(calibration_document("united_states", science, fits), draws, [20, 80])
    expected = np.percentile(draws.monthly["snpp"], [20, 80], axis=0)
    assert doc["k"]["snpp"][0]["lo"] == expected[0, 0]
    assert doc["k"]["snpp"][0]["hi"] == expected[1, 0]
