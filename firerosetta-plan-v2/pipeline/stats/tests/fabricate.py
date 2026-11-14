"""Fabricated daily.parquet tables (contracts 5.8) with known answers, for stats tests."""

from __future__ import annotations

import calendar
import json
from collections.abc import Callable, Iterable
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

# Test constants: the SD-08 / SD-10 values of contracts 4.2, so expected answers are literal.
SCIENCE = {
    "seed": 7,
    "eras": {"record_start": "2003-01-01", "aqua_trusted_through": "2022-12-31",
             "snpp_through": "2025-12-31", "snpp_first_day": "2012-01-20"},
    "tier1": {"snpp_fit": ["2013-01-01", "2022-12-31"]},
    "climatology": {"baseline_years": [2003, 2025], "smooth_weeks": 3},
    "timebins": {"week_min_covered_days": 5, "month_min_covered_frac": 0.8, "year_min_covered_frac": 0.9},
    "trend": {"years": [2003, 2025], "bootstrap_b": 1000, "artifact_gap_points": 10},
    "season": {"critical_share": 0.8, "max_windows": 2, "min_window_share": 0.15, "extend_weeks": 4,
               "min_year_celldays": 20},
}
CONTRACTS = Path(__file__).resolve().parents[3] / "contracts"
PARQUET_SERIES = ("aqua_raw", "snpp_raw", "viirs_raw", "viirs_as_aqua", "harmonized", "viirs_equiv_t1")
HEADER = {"schema_version": "1.0", "generated_at": "2026-11-14T00:00:00Z", "code_version": "test"}


def era(series: str, d: date) -> tuple[str, str]:
    """(kind, source) following SD-05 for harmonized and the 5.8 series table otherwise."""
    if series == "harmonized":
        if d <= date(2022, 12, 31):
            return "observed", "aqua"
        return ("harmonized", "snpp") if d <= date(2025, 12, 31) else ("harmonized", "noaa20")
    if series == "viirs_equiv_t1" and d < date(2012, 1, 20):
        return "estimated", "aqua"
    if series in ("viirs_as_aqua",):
        return "harmonized", "snpp"
    return "observed", "aqua" if series == "aqua_raw" else "snpp"


def daily_table(start: date, end: date, value: Callable[[date], float] | float = 2.0,
                uncovered: Iterable[date] = (), series: Iterable[str] = PARQUET_SERIES,
                kind_source: Callable[[str, date], tuple[str, str]] = era) -> pd.DataFrame:
    gaps = set(uncovered)
    rows = []
    n = (end - start).days + 1
    for s in series:
        for i in range(n):
            d = start + timedelta(i)
            if d in gaps:
                rows.append((d, s, None, None, None, "missing", None, False))
                continue
            v = value(d) if callable(value) else value
            kind, source = kind_source(s, d)
            lo, hi = (v * 0.9, v * 1.1) if kind in ("harmonized", "estimated") else (v, v)
            rows.append((d, s, v, lo, hi, kind, source, True))
    return pd.DataFrame(rows, columns=["local_day", "series", "value", "lo", "hi", "kind", "source", "covered"])


# ------------------------------------------------------------------ annual-driven tables (B2)
def annual_daily(per_series: dict[str, dict[int, float]], first_year: int = 2003, last_year: int = 2025,
                 uncovered: Iterable[date] = ()) -> pd.DataFrame:
    """Daily table whose coverage-scaled annual total of each series equals the given value."""
    parts = []
    for series, annual in per_series.items():
        parts.append(daily_table(
            date(first_year, 1, 1), date(last_year, 12, 31),
            lambda d, a=annual: a[d.year] / (366 if calendar.isleap(d.year) else 365),
            uncovered=uncovered, series=(series,)))
    return pd.concat(parts, ignore_index=True)


def annual_bootstrap(annual: dict[int, float], after_year: int = 2022, n_rep: int = 500,
                     rel_noise: float = 0.0, seed: int = 11) -> pd.DataFrame:
    """R3's 5.9 table: replicate, year, harmonized. Years after after_year get optional relative noise."""
    rng = np.random.default_rng(seed)
    rows = [(r, y, v * (1 + rel_noise * rng.standard_normal()) if y > after_year else v)
            for r in range(n_rep) for y, v in sorted(annual.items())]
    return pd.DataFrame(rows, columns=["replicate", "year", "harmonized"])


def naive_annual(modis: dict[int, float], snpp: dict[int, float | None], frac: float = 1.0) -> pd.DataFrame:
    """R3's 5.11 Parquet: year, modis_count, snpp_count, modis_covered_frac, snpp_covered_frac."""
    rows = [(y, modis[y] * frac, None if snpp.get(y) is None else snpp[y] * frac, frac,
             None if snpp.get(y) is None else frac) for y in sorted(modis)]
    return pd.DataFrame(rows, columns=["year", "modis_count", "snpp_count", "modis_covered_frac", "snpp_covered_frac"])


def contract_validator(name: str) -> Draft202012Validator:
    registry = Registry().with_resources(
        (p.name, Resource.from_contents(json.loads(p.read_text(encoding="utf-8")), default_specification=DRAFT202012))
        for p in CONTRACTS.glob("*.schema.json"))
    return Draft202012Validator(json.loads((CONTRACTS / f"{name}.schema.json").read_text(encoding="utf-8")),
                                registry=registry)
