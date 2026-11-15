"""SD-06 year-block uncertainty, using cached year/month sufficient statistics.

No IO occurs here. Production annual binning is delegated to common.timebins;
the optional aggregator argument supports isolated contract spies in tests.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from copy import deepcopy
from dataclasses import dataclass
from typing import TYPE_CHECKING

import numpy as np
import pandas as pd

from pipeline.harmonize.calibrate import paired_fit_days

if TYPE_CHECKING:
    from pipeline.harmonize.series import CalibrationFits


@dataclass
class FitSums:
    years: np.ndarray
    numerator: np.ndarray
    denominator: np.ndarray


@dataclass
class BootstrapDraws:
    """Matching replicate rows for both sensors and their configured fit years."""

    monthly: dict[str, np.ndarray]
    annual: dict[str, np.ndarray]
    weights: dict[str, tuple[np.ndarray, np.ndarray]]

    @property
    def size(self) -> int:
        return len(self.annual["snpp"])


def precompute_fit_sums(aqua_daily, viirs_daily, start, end) -> FitSums:
    """Cache raw sums on exactly the same eligible days as fit_k.

    Empty calendar years remain in the resampling population. They must not be
    silently dropped: that would change the specified year-block bootstrap.
    """
    pairs = paired_fit_days(aqua_daily, viirs_daily, start, end)
    years = np.arange(pd.Timestamp(start).year, pd.Timestamp(end).year + 1)
    pairs["year"] = pairs["local_day"].dt.year
    pairs["month"] = pairs["local_day"].dt.month
    grid = pd.MultiIndex.from_product([years, range(1, 13)], names=["year", "month"])
    totals = pairs.groupby(["year", "month"])[["count_aqua", "count_viirs"]].sum().reindex(grid, fill_value=0)
    return FitSums(
        years,
        totals["count_aqua"].to_numpy(dtype=float).reshape(len(years), 12),
        totals["count_viirs"].to_numpy(dtype=float).reshape(len(years), 12),
    )


def _resample(sums: FitSums, b: int, n0: float, rng):
    n_years = len(sums.years)
    if not n_years:
        raise ValueError("Bootstrap fit window has no calendar years")
    weights = rng.multinomial(n_years, np.full(n_years, 1 / n_years), size=b)
    numerator = weights @ sums.numerator
    denominator = weights @ sums.denominator
    annual_denominator = denominator.sum(axis=1)
    if (annual_denominator == 0).any():
        failed = np.flatnonzero(annual_denominator == 0).tolist()
        raise ValueError(
            f"Bootstrap replicates {failed} have zero VIIRS totals; "
            "no undefined replicate was discarded or redrawn"
        )
    annual = numerator.sum(axis=1) / annual_denominator
    monthly = (numerator + n0 * annual[:, None]) / (denominator + n0)
    return monthly, annual, weights


def bootstrap_k(
    counts: Mapping[str, pd.DataFrame], science: Mapping, fits: CalibrationFits
) -> BootstrapDraws:
    """Refit both sensors by resampling each configured fit-year population.

    A chained NOAA-20 draw multiplies that same replicate's S-NPP draw by a
    resampled S-NPP/NOAA-20 ratio. RNG streams are separate for the two windows,
    so NOAA-20 availability never changes S-NPP's seeded draws.
    """
    tier1 = science["tier1"]
    b, n0 = tier1["bootstrap_b"], tier1["n0"]
    if not isinstance(b, int) or b <= 0:
        raise ValueError("tier1.bootstrap_b must be a positive integer")
    if not np.isfinite(n0) or n0 <= 0:
        raise ValueError("tier1.n0 must be finite and positive")
    streams = np.random.SeedSequence(science["seed"]).spawn(2)
    snpp_sums = precompute_fit_sums(counts["aqua"], counts["snpp"], *tier1["snpp_fit"])
    monthly, annual, weights = _resample(snpp_sums, b, n0, np.random.default_rng(streams[0]))
    result = BootstrapDraws({"snpp": monthly}, {"snpp": annual}, {"snpp": (snpp_sums.years, weights)})
    if fits.noaa20_method is not None:
        start = pd.Timestamp(year=fits.n20_first_full_year, month=1, day=1)
        direct = fits.noaa20_method == "direct"
        end = tier1["snpp_fit"][1] if direct else science["eras"]["snpp_through"]
        sums = precompute_fit_sums(counts["aqua" if direct else "snpp"], counts["noaa20"], start, end)
        n20_monthly, n20_annual, n20_weights = _resample(sums, b, n0, np.random.default_rng(streams[1]))
        if not direct:
            n20_monthly *= result.monthly["snpp"]
            n20_annual *= result.annual["snpp"]
        result.monthly["noaa20"], result.annual["noaa20"] = n20_monthly, n20_annual
        result.weights["noaa20"] = (sums.years, n20_weights)
    if not tier1["monthly"]:
        result.monthly = {
            sensor: np.repeat(annual[:, None], 12, axis=1) for sensor, annual in result.annual.items()
        }
    return result


def with_intervals(document: Mapping, draws: BootstrapDraws, percentiles) -> dict:
    """Copy calibration metadata and attach the exact configured percentiles.

    A percentile interval need not contain the point estimate; no bound is
    widened to force that containment. Unavailable sensors keep their nulls.
    """
    percentiles = np.asarray(percentiles, dtype=float)
    if (
        percentiles.shape != (2,)
        or not np.isfinite(percentiles).all()
        or not (0 <= percentiles[0] < percentiles[1] <= 100)
    ):
        raise ValueError("interval_percentiles must be two ordered percentiles")
    result = deepcopy(document)
    for sensor, monthly in draws.monthly.items():
        if not np.isfinite(monthly).all() or not np.isfinite(draws.annual[sensor]).all():
            raise ValueError("Bootstrap factors must be finite")
        lower, upper = np.percentile(monthly, percentiles, axis=0)
        annual_bounds = np.percentile(draws.annual[sensor], percentiles)
        result["k_annual"][sensor].update(lo=float(annual_bounds[0]), hi=float(annual_bounds[1]))
        for row in result["k"][sensor]:
            month = row["month"] - 1
            row.update(lo=float(lower[month]), hi=float(upper[month]))
    return result


def complete_year_limit(last_day, as_of) -> int:
    """Exclude both the current calendar year and a partial final data year."""
    last, today = pd.Timestamp(last_day), pd.Timestamp(as_of)
    if pd.isna(last) or pd.isna(today):
        raise ValueError("last_day and as_of must be valid dates")
    return min(today.year - 1, last.year if last.is_year_end else last.year - 1)


def annual_bootstrap(
    daily: pd.DataFrame,
    draws: BootstrapDraws,
    science: Mapping,
    last_complete_year: int,
    *,
    aggregate: Callable | None = None,
) -> pd.DataFrame:
    """Aggregate linear daily components once, then multiply all replicate k.

    Every component has the harmonized series' identical null-day mask, so
    common's coverage scaling applies equally to observed and translated parts.
    Observed Aqua contributions never vary; actual outage fills still do.
    """
    start_year = pd.Timestamp(science["eras"]["record_start"]).year
    years = np.arange(start_year, last_complete_year + 1, dtype=np.int32)
    columns = {
        "replicate": pd.Series(dtype="int32"),
        "year": pd.Series(dtype="int32"),
        "harmonized": pd.Series(dtype="Float64"),
    }
    if not len(years):
        return pd.DataFrame(columns)
    if aggregate is None:
        from pipeline.common.timebins import aggregate

    harmonic = daily.loc[daily["series"].eq("harmonized")].copy()
    harmonic["local_day"] = pd.to_datetime(harmonic["local_day"])
    harmonic = harmonic.set_index("local_day").sort_index()
    days = pd.date_range(
        science["eras"]["record_start"],
        pd.Timestamp(year=last_complete_year, month=12, day=31),
    )
    harmonic = harmonic.reindex(days)
    covered = harmonic["covered"].eq(True)
    observed = harmonic["kind"].eq("observed") & covered
    components = pd.DataFrame(index=days)
    components["observed"] = harmonic["value"].where(observed, 0).astype("Float64").where(covered)
    for sensor in ("snpp", "noaa20"):
        raw = daily.loc[daily["series"].eq(f"{sensor}_raw"), ["local_day", "value"]].copy()
        raw["local_day"] = pd.to_datetime(raw["local_day"])
        raw = raw.set_index("local_day")["value"].reindex(days)
        translated = harmonic["source"].eq(sensor) & harmonic["kind"].eq("harmonized") & covered
        if translated.any() and sensor not in draws.monthly:
            raise ValueError(f"No bootstrap calibration for harmonized source {sensor}")
        if raw[translated].isna().any():
            raise ValueError(f"Missing raw counts for harmonized source {sensor}")
        for month in range(1, 13):
            active = translated & (days.month == month)
            components[f"{sensor}_{month}"] = raw.where(active, 0).astype("Float64").where(covered)
    names = list(components.columns)
    components.index.name = "local_day"
    annual = (
        aggregate(components.reset_index(), grain="year", value_cols=names).set_index("year").reindex(years)
    )
    values = np.broadcast_to(
        annual["observed"].to_numpy(dtype=float, na_value=np.nan),
        (draws.size, len(years)),
    ).copy()
    for sensor, factors in draws.monthly.items():
        coefficients = annual[[f"{sensor}_{month}" for month in range(1, 13)]].to_numpy(
            dtype=float, na_value=np.nan
        )
        values += factors @ coefficients.T
    present = values[np.isfinite(values)]
    if np.isinf(values).any() or (present < 0).any():
        raise ValueError("Annual bootstrap totals must be finite and non-negative or null")
    return pd.DataFrame(
        {
            "replicate": np.repeat(np.arange(draws.size, dtype=np.int32), len(years)),
            "year": np.tile(years, draws.size),
            "harmonized": pd.array(values.ravel(), dtype="Float64"),
        }
    )
