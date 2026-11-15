"""Explicit unit fixtures test the gate; no workspace truth.json is created."""

from copy import deepcopy
from datetime import date

import pandas as pd
import pytest

from pipeline.common import config, io, paths
from pipeline.harmonize.series import build_outputs
from pipeline.harmonize.tests.fabricate import planted_tables, series_tables
from pipeline.harmonize.tests.planted_truth import (
    compare_drift_exclusion,
    compare_outputs,
    comparison_table,
    expected_coefficients,
    us_truth_inputs,
    validate_truth,
)


def fixture_truth():
    """Known answers for the fabricated 4:8:10 tables, never actual US truth."""
    return {
        "region": "us",
        "country": "US",
        "verification": {"verified_by": "R4", "celldays_sha256": "0" * 64},
        "planted": {
            "outages": [{"sensor": "aqua", "start": "2020-06-01", "end": "2020-06-01"}],
            "aqua_drift_from": "2023-01-01",
            "expected_noaa20_method": "direct",
        },
        "expected": [
            {
                "quantity": "k_annual_snpp",
                "truth": 0.5,
                "tolerance": 0.03,
                "source_file": "calibration.json",
                "path": "k_annual.snpp.k",
            },
            {
                "quantity": "k_annual_noaa20",
                "truth": 0.4,
                "tolerance": 0.04,
                "source_file": "calibration.json",
                "path": "k_annual.noaa20.k",
            },
            {
                "quantity": "k_month_snpp",
                "truth": [0.5] * 12,
                "tolerance": 0.08,
                "source_file": "calibration.json",
                "path": "k.snpp[*].k",
            },
            {
                "quantity": "k_month_noaa20",
                "truth": [0.4] * 12,
                "tolerance": 0.08,
                "source_file": "calibration.json",
                "path": "k.noaa20[*].k",
            },
            {
                "quantity": "aqua_outage_days_missing",
                "truth": 1,
                "tolerance": 0,
                "source_file": "coverage.parquet",
                "path": "aqua covered=false in outage",
            },
        ],
    }


@pytest.fixture
def us_paths(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "data_root", lambda: tmp_path)
    cells, _ = planted_tables(["2019-01-01"])
    io.write_parquet(cells, paths.celldays("us"), "celldays")
    truth = fixture_truth()
    truth["verification"]["celldays_sha256"] = io.sha256(paths.celldays("us"))
    return paths.raw_dir("us") / "truth.json", truth


@pytest.fixture(scope="module")
def snapshot():
    cells, coverage = series_tables()
    science = config.load_science()
    result = build_outputs(cells, coverage, science, "us")
    return cells, coverage, science, result


def test_missing_truth_does_not_fall_back_to_other_region(us_paths):
    path, truth = us_paths
    other = path.parent.parent / "another_region" / "truth.json"
    io.write_json(truth, other)
    actual, reason = us_truth_inputs("us")
    assert actual is None
    assert "no R4-verified US truth.json" in reason
    assert "observations, not planted truth" in reason


def test_verified_truth_requires_exact_us_cell_hash(us_paths):
    path, truth = us_paths
    io.write_json(truth, path)
    actual, reason = us_truth_inputs("us")
    assert reason is None and actual == truth
    with paths.celldays("us").open("ab") as stream:
        stream.write(b"different input")
    actual, reason = us_truth_inputs("us")
    assert actual is None and "does not match" in reason


@pytest.mark.parametrize(
    "field,value,reason_fragment",
    [
        ("region", "another_region", "configured US region"),
        ("country", "CA", "configured US region"),
        ("verification", {"verified_by": "someone_else"}, "explicit R4 verification"),
    ],
)
def test_unverified_or_non_us_truth_is_skipped(us_paths, field, value, reason_fragment):
    path, truth = us_paths
    truth[field] = value
    io.write_json(truth, path)
    actual, reason = us_truth_inputs("us")
    assert actual is None and reason_fragment in reason


def test_absent_matching_cells_skip(us_paths):
    path, truth = us_paths
    io.write_json(truth, path)
    paths.celldays("us").unlink()
    actual, reason = us_truth_inputs("us")
    assert actual is None and "matching US celldays are absent" in reason


def test_symlink_truth_is_never_read_as_us_truth(us_paths):
    path, truth = us_paths
    other = path.parent.parent / "another_region" / "truth.json"
    io.write_json(truth, other)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        path.symlink_to(other)
    except OSError:
        pytest.skip("Test symlinks unavailable on this platform")
    actual, reason = us_truth_inputs("us")
    assert actual is None and "symlinked input" in reason


def test_missing_monthly_truth_is_not_inferred_from_zero_error_target():
    truth = fixture_truth()
    truth["expected"][2]["truth"] = 0
    with pytest.raises(AssertionError, match="twelve explicit monthly truth values"):
        expected_coefficients(truth)


def test_unreadable_truth_skips_with_explicit_reason(us_paths):
    path, _ = us_paths
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{malformed", encoding="utf-8")
    actual, reason = us_truth_inputs("us")
    assert actual is None and "truth.json cannot be verified" in reason


def test_scalar_month_expectations_and_per_month_tolerances():
    truth = fixture_truth()
    vector = truth["expected"].pop(2)
    for index in range(12):
        truth["expected"].append({**vector, "path": f"k.snpp[{index}].k", "truth": 0.5, "tolerance": 0.08})
    truth["expected"][2]["tolerance"] = [0.09] * 12
    expected = expected_coefficients(truth)
    assert len(expected) == 26
    assert len([row for row in expected if row.sensor == "snpp" and row.month is not None]) == 12
    assert all(row.tolerance == 0.09 for row in expected if row.sensor == "noaa20" and row.month is not None)


@pytest.mark.parametrize("invalid", [-1, float("nan"), float("inf")])
def test_invalid_tolerances_fail_without_stage_run(invalid):
    truth = fixture_truth()
    truth["expected"][0]["tolerance"] = invalid
    with pytest.raises(AssertionError, match="finite|non-negative"):
        expected_coefficients(truth)


def test_fabricated_snapshot_comparisons_and_drift_pass(snapshot):
    cells, coverage, science, result = snapshot
    truth = fixture_truth()
    rows = compare_outputs(truth, result.calibration, result.daily, science)
    rows.extend(compare_drift_exclusion(truth, cells, coverage, science))
    assert len(rows) == 32
    assert all(row.passed for row in rows)
    assert "| k_month_noaa20_12 | 0.4 |" in comparison_table(rows)


def test_monthly_method_and_outage_failures_are_visible(snapshot):
    _, _, science, result = snapshot
    calibration = deepcopy(result.calibration)
    calibration["k"]["snpp"][5]["k"] = 0.7
    calibration["noaa20_method"] = "chained"
    daily = result.daily.copy()
    outage = daily["local_day"].eq(date(2020, 6, 1)) & daily["series"].isin(["aqua_raw", "harmonized"])
    daily = daily.loc[~outage]
    rows = compare_outputs(fixture_truth(), calibration, daily, science)
    failed = {row.quantity for row in rows if not row.passed}
    assert failed == {
        "k_month_snpp_06",
        "noaa20_method",
        "aqua_outage_days_missing",
        "aqua_outage_days_filled",
    }
    assert "FAIL" in comparison_table(rows)


def test_configured_training_window_must_precede_planted_drift(snapshot):
    _, _, science, _ = snapshot
    truth = fixture_truth()
    truth["planted"]["aqua_drift_from"] = "2021-01-01"
    with pytest.raises(AssertionError, match="overlaps"):
        validate_truth(truth, science)


def test_large_post_drift_aqua_change_leaves_truth_recovery_unchanged(snapshot):
    cells, coverage, science, _ = snapshot
    extra = cells.loc[cells["sensor"].eq("aqua") & cells["local_day"].ge(date(2023, 1, 1))].copy()
    extra["h3_r6"] += "-post-drift"
    changed = pd.concat([cells, extra], ignore_index=True)
    rows = compare_drift_exclusion(fixture_truth(), changed, coverage, science)
    assert all(row.passed for row in rows)


def test_drift_comparison_detects_a_window_that_includes_post_drift_data(snapshot):
    cells, coverage, science, _ = snapshot
    changed_science = deepcopy(dict(science))
    changed_science["tier1"]["snpp_fit"][1] = "2025-12-31"
    extra = cells.loc[cells["sensor"].eq("aqua") & cells["local_day"].ge(date(2023, 1, 1))].copy()
    extra["h3_r6"] += "-contaminated-year"
    changed = pd.concat([cells, extra], ignore_index=True)
    rows = compare_drift_exclusion(fixture_truth(), changed, coverage, changed_science)
    assert not any(row.passed for row in rows)


def test_skip_table_never_claims_recovery():
    table = comparison_table(skipped=True)
    assert "| quantity | truth | recovered | tolerance | pass |" in table
    assert "| k_annual_snpp | unavailable | not run | unavailable | SKIP |" in table
    assert "PASS" not in table
