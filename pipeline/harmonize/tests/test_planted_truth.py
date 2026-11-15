"""Conditional US-only integration check; observed CSVs never provide truth."""

import subprocess
import sys

import pytest

from pipeline.common import config, io, paths
from pipeline.harmonize.tests.planted_truth import (
    compare_drift_exclusion,
    compare_outputs,
    comparison_table,
    us_truth_inputs,
    validate_truth,
)


def test_us_planted_truth():
    science = config.load_science()
    region = config.get_region("us")
    truth, reason = us_truth_inputs(region.id)
    if reason:
        print(comparison_table(skipped=True), flush=True)
        pytest.skip(reason)
    validate_truth(truth, science)
    # The truth hash binds the specific cell-days to the truth file.
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "pipeline.harmonize",
            "--region",
            region.id,
            "--pass",
            science["reference"]["pass"],
        ],
        cwd=paths.PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    print(result.stdout, end="")
    print(result.stderr, end="")
    assert result.returncode == 0, "The US harmonization stage failed"
    calibration = io.read_json(paths.harmonized_dir(region.id) / "calibration.json")
    assert calibration["region"] == region.id, "Recovered output is not for the United States"
    daily = io.read_parquet(paths.harmonized_dir(region.id) / "daily.parquet", "daily")
    rows = compare_outputs(truth, calibration, daily, science)
    rows.extend(
        compare_drift_exclusion(
            truth,
            io.read_parquet(paths.celldays(region.id), "celldays"),
            io.read_parquet(paths.coverage(region.id), "coverage"),
            science,
        )
    )
    table = comparison_table(rows)
    print(table, flush=True)
    assert all(row.passed for row in rows), table
