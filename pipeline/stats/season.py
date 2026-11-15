"""season.json (contracts 6.6; science SD-13): critical weeks, windows, per-year timing and shift.

Step 1 works on the climatology's smoothed weekly p50 (52 values). Step 2 works on the harmonized
daily series inside each window extended by `season.extend_weeks` on both sides. Windows that wrap
the year end (start_week > end_week) are handled by measuring days continuously from 1 January of
the year in which the season starts; reported day-of-year values are folded back into 1..366.
"""

from __future__ import annotations

from collections import Counter
from datetime import date, timedelta
from typing import Any

import numpy as np
import pandas as pd
from pipeline.common import timebins
from scipy.stats import theilslopes

from pipeline.stats.calendar import majority_kind, series_frame
from pipeline.stats.sentences import season_shift_sentence

MONTHS = ("January", "February", "March", "April", "May", "June", "July", "August", "September",
          "October", "November", "December")
LABEL_YEAR = 2001          # any non-leap year: labels describe a typical calendar
SEED_OFFSET = 100          # keeps season replicates independent of the trend's (trend.py uses 0..3)


# ------------------------------------------------------------------ step 1: critical weeks and windows
def critical_weeks(p50: list[float], share: float) -> list[int]:
    """Smallest set of weeks (1-52) whose p50 sum reaches `share` of the total; largest weeks first."""
    total = sum(p50)
    if total <= 0:
        raise ValueError("season: the smoothed weekly p50 is zero everywhere; no season to describe")
    order = sorted(range(52), key=lambda i: (-p50[i], i))
    chosen, acc = [], 0.0
    for i in order:
        chosen.append(i + 1)
        acc += p50[i]
        if acc >= share * total:
            break
    return sorted(chosen)


def window_runs(critical: list[int]) -> list[list[int]]:
    """Circular runs of critical weeks, a single-week gap merged into the run around it."""
    crit = set(critical)
    inside = [w in crit or ((w - 2) % 52 + 1 in crit and w % 52 + 1 in crit) for w in range(1, 53)]
    if all(inside):
        return [list(range(1, 53))]
    first_out = inside.index(False)                       # start scanning just after a gap
    runs, cur = [], []
    for k in range(1, 53):
        i = (first_out + k) % 52
        if inside[i]:
            cur.append(i + 1)
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    return runs


def week_label(start_week: int, end_week: int) -> str:
    """Plain words from the window's first and last day, e.g. 'mid-October to mid-November'."""
    def part(d: date) -> tuple[str, str]:
        return ("early" if d.day <= 10 else "mid" if d.day <= 20 else "late"), MONTHS[d.month - 1]

    jan1 = date(LABEL_YEAR, 1, 1)
    first = jan1 + timedelta((start_week - 1) * 7)
    last = jan1 + timedelta((end_week - 1) * 7 + timebins.days_in_week(LABEL_YEAR, end_week) - 1)
    (p1, m1), (p2, m2) = part(first), part(last)
    if m1 == m2:
        return f"{p1} {m1}" if p1 == p2 else f"{p1} to {p2} {m1}"
    return f"{p1}-{m1} to {p2}-{m2}"


def windows(p50: list[float], science: dict[str, Any]) -> tuple[list[int], list[dict[str, Any]]]:
    s = science["season"]
    crit = critical_weeks(p50, s["critical_share"])
    total = sum(p50)
    found = []
    for run in window_runs(crit):
        share = sum(p50[w - 1] for w in run) / total
        if share >= s["min_window_share"]:
            peak = max(run, key=lambda w: (p50[w - 1], -run.index(w)))
            found.append({"weeks": run, "start_week": run[0], "end_week": run[-1], "peak_week": peak,
                          "share": share, "label": week_label(run[0], run[-1])})
    found.sort(key=lambda w: (-w["share"], w["start_week"]))
    return crit, found[: s["max_windows"]]


# ------------------------------------------------------------------ step 2: per-year timing and shift
def _span(year: int, start_week: int, end_week: int, extend: int) -> tuple[date, date]:
    """First and last day of the window in `year`, extended by `extend` weeks each side."""
    start = date(year, 1, 1) + timedelta((start_week - 1) * 7)
    end_year = year + (end_week < start_week)
    end = date(end_year, 1, 1) + timedelta((end_week - 1) * 7 + timebins.days_in_week(end_year, end_week) - 1)
    return start - timedelta(7 * extend), end + timedelta(7 * extend)


def _fold_doy(offset: int, year: int) -> int:
    """Day offset counted from 1 January of `year` (1-based, may be <1 or >366) -> real day of year."""
    return (date(year, 1, 1) + timedelta(offset - 1)).timetuple().tm_yday


def by_year(harm: pd.DataFrame, win: dict[str, Any], science: dict[str, Any]) -> list[dict[str, Any]]:
    """10% / centroid / 90% days of each baseline year's season (SD-13). Offsets kept in '_offsets'."""
    s = science["season"]
    y0, y1 = science["climatology"]["baseline_years"]
    min_frac = science["timebins"]["year_min_covered_frac"]
    first_day, last_day = harm["local_day"].min(), harm["local_day"].max()
    values = dict(zip(harm["local_day"], harm["value"]))
    kinds = dict(zip(harm["local_day"], harm["kind"]))
    out = []
    for year in range(y0, y1 + 1):
        a, b = _span(year, win["start_week"], win["end_week"], s["extend_weeks"])
        if a < first_day or b > last_day:
            continue                                      # window not fully inside the record
        days = [a + timedelta(i) for i in range((b - a).days + 1)]
        pts = [(d, values[d]) for d in days if d in values and not pd.isna(values[d])]
        if len(pts) < min_frac * len(days):
            continue                                      # too many uncovered days to time the season
        total = float(sum(v for _, v in pts))
        if total < s["min_year_celldays"]:
            continue
        jan1 = date(year, 1, 1)
        cum, start_off, end_off = 0.0, None, None
        for d, v in pts:
            cum += float(v)
            off = (d - jan1).days + 1
            if start_off is None and cum >= 0.1 * total:
                start_off = off
            if end_off is None and cum >= 0.9 * total:
                end_off = off
        centroid_off = sum(((d - jan1).days + 1) * float(v) for d, v in pts) / total
        out.append({"year": year, "start_doy": _fold_doy(start_off, year),
                    "centroid_doy": _fold_doy(round(centroid_off), year), "end_doy": _fold_doy(end_off, year),
                    "total": total, "kind": majority_kind(Counter(kinds[d] for d, _ in pts)),
                    "_offsets": {"start": start_off, "centroid": centroid_off, "end": end_off}})
    return out


def shift(rows: list[dict[str, Any]], key: str, rng: np.random.Generator, n_boot: int) -> dict[str, float | None]:
    """Theil-Sen slope in days per decade with a 5th-95th percentile range over resampled years."""
    years = [r["year"] for r in rows]
    offs = [float(r["_offsets"][key]) for r in rows]
    if len(set(years)) < 3:
        return {"value": None, "lo": None, "hi": None}
    point = 10.0 * float(theilslopes(offs, years).slope)
    boot = []
    for _ in range(n_boot):
        pick = rng.integers(0, len(years), len(years))
        xs = [years[i] for i in pick]
        if len(set(xs)) >= 2:
            boot.append(10.0 * float(theilslopes([offs[i] for i in pick], xs).slope))
    lo, hi = np.percentile(boot, [5, 95])
    return {"value": point, "lo": float(lo), "hi": float(hi)}


# ------------------------------------------------------------------ document
def build_season(climatology: dict[str, Any], daily: pd.DataFrame, region: str, science: dict[str, Any],
                 header: dict[str, Any]) -> dict[str, Any]:
    p50 = [w["p50"] for w in sorted(climatology["weeks"], key=lambda w: w["week"])]
    if len(p50) != 52:
        raise ValueError(f"season: climatology must have 52 weeks, got {len(p50)}")
    crit, wins = windows(p50, science)
    harm = series_frame(daily, "harmonized")
    out = []
    for n, w in enumerate(wins, start=1):
        rows = by_year(harm, w, science)
        rng = np.random.default_rng([science.get("seed", 7), SEED_OFFSET + n])
        shifts = {k: shift(rows, k, rng, science["trend"]["bootstrap_b"]) for k in ("start", "centroid", "end")}
        st = shifts["start"]
        out.append({"id": f"w{n}", "label": w["label"], "start_week": w["start_week"], "peak_week": w["peak_week"],
                    "end_week": w["end_week"], "share": w["share"],
                    "by_year": [{k: v for k, v in r.items() if k != "_offsets"} for r in rows],
                    "shift_days_per_decade": shifts,
                    "sentence": season_shift_sentence(w["label"], st["value"], st["lo"], st["hi"])})
    pct = round(100 * science["season"]["critical_share"])
    return {**header, "region": region,
            "definition": f"The fewest weeks that hold {pct}% of a typical year's burning",
            "critical_weeks": crit, "windows": out}
