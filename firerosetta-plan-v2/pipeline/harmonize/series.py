"""Pure construction of the SD-05 daily record and SD-06 calibration metadata."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import TYPE_CHECKING

import numpy as np
import pandas as pd

from pipeline.harmonize.calibrate import (
    choose_noaa20_method,
    daily_counts,
    fit_chained,
    fit_k,
)

if TYPE_CHECKING:
    from pipeline.harmonize.bootstrap import BootstrapDraws

Fit = tuple[pd.DataFrame, float]
SENSORS = ("aqua", "snpp", "noaa20")
SERIES = (
    "aqua_raw",
    "snpp_raw",
    "noaa20_raw",
    "viirs_raw",
    "snpp_as_aqua",
    "noaa20_as_aqua",
    "viirs_as_aqua",
    "harmonized",
    "viirs_equiv_t1",
)
VALUE_COLUMNS = ("value", "lo", "hi")


@dataclass
class CalibrationFits:
    """Keep both NOAA-20 candidates, including unavailability reasons, for V3."""

    snpp: Fit
    noaa20_direct: Fit | None
    noaa20_chained: Fit | None
    noaa20_method: str | None
    n20_first_full_year: int | None
    unavailable: dict[str, str]

    @property
    def noaa20(self) -> Fit | None:
        if self.noaa20_method is None:
            return None
        return getattr(self, f"noaa20_{self.noaa20_method}")


@dataclass
class SeriesResult:
    daily: pd.DataFrame
    calibration: dict
    fits: CalibrationFits
    bootstrap: BootstrapDraws | None = None
    annual_bootstrap: pd.DataFrame | None = None
    naive_annual: pd.DataFrame | None = None
    validation: dict | None = None


def first_noaa20_full_year(celldays: pd.DataFrame, min_detection_days: int) -> int | None:
    """Count distinct detection days, across passes, in the supplied cell-days.

    Multiple cells or passes on a day count once. The caller supplies the SD-06
    minimum from science.yaml, rather than embedding a scientific threshold.
    """
    if min_detection_days <= 0:
        raise ValueError("min_detection_days must be positive")
    dates = pd.to_datetime(celldays.loc[celldays["sensor"].eq("noaa20"), "local_day"], errors="raise")
    if dates.isna().any():
        raise ValueError("NOAA-20 cell-days must have valid local_day values")
    dates = dates.dt.normalize().drop_duplicates()
    counts = dates.groupby(dates.dt.year).size()
    qualifying = counts[counts >= min_detection_days]
    return int(qualifying.index.min()) if not qualifying.empty else None


def fit_calibrations(
    counts: Mapping[str, pd.DataFrame], celldays: pd.DataFrame, science: Mapping
) -> CalibrationFits:
    """Fit on configured windows only, retaining both NOAA-20 candidates.

    Insufficient direct-window data is recorded for validation. A method that
    SD-06 selects must actually be fit; it is never silently replaced by the
    other method. The no-qualifying-year case is the explicit absent case.
    """
    tier1, eras = science["tier1"], science["eras"]
    start, end = tier1["snpp_fit"]
    snpp = fit_k(counts["aqua"], counts["snpp"], start, end, tier1["n0"])
    first = first_noaa20_full_year(celldays, tier1["n20_min_detection_days"])
    if first is None:
        return CalibrationFits(snpp, None, None, None, None, {})
    method = choose_noaa20_method(first, pd.Timestamp(end).year, tier1["n20_min_fit_years"])
    n20_start = pd.Timestamp(year=first, month=1, day=1).date().isoformat()
    unavailable = {}

    def attempt(name, end_date, function):
        if pd.Timestamp(n20_start) > pd.Timestamp(end_date):
            unavailable[name] = "No calendar years inside the configured fit window"
            return None
        try:
            return function()
        except ValueError as exc:
            if "total VIIRS cell-days is zero" not in str(exc):
                raise
            unavailable[name] = str(exc)
            return None

    direct = attempt(
        "direct",
        end,
        lambda: fit_k(counts["aqua"], counts["noaa20"], n20_start, end, tier1["n0"]),
    )
    chained = attempt(
        "chained",
        eras["snpp_through"],
        lambda: fit_chained(
            snpp,
            counts["snpp"],
            counts["noaa20"],
            n20_start,
            eras["snpp_through"],
            tier1["n0"],
        ),
    )
    fits = CalibrationFits(snpp, direct, chained, method, first, unavailable)
    if fits.noaa20 is None:
        raise ValueError(f"NOAA-20 {method} calibration unavailable: {unavailable[method]}")
    return fits


def calibration_document(
    region: str, science: Mapping, fits: CalibrationFits, pass_: str | None = None
) -> dict:
    """Make the section-6.11 document, with point bands until B2 supplies them.

    In a chained fit, aqua_celldays are the Aqua-equivalent S-NPP proxy totals
    documented in fit_chained, rather than observed Aqua detections.
    """
    if science["scope"]["country"] != "US" or region != science["scope"]["region_id"]:
        raise ValueError("Only the configured United States data scope is permitted")
    eras, tier1 = science["eras"], science["tier1"]
    next_aqua = (pd.Timestamp(eras["aqua_trusted_through"]) + pd.Timedelta(days=1)).date()
    next_snpp = (pd.Timestamp(eras["snpp_through"]) + pd.Timedelta(days=1)).date()
    n20_start = (
        pd.Timestamp(year=fits.n20_first_full_year, month=1, day=1).date().isoformat()
        if fits.n20_first_full_year is not None
        else None
    )
    n20_end = tier1["snpp_fit"][1] if fits.noaa20_method == "direct" else eras["snpp_through"]
    pass_name = "day" if (pass_ or science["reference"]["pass"]) == "D" else "night"
    document = {
        "schema_version": "1.0",
        "region": region,
        "reference": f"{science['reference']['sensor']}_{pass_name}",
        "count_resolution": science["grid"]["count_res"],
        "shrinkage_n0": tier1["n0"],
        "eras": [
            {
                "from": eras["record_start"],
                "to": eras["aqua_trusted_through"],
                "source": "aqua",
                "kind": "observed",
            },
            {
                "from": next_aqua.isoformat(),
                "to": eras["snpp_through"],
                "source": "snpp",
                "kind": "harmonized",
            },
            {
                "from": next_snpp.isoformat(),
                "to": None,
                "source": "noaa20",
                "kind": "harmonized",
            },
        ],
        "fit_window": {
            "snpp": list(tier1["snpp_fit"]),
            "noaa20": [n20_start, n20_end] if n20_start else None,
        },
        "noaa20_method": fits.noaa20_method,
        "k_annual": {},
        "k": {},
    }
    for sensor, fit in (("snpp", fits.snpp), ("noaa20", fits.noaa20)):
        if fit is None:
            document["k_annual"][sensor] = {"k": None, "lo": None, "hi": None}
            document["k"][sensor] = []
            continue
        monthly, annual = fit
        document["k_annual"][sensor] = {"k": annual, "lo": annual, "hi": annual}
        document["k"][sensor] = [
            {
                "month": int(row.month),
                "k": float(row.k) if tier1["monthly"] else annual,
                "lo": float(row.k) if tier1["monthly"] else annual,
                "hi": float(row.k) if tier1["monthly"] else annual,
                "aqua_celldays": float(row.aqua_celldays),
                "viirs_celldays": float(row.viirs_celldays),
            }
            for row in monthly.itertuples(index=False)
        ]
    return document


def _raw(counts: pd.DataFrame, days: pd.DatetimeIndex, sensor: str) -> pd.DataFrame:
    indexed = counts.copy()
    indexed["local_day"] = pd.to_datetime(indexed["local_day"])
    indexed = indexed.set_index("local_day").reindex(days)
    covered = indexed["covered"].eq(True)
    values = indexed["count"].astype("Float64").where(covered)
    if values[covered].isna().any():
        raise ValueError(f"{sensor}: covered days must have a count")
    return pd.DataFrame(
        {
            "value": values,
            "lo": values,
            "hi": values,
            "kind": np.where(covered, "observed", "missing"),
            "source": sensor,
            "covered": covered,
        },
        index=days,
    )


def _translate(raw: pd.DataFrame, factors: list[dict], inverse: bool = False) -> pd.DataFrame:
    result = raw.copy()
    if factors:
        table = pd.DataFrame(factors).set_index("month")
        if table.index.has_duplicates or set(table.index) != set(range(1, 13)):
            raise ValueError("Calibration must contain one factor per calendar month")
        numeric = table[["k", "lo", "hi"]].to_numpy(dtype=float)
        if not np.isfinite(numeric).all() or (numeric < 0).any() or (table["lo"] > table["hi"]).any():
            raise ValueError("Calibration factors must be finite, non-negative, with lo <= hi")
        mapped = pd.DataFrame(
            {name: raw.index.month.map(table[name]).to_numpy() for name in ("k", "lo", "hi")},
            index=raw.index,
        )
    else:
        mapped = pd.DataFrame(np.nan, index=raw.index, columns=["k", "lo", "hi"])
    usable = raw["covered"] & mapped.notna().all(axis=1)
    if inverse:
        usable &= mapped.gt(0).all(axis=1)
    for output, factor in (
        ("value", "k"),
        ("lo", "hi" if inverse else "lo"),
        ("hi", "lo" if inverse else "hi"),
    ):
        result[output] = pd.Series(pd.NA, index=raw.index, dtype="Float64")
        if inverse:
            result.loc[usable, output] = raw.loc[usable, "value"] / mapped.loc[usable, factor]
        else:
            result.loc[usable, output] = raw.loc[usable, "value"] * mapped.loc[usable, factor]
    result["covered"] = usable
    result["kind"] = np.where(usable, "estimated" if inverse else "harmonized", "missing")
    return result


def build_daily_series(
    counts: Mapping[str, pd.DataFrame],
    coverage: pd.DataFrame,
    science: Mapping,
    calibration: Mapping,
) -> pd.DataFrame:
    """Build every section-5.8 row without filling any uncovered day with zero."""
    eras = science["eras"]
    end = pd.to_datetime(coverage["local_day"], errors="raise").max()
    if pd.isna(end) or end < pd.Timestamp(eras["record_start"]):
        raise ValueError("Coverage must reach at least eras.record_start")
    days = pd.date_range(eras["record_start"], end, freq="D", name="local_day")
    raw = {sensor: _raw(counts[sensor], days, sensor) for sensor in SENSORS}
    translated = {sensor: _translate(raw[sensor], calibration["k"][sensor]) for sensor in ("snpp", "noaa20")}
    snpp_era = days <= pd.Timestamp(eras["snpp_through"])

    def primary(frames):
        result = frames["noaa20"].copy()
        result.loc[snpp_era] = frames["snpp"].loc[snpp_era]
        return result

    viirs_raw, viirs_translated = primary(raw), primary(translated)
    harmonized = viirs_translated.copy()
    fallback = translated["snpp"].copy()
    fallback.loc[snpp_era] = translated["noaa20"].loc[snpp_era]
    use_fallback = ~harmonized["covered"] & fallback["covered"]
    harmonized.loc[use_fallback] = fallback.loc[use_fallback]
    aqua_era = days <= pd.Timestamp(eras["aqua_trusted_through"])
    harmonized.loc[aqua_era] = raw["aqua"].loc[aqua_era]
    aqua_outage = (
        aqua_era
        & (days >= pd.Timestamp(eras["snpp_first_day"]))
        & ~raw["aqua"]["covered"]
        & translated["snpp"]["covered"]
    )
    harmonized.loc[aqua_outage] = translated["snpp"].loc[aqua_outage]
    inverse = _translate(raw["aqua"], calibration["k"]["snpp"], inverse=True)
    viirs_equiv = viirs_raw.copy()
    before_viirs = days < pd.Timestamp(eras["snpp_first_day"])
    viirs_equiv.loc[before_viirs] = inverse.loc[before_viirs]
    frames = {f"{sensor}_raw": raw[sensor] for sensor in SENSORS}
    frames.update(
        {
            "viirs_raw": viirs_raw,
            "snpp_as_aqua": translated["snpp"],
            "noaa20_as_aqua": translated["noaa20"],
            "viirs_as_aqua": viirs_translated,
            "harmonized": harmonized,
            "viirs_equiv_t1": viirs_equiv,
        }
    )
    result = pd.concat(
        [frame.assign(series=name).reset_index() for name, frame in frames.items()],
        ignore_index=True,
    )
    for column in VALUE_COLUMNS:
        present = result[column].dropna().to_numpy(dtype=float)
        if not np.isfinite(present).all() or (present < 0).any():
            raise ValueError(f"Daily {column} must be finite and non-negative")
        if not result[column].notna().eq(result["covered"]).all():
            raise ValueError(f"Daily {column} must be null exactly on missing days")
    result["local_day"] = result["local_day"].dt.date
    return result[["local_day", "series", "value", "lo", "hi", "kind", "source", "covered"]].sort_values(
        ["local_day", "series"], ignore_index=True
    )


def build_outputs(
    celldays: pd.DataFrame,
    coverage: pd.DataFrame,
    science: Mapping,
    region: str,
    pass_: str | None = None,
) -> SeriesResult:
    """Fit and build the reference pass by default; an explicit N uses night rows."""
    if science["scope"]["country"] != "US" or region != science["scope"]["region_id"]:
        raise ValueError("Only the configured United States data scope is permitted")
    if pass_ is None:
        pass_ = science["reference"]["pass"]
    if pass_ not in ("D", "N"):
        raise ValueError("pass_ must be D or N")
    counts = {sensor: daily_counts(celldays, coverage, sensor, pass_) for sensor in SENSORS}
    fits = fit_calibrations(counts, celldays, science)
    document = calibration_document(region, science, fits, pass_)
    daily = build_daily_series(counts, coverage, science, document)
    return SeriesResult(daily, document, fits)
