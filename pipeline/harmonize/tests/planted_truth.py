"""US planted-truth gate and comparisons, used only by tests.

R4 must supply data/raw/us/truth.json with the existing expected and
planted structure from its role primer. R3 approved these additional fields:
region='us', country='US', and verification containing verified_by=
'R4' plus celldays_sha256. No truth values are inferred from observed outputs.

Coefficient expectations use source_file='calibration.json' and paths such as
k_annual.snpp.k or k.snpp[0].k. A k.snpp[*].k row may instead supply twelve
explicit truth values and a scalar tolerance or twelve explicit tolerances.
Both sensors need all months. Existing planted.outages, aqua_drift_from,
expected_noaa20_method and the aqua_outage_days_missing expectation are required.
"""

import json
import math
import re
from dataclasses import dataclass
from datetime import date
from numbers import Real

import numpy as np
import pandas as pd

from pipeline.common import io, paths
from pipeline.harmonize.calibrate import daily_counts
from pipeline.harmonize.series import SENSORS, fit_calibrations

VIIRS = ("snpp", "noaa20")
SKIPPED_QUANTITIES = (
    "k_annual_snpp",
    "k_annual_noaa20",
    "monthly_k_snpp (12 months)",
    "monthly_k_noaa20 (12 months)",
    "Aqua outage missing/fill checks",
    "noaa20_method",
    "pre-drift fit and drift exclusion",
)


@dataclass(frozen=True)
class ExpectedK:
    sensor: str
    month: int | None
    truth: float
    tolerance: float

    @property
    def quantity(self):
        return f"k_annual_{self.sensor}" if self.month is None else f"k_month_{self.sensor}_{self.month:02d}"


@dataclass(frozen=True)
class Comparison:
    quantity: str
    truth: object
    recovered: object
    tolerance: object
    passed: bool


def us_truth_inputs(region):
    """Return verified truth, or an explicit skip reason; never search elsewhere."""
    truth_path = paths.raw_dir(region) / "truth.json"
    cells_path = paths.celldays(region)
    for path in (truth_path, cells_path):
        if path.resolve() != path.absolute():
            return None, f"US planted-truth checks skipped: symlinked input is not verified: {path}"
    if not truth_path.is_file():
        return None, (
            f"US planted-truth checks skipped: no R4-verified US truth.json at {truth_path}; "
            "the supplied US CSVs are observations, not planted truth"
        )
    if not cells_path.is_file():
        return None, f"US planted-truth checks skipped: matching US celldays are absent at {cells_path}"
    try:
        truth = io.read_json(truth_path)
    except (OSError, json.JSONDecodeError) as exc:
        return None, f"US planted-truth checks skipped: truth.json cannot be verified: {exc}"
    if not isinstance(truth, dict) or truth.get("region") != region or truth.get("country") != "US":
        return None, "US planted-truth checks skipped: truth.json does not identify the configured US region"
    verification = truth.get("verification")
    if not isinstance(verification, dict) or verification.get("verified_by") != "R4":
        return None, "US planted-truth checks skipped: truth.json has no explicit R4 verification"
    try:
        cells_hash = io.sha256(cells_path)
    except OSError as exc:
        return None, f"US planted-truth checks skipped: matching US celldays cannot be verified: {exc}"
    if verification.get("celldays_sha256") != cells_hash:
        return None, "US planted-truth checks skipped: R4's US truth does not match the current celldays hash"
    return truth, None


def _number(value, label):
    assert isinstance(value, Real) and not isinstance(value, bool) and math.isfinite(value), (
        f"{label} must be an explicit finite number in truth.json"
    )
    return float(value)


def _tolerance(value, label):
    value = _number(value, label)
    assert value >= 0, f"{label} must be non-negative"
    return value


def expected_coefficients(truth):
    """Read all 26 expected k values without guessing absent monthly values."""
    expected = {}
    for row in truth["expected"]:
        if row.get("source_file") != "calibration.json":
            continue
        path = row["path"]
        annual = re.fullmatch(r"k_annual\.(snpp|noaa20)\.k", path)
        monthly = re.fullmatch(r"k\.(snpp|noaa20)\[(\*|\d+)\]\.k", path)
        assert annual or monthly, f"Unsupported calibration expectation path: {path}"
        if annual:
            entries = [(annual[1], None, row["truth"], row["tolerance"])]
        elif monthly[2] == "*":
            values = row["truth"]
            assert isinstance(values, list) and len(values) == 12, (
                f"{path} requires twelve explicit monthly truth values; an error target of zero is not truth"
            )
            tolerances = row["tolerance"]
            if not isinstance(tolerances, list):
                tolerances = [tolerances] * 12
            assert len(tolerances) == 12, f"{path} needs one tolerance or twelve tolerances"
            entries = [
                (monthly[1], month, value, tolerance)
                for month, value, tolerance in zip(range(1, 13), values, tolerances, strict=True)
            ]
        else:
            index = int(monthly[2])
            assert 0 <= index < 12, f"Invalid monthly index in {path}"
            entries = [(monthly[1], index + 1, row["truth"], row["tolerance"])]
        for sensor, month, value, tolerance in entries:
            key = sensor, month
            assert key not in expected, f"Duplicate truth expectation for {key}"
            expected[key] = ExpectedK(sensor, month, _number(value, path), _tolerance(tolerance, path))
    required = {(sensor, month) for sensor in VIIRS for month in (None, *range(1, 13))}
    assert set(expected) == required, (
        f"Missing US k expectations: {sorted(map(str, required - set(expected)))}"
    )
    return [expected[sensor, month] for sensor in VIIRS for month in (None, *range(1, 13))]


def outage_days(truth):
    days = set()
    for outage in truth["planted"]["outages"]:
        if outage["sensor"] != "aqua":
            continue
        start, end = date.fromisoformat(outage["start"]), date.fromisoformat(outage["end"])
        assert start <= end, "Planted Aqua outage dates are reversed"
        days.update(pd.date_range(start, end).date)
    assert days, "Verified US truth must identify the planted Aqua outage days"
    return sorted(days)


def validate_truth(truth, science):
    expected = expected_coefficients(truth)
    days = outage_days(truth)
    rows = [row for row in truth["expected"] if row["quantity"] == "aqua_outage_days_missing"]
    assert len(rows) == 1, "Truth needs one aqua_outage_days_missing expectation"
    assert _number(rows[0]["truth"], "aqua_outage_days_missing") == len(days), (
        "The expected outage count must agree with the explicit planted outage dates"
    )
    _tolerance(rows[0]["tolerance"], "aqua_outage_days_missing")
    planted = truth["planted"]
    assert planted["expected_noaa20_method"] in ("direct", "chained"), (
        "Truth must identify the NOAA-20 method"
    )
    drift = date.fromisoformat(planted["aqua_drift_from"])
    assert drift > date.fromisoformat(science["tier1"]["snpp_fit"][1]), (
        "Planted drift overlaps the configured S-NPP training window"
    )
    assert drift > date.fromisoformat(science["eras"]["aqua_trusted_through"]), (
        "Planted post-Aqua drift must start after the trusted Aqua era"
    )
    return expected


def _numeric_comparison(expected, recovered):
    finite = isinstance(recovered, Real) and not isinstance(recovered, bool) and math.isfinite(recovered)
    return Comparison(
        expected.quantity,
        expected.truth,
        recovered,
        expected.tolerance,
        bool(finite and abs(recovered - expected.truth) <= expected.tolerance),
    )


def compare_outputs(truth, calibration, daily, science):
    rows = []
    expected = validate_truth(truth, science)
    for sensor in VIIRS:
        months = calibration["k"][sensor]
        assert len(months) == 12 and {entry["month"] for entry in months} == set(range(1, 13)), (
            f"Recovered {sensor} calibration must contain all twelve months exactly once"
        )
        by_month = {entry["month"]: entry["k"] for entry in months}
        for item in (value for value in expected if value.sensor == sensor):
            recovered = calibration["k_annual"][sensor]["k"] if item.month is None else by_month[item.month]
            rows.append(_numeric_comparison(item, recovered))
    method = truth["planted"]["expected_noaa20_method"]
    rows.append(
        Comparison(
            "noaa20_method",
            method,
            calibration["noaa20_method"],
            "exact",
            method == calibration["noaa20_method"],
        )
    )
    expected_window = list(science["tier1"]["snpp_fit"])
    actual_window = calibration["fit_window"]["snpp"]
    rows.append(
        Comparison(
            "snpp_fit_window", expected_window, actual_window, "exact", actual_window == expected_window
        )
    )
    days = outage_days(truth)
    indexed = daily.set_index(["local_day", "series"])
    assert indexed.index.is_unique, "Daily output has duplicate local_day/series rows"
    aqua = indexed.reindex(pd.MultiIndex.from_tuples([(day, "aqua_raw") for day in days]))
    harmonic = indexed.reindex(pd.MultiIndex.from_tuples([(day, "harmonized") for day in days]))
    missing = (
        aqua["kind"].eq("missing")
        & aqua["covered"].eq(False)
        & aqua[["value", "lo", "hi"]].isna().all(axis=1)
    )
    numeric = harmonic[["value", "lo", "hi"]].to_numpy(dtype=float, na_value=np.nan)
    filled = (
        harmonic["kind"].eq("harmonized")
        & harmonic["covered"].eq(True)
        & harmonic["source"].isin(VIIRS)
        & np.isfinite(numeric).all(axis=1)
        & (numeric >= 0).all(axis=1)
    )
    expected_outage = next(row for row in truth["expected"] if row["quantity"] == "aqua_outage_days_missing")
    rows.append(
        Comparison(
            "aqua_outage_days_missing",
            expected_outage["truth"],
            int(missing.sum()),
            expected_outage["tolerance"],
            bool(missing.fillna(False).all()),
        )
    )
    rows.append(
        Comparison(
            "aqua_outage_days_filled", len(days), int(filled.sum()), "exact", bool(filled.fillna(False).all())
        )
    )
    return rows


def compare_drift_exclusion(truth, celldays, coverage, science):
    """Refit without every post-drift Aqua observation and check pre-drift truth."""
    drift = date.fromisoformat(truth["planted"]["aqua_drift_from"])
    counts = {
        sensor: daily_counts(celldays, coverage, sensor, science["reference"]["pass"]) for sensor in SENSORS
    }
    assert (counts["aqua"]["local_day"].ge(drift) & counts["aqua"]["covered"]).any(), (
        "Cannot verify planted drift: no covered post-drift Aqua days exist"
    )
    full = fit_calibrations(counts, celldays, science)
    pre_counts = dict(counts)
    pre_counts["aqua"] = counts["aqua"].loc[counts["aqua"]["local_day"].lt(drift)].copy()
    pre_cells = celldays.loc[~(celldays["sensor"].eq("aqua") & celldays["local_day"].ge(drift))].copy()
    before = fit_calibrations(pre_counts, pre_cells, science)
    expected = expected_coefficients(truth)
    rows = []
    for sensor in VIIRS:
        full_fit = full.snpp if sensor == "snpp" else full.noaa20
        pre_fit = before.snpp if sensor == "snpp" else before.noaa20
        unchanged = full_fit is not None and pre_fit is not None
        if unchanged:
            unchanged = full_fit[1] == pre_fit[1] and np.array_equal(full_fit[0]["k"], pre_fit[0]["k"])
            for item in (value for value in expected if value.sensor == sensor):
                actual = (
                    pre_fit[1]
                    if item.month is None or not science["tier1"]["monthly"]
                    else pre_fit[0].set_index("month").loc[item.month, "k"]
                )
                unchanged = unchanged and _numeric_comparison(item, actual).passed
        rows.append(Comparison(f"drift_exclusion_{sensor}", True, bool(unchanged), "exact", bool(unchanged)))
    return rows


def comparison_table(rows=(), *, skipped=False):
    lines = ["| quantity | truth | recovered | tolerance | pass |", "|---|---|---|---|---|"]
    if skipped:
        lines.extend(
            f"| {quantity} | unavailable | not run | unavailable | SKIP |" for quantity in SKIPPED_QUANTITIES
        )
    else:
        lines.extend(
            f"| {row.quantity} | {row.truth} | {row.recovered} | {row.tolerance} | {'PASS' if row.passed else 'FAIL'} |"
            for row in rows
        )
    return "\n".join(lines)
