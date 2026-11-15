"""nowcast.json (contracts 6.9; science SD-11, SD-12): this week and this month.

Inputs: celldays_nrt.parquet (5.7, NOAA-20 near-real-time), calibration.json (5.10, monthly k_noaa20),
daily.parquet (5.8, harmonized history), coverage.parquet (5.3), the region centroid and bbox.

Time rules (all derived, no wall clock, so the output is reproducible):
- "now" is the NRT file's fetched_at (UTC); it is also as_of.
- yesterday = local solar date at the centroid at fetched_at, minus one day (SD-03 solar time).
- a local day is fully present when it has ended at the region's westernmost longitude by fetched_at.
- window.end = min(yesterday, last fully present day); window = the 7 days ending there.
Window sums and the history use pipeline.common.timebins.doy_window (coverage-scaled).
"""

from __future__ import annotations

import calendar
import math
from collections import Counter
from datetime import date, datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd

from pipeline.common import timebins
from pipeline.common.sentences import nowcast_sentence
from pipeline.stats.calendar import majority_kind, series_frame

WINDOW_DAYS = 7          # SD-12: "the last 7 complete local days"
SOURCE = "VIIRS_NOAA20_NRT"
UNIT = "Aqua-equivalent fire cell-days per 7 days"
INPUT_NOTE = "Near-real-time input; calibration fitted on science-quality data."


def percentile_rank(x: float, past: list[float]) -> float:
    """SD-11: 100 * (count(past < x) + 0.5 * count(past == x)) / N."""
    below = sum(p < x for p in past)
    ties = sum(p == x for p in past)
    return 100.0 * (below + 0.5 * ties) / len(past)


def status_of(value: float | None, percentile: float | None, past: list[float], anomaly: dict[str, Any]) -> str:
    """SD-11 status table, first match wins."""
    if value is None or percentile is None:
        return "unavailable"
    threshold = anomaly["low_activity_threshold"]
    if value < threshold and float(np.quantile(past, 0.9)) < threshold:
        return "low_activity"
    if percentile >= anomaly["extreme_pct"]:
        return "extreme"
    if percentile > anomaly["above_pct"]:
        return "above_normal"
    if percentile < anomaly["below_pct"]:
        return "below_normal"
    return "normal"


def window_dates(fetched_at: datetime, centroid_lon: float, west_lon: float) -> tuple[date, date]:
    """(start, end) of the 7-day window per the module rules."""
    end = timebins.last_complete_local_day(fetched_at, centroid_lon, west_lon)
    return end - timedelta(WINDOW_DAYS - 1), end


def _doy(d: date) -> int:
    return d.timetuple().tm_yday


def nrt_daily(nrt: pd.DataFrame, coverage: pd.DataFrame | None, calibration: dict[str, Any],
              start: date, end: date, first_present: date, metadata=None) -> pd.DataFrame:
    """Translated NRT value per local day in [start, end]: cell-days x k_noaa20 of the month.

    A day is covered when it is inside the fetched span and coverage.parquet does not mark NOAA-20
    uncovered that day. Uncovered days have null value/lo/hi.
    """
    k = {row["month"]: row for row in calibration["k"]["noaa20"]}
    day_pass = nrt[(nrt["sensor"] == "noaa20") & (nrt["daynight"] == "D")]
    counts = Counter(pd.to_datetime(day_pass["local_day"]).dt.date)
    uncovered: set[date] = set()
    if coverage is not None and len(coverage):
        cov = coverage[coverage["sensor"] == "noaa20"]
        uncovered = {d for d, c in zip(pd.to_datetime(cov["local_day"]).dt.date, cov["covered"]) if not c}
    rows = []
    known = {date.fromisoformat(row["local_day"]): row["covered"] for row in metadata["days"]} if metadata else None
    for i in range((end - start).days + 1):
        d = start + timedelta(i)
        covered = known.get(d, False) if known is not None else d >= first_present and d not in uncovered
        if not covered or d.month not in k or k[d.month]["k"] is None:
            rows.append((d, None, None, None))
        else:
            n, km = counts.get(d, 0), k[d.month]
            rows.append((d, n * km["k"], n * km["lo"], n * km["hi"]))
    return pd.DataFrame(rows, columns=["local_day", "value", "lo", "hi"])


def _history(harm: pd.DataFrame, end: date, n_days: int, years: range, min_covered: float,
             month_fraction=None) -> list[dict[str, Any]]:
    """Coverage-scaled harmonized sum of the same day-of-year window in each year; poorly covered years skipped."""
    kinds = dict(zip(harm["local_day"], harm["kind"]))
    out = []
    for y in years:
        if month_fraction is None:
            last = date(y, 1, 1) + timedelta(min(_doy(end), 366 if calendar.isleap(y) else 365) - 1)
            length, minimum = n_days, min_covered
        else:
            last = date(y, end.month, min(end.day, calendar.monthrange(y, end.month)[1]))
            length, minimum = last.day, math.ceil(month_fraction * last.day)
        res = timebins.doy_window(harm, _doy(last), length, y, value_cols=("value",))
        if res["n_covered"] < minimum or res["value"] is None:
            continue
        window_kinds = Counter(kinds[d] for d in (last - timedelta(i) for i in range(length))
                               if d in kinds and kinds[d] != "missing")
        out.append({"year": y, "value": float(res["value"]),
                    "kind": majority_kind(window_kinds) if window_kinds else "harmonized"})
    return out


def build_nowcast(nrt: pd.DataFrame, calibration: dict[str, Any], daily: pd.DataFrame,
                  coverage: pd.DataFrame | None, region: str, region_name: str, centroid_lon: float,
                  west_lon: float, science: dict[str, Any], header: dict[str, Any], metadata=None) -> dict[str, Any]:
    y0, y1 = science["climatology"]["baseline_years"]
    baseline = range(y0, y1 + 1)
    tb, anomaly = science["timebins"], science["anomaly"]
    harm = series_frame(daily, "harmonized")

    if len(nrt) == 0 and metadata is None:
        last = harm["local_day"].max()          # no NRT clock: describe the month of the last harmonized day
        return {**header, "region": region, "as_of": None, "source": SOURCE,
                "window": {"start": None, "end": None, "days_covered": 0},
                "value": None, "lo": None, "hi": None, "unit": UNIT, "percentile": None, "status": "unavailable",
                "baseline_years": [y0, y1], "history": [],
                "month_to_date": {"month": last.month, "through_day": last.day, "value": None, "median": None,
                                  "ratio": None, "percentile": None},
                "kind": "missing", "input_note": INPUT_NOTE,
                "sentence": nowcast_sentence("unavailable", region_name, None, None, None, 0)}

    fetched = (pd.Timestamp(metadata["fetched_at"]) if metadata else
               pd.to_datetime(nrt["fetched_at"]).max()).to_pydatetime().replace(tzinfo=None)
    start, end = window_dates(fetched, centroid_lon, west_lon)
    first_present = date.fromisoformat(metadata["start"]) if metadata else pd.to_datetime(nrt["local_day"]).dt.date.min()

    # this week
    week = nrt_daily(nrt, coverage, calibration, start, end, first_present, metadata)
    days_covered = int(week["value"].notna().sum())
    cur = timebins.doy_window(week, _doy(end), WINDOW_DAYS, end.year, value_cols=("value", "lo", "hi"))
    enough = days_covered >= tb["week_min_covered_days"]
    value, lo, hi = (cur["value"], cur["lo"], cur["hi"]) if enough else (None, None, None)
    history = _history(harm, end, WINDOW_DAYS, baseline, tb["week_min_covered_days"])
    past = [h["value"] for h in history]
    percentile = percentile_rank(value, past) if value is not None and past else None
    status = status_of(value, percentile, past, anomaly)

    # this month: harmonized days where they exist, NRT x k after the last harmonized day
    month_start = end.replace(day=1)
    harm_month = harm[(harm["local_day"] >= month_start) & (harm["local_day"] <= end)][["local_day", "value"]]
    last_harm = harm["local_day"].max()
    nrt_month = nrt_daily(nrt, coverage, calibration, month_start, end, first_present, metadata)
    current = pd.concat([harm_month, nrt_month[nrt_month["local_day"] > last_harm][["local_day", "value"]]],
                        ignore_index=True)
    n = end.day
    need = math.ceil(tb["month_min_covered_frac"] * n)
    mres = timebins.doy_window(current, _doy(end), n, end.year, value_cols=("value",))
    mtd = mres["value"] if mres["n_covered"] >= need else None
    spans = [h["value"] for h in _history(harm, end, n, baseline, need, tb["month_min_covered_frac"])]
    median = float(np.median(spans)) if spans else None
    month_to_date = {"month": end.month, "through_day": n, "value": mtd, "median": median,
                     "ratio": mtd / median if mtd is not None and median else None,
                     "percentile": percentile_rank(mtd, spans) if mtd is not None and spans else None}

    return {**header, "region": region, "as_of": fetched.strftime("%Y-%m-%dT%H:%M:%SZ"), "source": SOURCE,
            "window": {"start": start.isoformat(), "end": end.isoformat(), "days_covered": days_covered},
            "value": value, "lo": lo, "hi": hi, "unit": UNIT, "percentile": percentile, "status": status,
            "baseline_years": [y0, y1], "history": history, "month_to_date": month_to_date,
            "kind": "missing" if value is None else "harmonized", "input_note": INPUT_NOTE,
            "sentence": nowcast_sentence(status, region_name, end, value, percentile, len(history))}
