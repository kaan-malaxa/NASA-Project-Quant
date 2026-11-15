"""Calendar files from the harmonized daily table: weekly, monthly, daily, climatology (contracts 6.2-6.5).

Input: data/harmonized/<region>/daily.parquet (contracts 5.8), one row per series per local day.
All week/month binning and coverage scaling (SD-08) is done by pipeline.common.timebins; this
module only maps series, picks each bin's kind, and computes the SD-10 climatology.
Pure functions: the caller passes the table, the science config and the header fields.
"""

from __future__ import annotations

from collections import Counter
from datetime import date, timedelta
from typing import Any

import numpy as np
import pandas as pd
from pipeline.common import timebins

# web series -> series in daily.parquet (R1 prompt B1; Tier 2 selection comes in D2)
SERIES_MAP = {
    "aqua_raw": "aqua_raw",
    "viirs_raw": "viirs_raw",
    "viirs_as_aqua": "viirs_as_aqua",
    "harmonized": "harmonized",
    "viirs_equiv": "viirs_equiv_t1",
}
# SD-17: when the eyesight curve is validated, the viirs_equiv lens comes from Tier 2 (daily_t2.parquet).
EQUIV_SOURCE = {"tier1": "viirs_equiv_t1", "tier2": "viirs_equiv_t2"}
LABELS = {
    "aqua_raw": "MODIS Aqua, as recorded",
    "viirs_raw": "VIIRS, as recorded",
    "viirs_as_aqua": "VIIRS translated to the Aqua scale",
    "harmonized": "Harmonized record",
    "viirs_equiv": "What VIIRS would have seen",
}
UNIT_DAY = {
    "aqua_raw": "fire cell-days per day",
    "viirs_raw": "fire cell-days per day",
    "viirs_as_aqua": "Aqua-equivalent fire cell-days per day",
    "harmonized": "Aqua-equivalent fire cell-days per day",
    "viirs_equiv": "VIIRS-equivalent fire cell-days per day",
}
# Series whose daily.json entry carries lo/hi columns (the others have lo = hi = value).
BANDED = ("harmonized", "viirs_as_aqua", "viirs_equiv")
# Majority-kind ties go to the less certain kind, so an estimate never looks observed
# (AGENTS science rule 4; B1: "ties: harmonized over observed").
KIND_TIE_ORDER = ("sample", "estimated", "harmonized", "observed")
QUANTILES = (("min", 0.0), ("p10", 0.10), ("p25", 0.25), ("p50", 0.50), ("p75", 0.75), ("p90", 0.90), ("max", 1.0))


def _num(x: Any) -> float | None:
    return None if x is None or pd.isna(x) else float(x)


def _str(x: Any) -> str | None:
    return None if x is None or pd.isna(x) else str(x)


def viirs_equiv_method(curve: dict[str, Any] | None) -> str:
    """SD-17: 'tier2' only when curve.json exists with status 'validated'; otherwise 'tier1'."""
    return "tier2" if curve is not None and curve.get("status") == "validated" else "tier1"


def series_map_for(method: str) -> dict[str, str]:
    return {**SERIES_MAP, "viirs_equiv": EQUIV_SOURCE[method]}


def series_frame(daily: pd.DataFrame, web_series: str, series_map: dict[str, str] = SERIES_MAP) -> pd.DataFrame:
    """One series of daily.parquet as local_day, value, lo, hi, kind, source, sorted by day.

    Observed days may store lo/hi as null; SD-07 says they equal value, so fill them from value.
    """
    f = daily.loc[daily["series"] == series_map[web_series],
                  ["local_day", "value", "lo", "hi", "kind", "source"]].copy()
    f["local_day"] = pd.to_datetime(f["local_day"]).dt.date
    if f["local_day"].duplicated().any():
        raise ValueError(f"daily table has duplicate days for series {series_map[web_series]}")
    for col in ("lo", "hi"):
        f[col] = f[col].where(f[col].notna() | f["value"].isna(), f["value"])
    return f.sort_values("local_day").reset_index(drop=True)


def majority_kind(counts: Counter[str]) -> str:
    rank = {k: i for i, k in enumerate(KIND_TIE_ORDER)}
    return min(counts, key=lambda k: (-counts[k], rank.get(k, len(rank)), k))


def _bin_last_day(year: int, grain: str, b: int) -> date:
    if grain == "month":
        return date(year + (b == 12), b % 12 + 1, 1) - timedelta(1)
    return date(year, 1, 1) + timedelta((b - 1) * 7 + timebins.days_in_week(year, b) - 1)


def _bin_of(d: date, grain: str) -> int:
    return timebins.week_of_year(d) if grain == "week" else d.month


def calendar_rows(daily: pd.DataFrame, grain: str, last_day: date,
                  series_map: dict[str, str] = SERIES_MAP) -> list[dict[str, Any]]:
    """Weekly or monthly rows for every web series. Bins ending after last_day are omitted."""
    rows = []
    for web in SERIES_MAP:
        f = series_frame(daily, web, series_map)
        agg = timebins.aggregate(f, grain, value_cols=("value", "lo", "hi"))
        covered = f[f["value"].notna()]
        kinds: dict[tuple[int, int], Counter[str]] = {}
        for d, k in zip(covered["local_day"], covered["kind"]):
            kinds.setdefault((d.year, _bin_of(d, grain)), Counter())[k] += 1
        for rec in agg.to_dict("records"):
            y, b = int(rec["year"]), int(rec[grain])
            if _bin_last_day(y, grain, b) > last_day:
                continue
            if bool(rec["missing"]):
                value = lo = hi = source = None
                kind = "missing"
            else:
                value, lo, hi = _num(rec["value"]), _num(rec["lo"]), _num(rec["hi"])
                kind, source = majority_kind(kinds[(y, b)]), _str(rec.get("source"))
            rows.append({"year": y, grain: b, "series": web, "value": value, "lo": lo, "hi": hi,
                         "kind": kind, "source": source})
    rows.sort(key=lambda r: (list(SERIES_MAP).index(r["series"]), r["year"], r[grain]))
    return rows


def calendar_json(daily: pd.DataFrame, region: str, grain: str, header: dict[str, Any],
                  method: str = "tier1") -> dict[str, Any]:
    per = "per week" if grain == "week" else "per month"
    meta = {s: {"label": LABELS[s], "unit": UNIT_DAY[s].replace("per day", per)} for s in SERIES_MAP}
    meta["viirs_equiv"]["method"] = method
    last_day = pd.to_datetime(daily["local_day"]).dt.date.max()
    return {**header, "region": region, "series_meta": meta,
            "rows": calendar_rows(daily, grain, last_day, series_map_for(method))}


def kind_runs(days: list[date], kinds: list[str], sources: list[str | None], series: str) -> list[dict[str, Any]]:
    """Compress consecutive days with equal (kind, source) into runs."""
    runs = []
    start = 0
    for i in range(1, len(days) + 1):
        if i == len(days) or (kinds[i], sources[i]) != (kinds[start], sources[start]):
            runs.append({"series": series, "from": days[start].isoformat(), "to": days[i - 1].isoformat(),
                         "kind": kinds[start], "source": sources[start]})
            start = i
    return runs


def daily_json(daily: pd.DataFrame, region: str, header: dict[str, Any], method: str = "tier1") -> dict[str, Any]:
    """Columnar daily file (6.4). Days absent from the table are missing (null, kind missing)."""
    all_days = pd.to_datetime(daily["local_day"]).dt.date
    start, end = all_days.min(), all_days.max()
    days = [start + timedelta(i) for i in range((end - start).days + 1)]
    series: dict[str, Any] = {}
    runs: list[dict[str, Any]] = []
    for web in SERIES_MAP:
        f = series_frame(daily, web, series_map_for(method)).set_index("local_day").reindex(days)
        missing = f["value"].isna()
        kinds = ["missing" if m else str(k) for m, k in zip(missing, f["kind"])]
        sources = [None if m else _str(s) for m, s in zip(missing, f["source"])]
        entry: dict[str, Any] = {"unit": UNIT_DAY[web], "value": [_num(v) for v in f["value"]]}
        if web in BANDED:
            entry["lo"] = [_num(v) for v in f["lo"]]
            entry["hi"] = [_num(v) for v in f["hi"]]
        series[web] = entry
        runs += kind_runs(days, kinds, sources, web)
    return {**header, "region": region, "start": start.isoformat(), "n_days": len(days),
            "series": series, "kind_runs": runs}


def smooth_circular(values: list[float], width: int) -> list[float]:
    """Centred moving average that wraps around the year (week 52 uses week 1)."""
    half = width // 2
    n = len(values)
    return [sum(values[(i + j) % n] for j in range(-half, half + 1)) / (2 * half + 1) for i in range(n)]


def climatology_json(weekly_rows: list[dict[str, Any]], monthly_rows: list[dict[str, Any]], region: str,
                     science: dict[str, Any], header: dict[str, Any]) -> dict[str, Any]:
    """SD-10 from the harmonized weekly and monthly rows."""
    y0, y1 = science["climatology"]["baseline_years"]

    def table(rows: list[dict[str, Any]], grain: str, n_bins: int, smooth: int | None) -> list[dict[str, Any]]:
        per_bin: dict[int, list[float]] = {b: [] for b in range(1, n_bins + 1)}
        for r in rows:
            if r["series"] == "harmonized" and y0 <= r["year"] <= y1 and r["value"] is not None:
                per_bin[r[grain]].append(r["value"])
        empty = [b for b, v in per_bin.items() if not v]
        if empty:
            raise ValueError(f"climatology: no baseline years with data for {grain}s {empty}")
        curves = {name: [float(np.quantile(per_bin[b], q, method="linear")) for b in range(1, n_bins + 1)]
                  for name, q in QUANTILES}
        if smooth:
            curves = {name: smooth_circular(c, smooth) for name, c in curves.items()}
        return [{grain: b, **{name: curves[name][b - 1] for name, _ in QUANTILES}, "n_years": len(per_bin[b])}
                for b in range(1, n_bins + 1)]

    return {**header, "region": region, "baseline_years": [y0, y1],
            "unit_week": "Aqua-equivalent fire cell-days per week",
            "unit_month": "Aqua-equivalent fire cell-days per month",
            "weeks": table(weekly_rows, "week", 52, science["climatology"]["smooth_weeks"]),
            "months": table(monthly_rows, "month", 12, None)}


def build_calendar_files(daily: pd.DataFrame, region: str, science: dict[str, Any], header: dict[str, Any],
                         curve: dict[str, Any] | None = None,
                         daily_t2: pd.DataFrame | None = None) -> dict[str, dict[str, Any]]:
    """All four documents, keyed by file stem.

    SD-17: the viirs_equiv lens uses daily_t2's viirs_equiv_t2 only when curve.json is validated.
    Only that one series is taken from Tier 2; the climatology is built from Tier 1 harmonized.
    """
    method = viirs_equiv_method(curve)
    table = daily
    if method == "tier2":
        t2 = None if daily_t2 is None else daily_t2[daily_t2["series"] == EQUIV_SOURCE["tier2"]]
        if t2 is None or t2.empty:
            raise ValueError("eyesight curve is validated but daily_t2.parquet has no viirs_equiv_t2 series")
        days = pd.to_datetime(daily["local_day"])
        t2_days = pd.to_datetime(t2["local_day"])
        table = pd.concat([daily, t2[(t2_days >= days.min()) & (t2_days <= days.max())]], ignore_index=True)
    weekly = calendar_json(table, region, "week", header, method)
    monthly = calendar_json(table, region, "month", header, method)
    return {
        "weekly": weekly,
        "monthly": monthly,
        "daily": daily_json(table, region, header, method),
        "climatology": climatology_json(weekly["rows"], monthly["rows"], region, science, header),
    }
