"""Fabricated daily.parquet tables (contracts 5.8) with known answers, for stats tests."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from datetime import date, timedelta

import pandas as pd

# Test constants: the SD-08 / SD-10 values of contracts 4.2, so expected answers are literal.
SCIENCE = {
    "climatology": {"baseline_years": [2003, 2025], "smooth_weeks": 3},
    "timebins": {"week_min_covered_days": 5, "month_min_covered_frac": 0.8, "year_min_covered_frac": 0.9},
}
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
