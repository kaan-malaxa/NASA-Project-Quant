"""TEST-ONLY stand-in for pipeline/common/timebins.py (owner R2), used until R2's module exists.

Implements the contracts section 10 signatures with the SD-08 rules so pipeline/stats can be tested
today. conftest.py installs it only when `pipeline.common.timebins` cannot be imported; once R2's
module lands, every test runs against the real one and this file should be deleted.
Never import this from pipeline code.
"""

from __future__ import annotations

import calendar
from collections import Counter
from collections.abc import Sequence
from datetime import date

import pandas as pd

# SD-08 thresholds (science.yaml `timebins`, contracts 4.2). conftest.py may overwrite them.
THRESHOLDS = {"week_min_covered_days": 5, "month_min_covered_frac": 0.8, "year_min_covered_frac": 0.9}


def week_of_year(d: date) -> int:
    return min(52, (d.timetuple().tm_yday - 1) // 7 + 1)


def days_in_week(year: int, week: int) -> int:
    if week < 52:
        return 7
    return (366 if calendar.isleap(year) else 365) - 51 * 7


def _majority(values: Sequence[object]) -> object:
    counts = Counter(v for v in values if v is not None and not pd.isna(v))
    if not counts:
        return None
    return min(counts, key=lambda k: (-counts[k], str(k)))


def aggregate(daily: pd.DataFrame, grain: str, value_cols: Sequence[str] = ("value", "lo", "hi")) -> pd.DataFrame:
    days = pd.to_datetime(daily["local_day"]).dt.date
    frame = daily.assign(_day=days, year=[d.year for d in days])
    keys = ["year"]
    if grain == "week":
        frame["week"] = [week_of_year(d) for d in days]
        keys.append("week")
    elif grain == "month":
        frame["month"] = [d.month for d in days]
        keys.append("month")
    out = []
    for key, g in frame.groupby(keys, sort=True):
        key = key if isinstance(key, tuple) else (key,)
        year = int(key[0])
        if grain == "week":
            n_days = days_in_week(year, int(key[1]))
        elif grain == "month":
            n_days = calendar.monthrange(year, int(key[1]))[1]
        else:
            n_days = 366 if calendar.isleap(year) else 365
        covered = g[g[value_cols[0]].notna()]
        n_cov = len(covered)
        if grain == "week":
            missing, scale = n_cov < THRESHOLDS["week_min_covered_days"], 7.0
        elif grain == "month":
            missing, scale = n_cov < THRESHOLDS["month_min_covered_frac"] * n_days, float(n_days)
        else:
            missing, scale = n_cov < THRESHOLDS["year_min_covered_frac"] * n_days, float(n_days)
        rec: dict[str, object] = dict(zip(keys, (int(k) for k in key)))
        for col in value_cols:
            rec[col] = None if missing else float(covered[col].sum()) * scale / n_cov
        rec.update(n_days=n_days, n_covered=n_cov, missing=missing,
                   kind=_majority(list(covered["kind"])) if "kind" in g else None,
                   source=_majority(list(covered["source"])) if "source" in g else None)
        out.append(rec)
    return pd.DataFrame(out)


def doy_window(daily: pd.DataFrame, end_doy: int, n_days: int, year: int,
               value_cols: Sequence[str] = ("value",)) -> dict:
    """Coverage-scaled sum of the n_days ending at day-of-year end_doy of `year` (may cross into year-1).

    Returns the value columns (None when no day is covered), plus n_days and n_covered. Thresholds
    are left to the caller.
    """
    from datetime import timedelta

    end = date(year, 1, 1) + timedelta(end_doy - 1)
    wanted = {end - timedelta(k) for k in range(n_days)}
    days = pd.to_datetime(daily["local_day"]).dt.date
    sub = daily[days.isin(wanted).to_numpy()]
    covered = sub[sub[value_cols[0]].notna()]
    n_cov = len(covered)
    out: dict = {c: (float(covered[c].sum()) * n_days / n_cov if n_cov else None) for c in value_cols}
    out.update(n_days=n_days, n_covered=n_cov)
    return out
