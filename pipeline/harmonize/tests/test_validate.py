"""Known-answer V1–V6 checks; all fabricated observations stay in memory."""

from copy import deepcopy
from dataclasses import replace

import numpy as np
import pandas as pd
import pytest
from pandas.testing import assert_frame_equal

from pipeline.common.config import load_science
from pipeline.harmonize.series import build_daily_series, calibration_document, fit_calibrations
from pipeline.harmonize.tests.fabricate import daily_table, planted_tables
from pipeline.harmonize.validate import (
    _step,
    loyo_predictions,
    saturation_rows,
    validate_tier1,
    validation_figures,
    yearly_drift,
)


@pytest.fixture
def science():
    config = deepcopy(dict(load_science()))
    config["validation"] = {"step_window_years": 3, "drift_bootstrap_b": 200}
    return config


def planted_counts(science, *, seasonal=False):
    """Dense dates and changing activity; exact sensor ratios at every date."""
    dates = pd.date_range(science["eras"]["record_start"], science["eras"]["snpp_through"])
    aqua = 12 * (dates.month.to_numpy() + 1 + np.arange(len(dates)) % 7)
    ratio = np.where(dates.month <= 6, 0.25, 0.75) if seasonal else 0.5
    snpp = aqua / ratio
    return {
        "aqua": daily_table(dates, aqua),
        "snpp": daily_table(dates, snpp, dates >= pd.Timestamp(science["eras"]["snpp_first_day"])),
        "noaa20": daily_table(dates, snpp * 1.25, dates >= pd.Timestamp("2019-01-01")),
    }


def outputs(counts, science):
    cells = counts["noaa20"].loc[counts["noaa20"]["covered"], ["local_day"]].assign(sensor="noaa20")
    fits = fit_calibrations(counts, cells, science)
    coverage = pd.concat(
        [
            frame[["local_day", "covered"]].assign(sensor=sensor, reason="fabricated")
            for sensor, frame in counts.items()
        ],
        ignore_index=True,
    )
    daily = build_daily_series(
        counts, coverage, science, calibration_document("us", science, fits)
    )
    # Known annual hotspot counts, distinct from the cell-day series. The naive
    # splice doubles at the VIIRS arrival, independent of changing fire activity.
    naive = pd.DataFrame({"year": range(2003, 2026), "modis_count": 100.0, "snpp_count": 200.0})
    return daily, naive, fits


def validate(counts, science):
    daily, naive, fits = outputs(counts, science)
    return validate_tier1(counts, daily, naive, fits, science, "us")


def rows(result):
    return {row["test"]: row for row in result.document["validation"]}


def test_constant_ratio_loyo_and_raw_baseline(science):
    result = validate(planted_counts(science), science)
    actual = rows(result)
    assert actual["loyo_weekly_wape"]["value"] < 0.01
    assert actual["loyo_weekly_wape"]["baselines"]["raw_viirs"] == pytest.approx(1)
    assert actual["loyo_weekly_wape"]["baselines"]["annual_ratio"] == pytest.approx(0)
    assert actual["loyo_weekly_r"]["value"] == pytest.approx(1)
    assert actual["loyo_bias"]["value"] == pytest.approx(0)
    assert actual["loyo_weekly_wape"]["n"] == 10 * 52
    assert actual["handoff_annual_mape"]["value"] == pytest.approx(0)
    assert actual["handoff_annual_mape"]["n"] == 10
    assert actual["step_naive"]["value"] == pytest.approx(2)
    assert actual["step_naive"]["method"] == "none"
    assert actual["sat_agreement_wape"]["value"] == pytest.approx(0)
    assert actual["sat_agreement_wape"]["years"] == [2019, 2025]
    assert actual["sat_agreement_wape"]["n"] == 7 * 52
    assert actual["k_direct_vs_chained_pct"]["value"] == pytest.approx(0)
    assert actual["k_direct_vs_chained_pct"]["n"] == 365 * 4 + 1
    assert len(actual) == 11  # saturation has two sensor rows for each resolution
    assert actual["backcast_weekly_wape"]["value"] < 0.01
    assert actual["backcast_weekly_wape"]["n"] == 520
    for entry in actual.values():
        assert entry.keys() >= {"region", "test", "method", "value", "n", "years", "note"}
        assert entry["region"] == "us"
        assert entry["value"] is None or np.isfinite(entry["value"])
    for name in ("step_naive", "step_harmonized"):
        assert "totals match partly by construction; see LOYO" in actual[name]["note"]
        assert "(4 consecutive windows)" in actual[name]["note"]
    figures = validation_figures(result)
    assert set(figures) == {"loyo_scatter.png", "overlay_aqua_vs_translated.png", "drift_k_by_year.png"}
    assert len(figures["loyo_scatter.png"].axes[0].collections[0].get_offsets()) == 520
    assert result.overlay["year"].tolist() == list(range(2012, 2026))


def test_seasonal_monthly_factors_beat_annual_baseline(science):
    result = validate(planted_counts(science, seasonal=True), science)
    metric = rows(result)["loyo_weekly_wape"]
    assert metric["value"] < 0.01
    assert metric["baselines"]["annual_ratio"] > 0.1
    assert metric["value"] < metric["baselines"]["annual_ratio"]


def test_held_out_counts_do_not_affect_any_held_out_factor(science):
    counts = planted_counts(science)
    before = loyo_predictions(counts["aqua"], counts["snpp"], science)
    # An absurd change within Y must affect its validation errors but cannot
    # affect either its annual shrinkage target or its twelve monthly fits.
    mutated = counts["aqua"].copy()
    held = pd.to_datetime(mutated["local_day"]).dt.year.eq(2017)
    mutated.loc[held, "count"] *= 1000
    after = loyo_predictions(mutated, counts["snpp"], science)
    for result in (before, after):
        assert 2017 not in result.folds[2017]["training_years"]
        assert result.folds[2017]["training_days"] == len(pd.date_range("2013-01-01", "2022-12-31")) - 365
    assert before.folds[2017]["k_annual"] == after.folds[2017]["k_annual"] == 0.5
    assert_frame_equal(before.folds[2017]["k"], after.folds[2017]["k"])
    assert after.folds[2016]["k_annual"] > before.folds[2016]["k_annual"]
    held_week = after.weekly.loc[after.weekly["year"].eq(2017)]
    np.testing.assert_allclose(
        held_week["observed"].to_numpy(dtype=float), 1000 * held_week["tier1"].to_numpy(dtype=float)
    )


def test_joint_coverage_excludes_wild_outages_before_binning(science):
    counts = planted_counts(science)
    for sensor, date in (("aqua", "2016-01-01"), ("snpp", "2016-01-02")):
        outage = counts[sensor]["local_day"].eq(pd.Timestamp(date).date())
        counts[sensor].loc[outage, ["count", "covered"]] = [10**12, False]
    loyo = loyo_predictions(counts["aqua"], counts["snpp"], science)
    week = loyo.weekly.loc[loyo.weekly["year"].eq(2016) & loyo.weekly["week"].eq(1)].iloc[0]
    assert week["n_covered"] == 5
    assert week["tier1"] == pytest.approx(week["observed"])
    assert all(fold["k_annual"] == 0.5 for fold in loyo.folds.values())


def test_week_and_annual_missingness_are_preserved(science):
    counts = planted_counts(science)
    outage = pd.to_datetime(counts["aqua"]["local_day"]).between("2017-01-01", "2017-07-01")
    counts["aqua"].loc[outage, "covered"] = False
    result = validate(counts, science)
    actual = rows(result)
    assert actual["loyo_weekly_wape"]["value"] == pytest.approx(0)
    assert actual["loyo_weekly_wape"]["n"] < 520
    assert actual["handoff_annual_mape"]["n"] == 9
    assert pd.isna(result.loyo.annual.set_index("year").loc[2017, "tier1"])


def test_steps_use_adjacent_windows_and_empirical_reference_percentiles(science):
    annual = pd.Series(np.arange(1, 13, dtype=float), index=range(2003, 2015))
    value, n, note = _step(annual, science)
    assert value == pytest.approx(np.mean([10, 11, 12]) / np.mean([7, 8, 9]))
    historical = [
        np.mean(np.arange(start + 3, start + 6)) / np.mean(np.arange(start, start + 3))
        for start in range(1, 5)
    ]
    lo, hi = np.percentile(historical, [5, 95])
    assert f"{lo:.6g} to {hi:.6g}" in note
    assert n == 6
    annual.loc[2009] = None
    assert _step(annual, science)[0] is None


def test_unavailable_comparisons_are_null_not_zero(science):
    counts = planted_counts(science)
    daily, naive, fits = outputs(counts, science)
    fits = replace(fits, noaa20_direct=None, unavailable={"direct": "no eligible observations"})
    result = validate_tier1(counts, daily, naive, fits, science, "us")
    entry = rows(result)["k_direct_vs_chained_pct"]
    assert entry["value"] is None and entry["n"] == 0
    assert "no eligible observations" in entry["note"]
    fits = replace(fits, n20_first_full_year=None, noaa20_chained=None)
    result = validate_tier1(counts, daily, naive, fits, science, "us")
    assert rows(result)["sat_agreement_wape"]["value"] is None
    assert rows(result)["sat_agreement_wape"]["n"] == 0
    assert rows(result)["sat_agreement_wape"]["years"] == []


def test_out_of_window_counts_cannot_change_loyo(science):
    counts = planted_counts(science)
    before = loyo_predictions(counts["aqua"], counts["snpp"], science)
    after_counts = counts["aqua"].copy()
    drift = pd.to_datetime(after_counts["local_day"]).dt.year.gt(2022)
    after_counts.loc[drift, "count"] *= 1000
    after = loyo_predictions(after_counts, counts["snpp"], science)
    assert_frame_equal(before.weekly, after.weekly)
    assert_frame_equal(before.annual, after.annual)


def test_validation_rejects_other_region(science):
    with pytest.raises(ValueError, match="United States"):
        validate_tier1({}, pd.DataFrame(), pd.DataFrame(), None, science, "punjab")


def test_zero_observed_totals_have_null_errors_and_correlations(science):
    counts = planted_counts(science)
    counts["aqua"]["count"] = 0
    actual = rows(validate(counts, science))
    for name in (
        "loyo_weekly_wape",
        "loyo_weekly_r",
        "loyo_bias",
        "handoff_annual_mape",
        "sat_agreement_wape",
        "k_direct_vs_chained_pct",
    ):
        assert actual[name]["value"] is None
    assert actual["handoff_annual_mape"]["n"] == 0


def test_unfittable_folds_are_explicitly_unavailable(science):
    counts = planted_counts(science)
    counts["snpp"]["count"] = 0
    result = loyo_predictions(counts["aqua"], counts["snpp"], science)
    assert result.weekly.empty and result.annual.empty
    assert not result.folds
    assert set(result.unavailable) == set(range(2013, 2023))
    assert all("total VIIRS cell-days is zero" in note for note in result.unavailable.values())


def test_planted_drift_has_expected_sign_size_and_sensor_labels(science):
    counts = planted_counts(science)
    dates = pd.to_datetime(counts["aqua"]["local_day"])
    counts["aqua"]["count"] *= 0.95 ** np.maximum(dates.dt.year - 2022, 0)
    entries, summary = yearly_drift(counts, science, 2019)
    assert summary["mean_k_fit_window"] == pytest.approx(0.5)
    assert summary["departure_pct_by_year"] == pytest.approx(
        {
            "2023": -5,
            "2024": -9.75,
            "2025": -14.2625,
        }
    )
    assert set(entries[0]) == {"year", "sensor", "k_annual", "lo", "hi"}
    for entry in entries:
        ratio = (0.5 if entry["sensor"] == "snpp" else 0.4) * 0.95 ** max(entry["year"] - 2022, 0)
        assert entry["k_annual"] == pytest.approx(ratio)
        assert entry["lo"] == pytest.approx(ratio)
        assert entry["hi"] == pytest.approx(ratio)
    assert [entry["year"] for entry in entries if entry["sensor"] == "noaa20"] == list(range(2019, 2026))
    # Diagnostics after the era boundary cannot contaminate production fits.
    _, _, fits = outputs(counts, science)
    assert fits.snpp[1] == pytest.approx(0.5)
    assert fits.noaa20_direct[1] == pytest.approx(0.4)


def test_week_bootstrap_is_reproducible_and_seed_controls_intervals(science):
    counts = planted_counts(science)
    counts["aqua"]["count"] *= 0.5 + np.arange(len(counts["aqua"])) % 13 / 13
    first, _ = yearly_drift(counts, science, 2019)
    repeated, _ = yearly_drift(counts, science, 2019)
    assert first == repeated
    science["seed"] += 1
    changed, _ = yearly_drift(counts, science, 2019)
    assert [entry["k_annual"] for entry in first] == [entry["k_annual"] for entry in changed]
    assert any(a["lo"] != b["lo"] for a, b in zip(first, changed, strict=True))


def test_drift_uses_raw_block_sums_including_long_final_week(science):
    dates = pd.date_range("2013-01-01", periods=7).union(pd.date_range("2013-12-24", periods=8))
    aqua = daily_table(dates, [1] * 7 + [4] * 8)
    snpp = daily_table(dates, [2] * 7 + [4] * 8)
    entries, _ = yearly_drift({"aqua": aqua, "snpp": snpp}, science, None)
    assert len(entries) == 1
    assert entries[0]["k_annual"] == pytest.approx(39 / 46)


def test_drift_ignores_uncovered_wild_counts_and_nulls_zero_denominator(science):
    counts = planted_counts(science)
    for sensor, day in (("aqua", "2023-07-01"), ("snpp", "2023-07-02")):
        selected = counts[sensor]["local_day"].eq(pd.Timestamp(day).date())
        counts[sensor].loc[selected, ["count", "covered"]] = [10**12, False]
    year = pd.to_datetime(counts["snpp"]["local_day"]).dt.year.eq(2017)
    counts["snpp"].loc[year, "count"] = 0
    entries, summary = yearly_drift(counts, science, None)
    by_year = {entry["year"]: entry for entry in entries}
    assert by_year[2017] == {"year": 2017, "sensor": "snpp", "k_annual": None, "lo": None, "hi": None}
    assert by_year[2023]["k_annual"] == pytest.approx(0.5)
    assert summary["mean_k_fit_window"] == pytest.approx(0.5)


@pytest.fixture
def saturation_inputs(science):
    science["tier1"]["snpp_fit"] = ["2013-01-01", "2014-12-31"]
    dates = pd.date_range(*science["tier1"]["snpp_fit"])
    cells, coverage = planted_tables(dates, snpp_per_aqua=1, noaa20_per_snpp=1)
    inventory = cells[["h3_r6", "h3_r5"]].drop_duplicates().reset_index(drop=True)
    aqua = daily_table(dates, [4] * len(dates))
    return cells, coverage, inventory, aqua


def test_every_region_cell_active_every_day_gives_saturation_one(science, saturation_inputs):
    cells, coverage, inventory, aqua = saturation_inputs
    actual = saturation_rows(cells, coverage, aqua, inventory, science, "us")
    assert len(actual) == 4
    assert {entry["test"] for entry in actual} == {"saturation_r5", "saturation_r6"}
    for entry in actual:
        assert entry["value"] == pytest.approx(1)
        assert entry["n"] == 2
        assert "peak Aqua week=1;" in entry["note"]
        assert "sensor=aqua;" in entry["note"] or "sensor=snpp;" in entry["note"]


def test_saturation_uses_full_inventory_and_unique_parents(science, saturation_inputs):
    cells, coverage, _, aqua = saturation_inputs
    inventory = pd.DataFrame(
        {"h3_r6": [f"cell-{i}" for i in range(8)], "h3_r5": [f"parent-{i % 2}" for i in range(8)]}
    )
    cells["h3_r5"] = cells["h3_r6"].map(inventory.set_index("h3_r6")["h3_r5"])
    actual = saturation_rows(cells, coverage, aqua, inventory, science, "us")
    for entry in actual:
        assert entry["value"] == pytest.approx(1 if entry["test"] == "saturation_r5" else 0.5)


def test_missing_inventory_is_unavailable_and_invalid_inventory_rejected(science, saturation_inputs):
    cells, coverage, inventory, aqua = saturation_inputs
    actual = saturation_rows(cells, coverage, aqua, None, science, "us")
    assert all(entry["value"] is None and entry["n"] == 0 for entry in actual)
    assert all("denominator cannot be inferred" in entry["note"] for entry in actual)
    with pytest.raises(ValueError, match="do not match"):
        saturation_rows(cells, coverage, aqua, inventory.iloc[1:], science, "us")


def test_backcast_honors_held_out_factors_and_coverage(science):
    counts = planted_counts(science)
    counts["aqua"].loc[counts["aqua"]["local_day"].eq(pd.Timestamp("2017-01-01").date()), "covered"] = False
    before = loyo_predictions(counts["aqua"], counts["snpp"], science)
    mutated = counts["aqua"].copy()
    held = pd.to_datetime(mutated["local_day"]).dt.year.eq(2017)
    mutated.loc[held, "count"] *= 1000
    after = loyo_predictions(mutated, counts["snpp"], science)
    week = before.backcast_weekly.loc[
        before.backcast_weekly["year"].eq(2017) & before.backcast_weekly["week"].eq(1)
    ].iloc[0]
    assert week["n_covered"] == 6
    assert week["tier1"] == pytest.approx(week["observed"])
    assert_frame_equal(before.folds[2017]["k"], after.folds[2017]["k"])
    held_before = before.backcast_weekly.loc[before.backcast_weekly["year"].eq(2017)]
    held_after = after.backcast_weekly.loc[after.backcast_weekly["year"].eq(2017)]
    np.testing.assert_allclose(
        held_after["tier1"].to_numpy(dtype=float), 1000 * held_before["tier1"].to_numpy(dtype=float)
    )
