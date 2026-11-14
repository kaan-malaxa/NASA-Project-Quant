"""Pure Tier 1 calibration (SD-06).

Callers supply dates, shrinkage and method thresholds from load_science().
Monthly totals are raw sums on jointly covered days, never coverage-scaled.
"""

from collections.abc import Iterable
from typing import Literal

import numpy as np
import pandas as pd


def _dated(frame: pd.DataFrame) -> pd.DataFrame:
    """Copy a daily table and reject ambiguous day/coverage records."""
    result = frame.copy()
    result["local_day"] = pd.to_datetime(result["local_day"], errors="raise")
    if result["local_day"].isna().any():
        raise ValueError("local_day must not be null")
    if result["local_day"].duplicated().any():
        raise ValueError("Expected exactly one row per local_day")
    if result["covered"].isna().any() or not pd.api.types.is_bool_dtype(
        result["covered"]
    ):
        raise ValueError("covered must contain non-null booleans")
    return result


def daily_counts(
    celldays: pd.DataFrame,
    coverage: pd.DataFrame,
    sensor: str,
    pass_: str = "D",
) -> pd.DataFrame:
    """Count distinct cells by covered local day for one sensor and pass.

    Coverage defines the output days. Uncovered days have nullable counts;
    covered days without detections have zero counts. Inputs are not modified.
    """
    days = _dated(coverage.loc[coverage["sensor"].eq(sensor), ["local_day", "covered"]])
    selected = celldays.loc[
        celldays["sensor"].eq(sensor) & celldays["daynight"].eq(pass_),
        ["local_day", "h3_r6"],
    ].copy()
    selected["local_day"] = pd.to_datetime(selected["local_day"], errors="raise")
    if selected.isna().any().any():
        raise ValueError("Selected cell-days must have local_day and h3_r6")
    counts = selected.groupby("local_day")["h3_r6"].nunique()
    days["count"] = days["local_day"].map(counts).fillna(0).astype("Float64")
    days.loc[~days["covered"], "count"] = pd.NA
    days = days.sort_values("local_day").reset_index(drop=True)
    days["local_day"] = days["local_day"].dt.date
    return days[["local_day", "count", "covered"]]


def fit_k(
    aqua_daily: pd.DataFrame,
    viirs_daily: pd.DataFrame,
    start,
    end,
    n0: float,
    exclude_years: Iterable[int] = (),
) -> tuple[pd.DataFrame, float]:
    """Return (monthly table, annual ratio) on jointly covered fit days.

    Bounds are inclusive. Whole excluded years are removed before summation.
    All twelve calendar months are returned; absent months shrink to the annual
    ratio. Covered, eligible counts must be finite and non-negative.
    """
    if not np.isfinite(n0) or n0 <= 0:
        raise ValueError("n0 must be finite and positive")
    start, end = pd.Timestamp(start), pd.Timestamp(end)
    if pd.isna(start) or pd.isna(end) or start > end:
        raise ValueError("Fit bounds must be valid dates with start <= end")
    aqua = _dated(aqua_daily[["local_day", "count", "covered"]])
    viirs = _dated(viirs_daily[["local_day", "count", "covered"]])
    pairs = aqua.merge(
        viirs, on="local_day", suffixes=("_aqua", "_viirs"), validate="one_to_one"
    )
    eligible = (
        pairs["local_day"].between(start, end)
        & ~pairs["local_day"].dt.year.isin(tuple(exclude_years))
        & pairs["covered_aqua"]
        & pairs["covered_viirs"]
    )
    pairs = pairs.loc[eligible].copy()
    for column in ("count_aqua", "count_viirs"):
        values = pairs[column].to_numpy(dtype=float, na_value=np.nan)
        if not np.isfinite(values).all() or (values < 0).any():
            raise ValueError(
                "Jointly covered fit counts must be finite and non-negative"
            )
        pairs[column] = values
    annual_aqua = pairs["count_aqua"].sum()
    annual_viirs = pairs["count_viirs"].sum()
    if annual_viirs == 0:
        raise ValueError(
            "Cannot fit k: total VIIRS cell-days is zero on jointly covered fit days"
        )
    k_annual = float(annual_aqua / annual_viirs)
    pairs["month"] = pairs["local_day"].dt.month
    monthly = (
        pairs.groupby("month")[["count_aqua", "count_viirs"]]
        .sum()
        .reindex(range(1, 13), fill_value=0)
        .rename(
            columns={"count_aqua": "aqua_celldays", "count_viirs": "viirs_celldays"}
        )
        .reset_index()
    )
    monthly["k"] = (monthly["aqua_celldays"] + n0 * k_annual) / (
        monthly["viirs_celldays"] + n0
    )
    return monthly[["month", "k", "aqua_celldays", "viirs_celldays"]], k_annual


def fit_chained(
    k_snpp: tuple[pd.DataFrame, float],
    snpp_daily: pd.DataFrame,
    noaa20_daily: pd.DataFrame,
    start,
    end,
    n0: float,
) -> tuple[pd.DataFrame, float]:
    """Multiply S-NPP's fit_k result by a shrunken S-NPP/NOAA-20 ratio.

    k_snpp is the (monthly table, annual ratio) pair returned by fit_k.
    Output aqua_celldays are Aqua-equivalent proxy totals (S-NPP totals times
    monthly k_snpp), not observed Aqua totals. viirs_celldays are NOAA-20 totals.
    The annual factor is k_snpp_annual times the annual S-NPP/NOAA-20 ratio.
    """
    snpp_monthly, snpp_annual = k_snpp
    factors = snpp_monthly.set_index("month")["k"]
    if factors.index.has_duplicates or set(factors.index) != set(range(1, 13)):
        raise ValueError("k_snpp must contain exactly one factor per calendar month")
    if (
        not np.isfinite(factors.to_numpy(dtype=float)).all()
        or factors.lt(0).any()
        or not np.isfinite(snpp_annual)
        or snpp_annual < 0
    ):
        raise ValueError("k_snpp factors must be finite and non-negative")
    ratio, ratio_annual = fit_k(snpp_daily, noaa20_daily, start, end, n0)
    snpp_k = ratio["month"].map(factors)
    ratio["k"] *= snpp_k
    ratio["aqua_celldays"] *= snpp_k
    return ratio, float(snpp_annual * ratio_annual)


def choose_noaa20_method(
    n20_first_full_year: int, fit_end_year: int, min_years: int
) -> Literal["direct", "chained"]:
    """Use a direct fit when the inclusive window has enough complete years."""
    if min_years <= 0:
        raise ValueError("min_years must be positive")
    full_years = max(0, fit_end_year - n20_first_full_year + 1)
    return "direct" if full_years >= min_years else "chained"
