"""Local solar dates and coverage-scaled bins (SD-03, SD-08)."""
import calendar
from collections.abc import Sequence
from datetime import date, timedelta
from typing import Literal

import pandas as pd

from pipeline.common.config import load_science


def local_day(acq_datetime_utc, longitude) -> date:
    if isinstance(acq_datetime_utc, pd.Series) or isinstance(longitude, pd.Series):
        timestamps = pd.to_datetime(acq_datetime_utc, utc=True)
        return (timestamps + pd.to_timedelta(longitude / 15, unit="h")).dt.date
    timestamp = pd.to_datetime(acq_datetime_utc, utc=True)
    return (timestamp + pd.to_timedelta(longitude / 15, unit="h")).date()


def week_of_year(d: date) -> int:
    return min(52, (d.timetuple().tm_yday - 1) // 7 + 1)


def days_in_week(year: int, week: int) -> int:
    if not 1 <= week <= 52:
        raise ValueError("week must be in 1..52")
    return (366 if calendar.isleap(year) else 365) - 357 if week == 52 else 7


def _prepare(daily, value_cols):
    columns = [column for column in value_cols if column in daily.columns]
    if not columns:
        raise ValueError("daily must include a requested value column")
    frame = daily.copy()
    frame["local_day"] = pd.to_datetime(frame["local_day"], errors="raise").dt.normalize()
    if frame["local_day"].isna().any() or frame["local_day"].duplicated().any():
        raise ValueError("daily requires one valid row per local_day")
    return frame.sort_values("local_day"), columns


def _majority(frame, column, default):
    if column not in frame:
        return default
    modes = frame[column].dropna().mode()
    return modes.iloc[0] if len(modes) else default


def _summarise(frame, columns, n_days, scale_days, minimum):
    covered = frame[columns[0]].notna()
    if "covered" in frame:
        covered &= frame["covered"].fillna(False)
    if "kind" in frame:
        covered &= frame["kind"].ne("missing")
    selected = frame.loc[covered]
    n_covered = len(selected)
    missing = n_covered < minimum or n_covered == 0
    row = {}
    for column in columns:
        # A missing uncertainty bound is never silently replaced by zero.
        complete = selected[column].notna().all()
        row[column] = (
            float(selected[column].sum() * scale_days / n_covered)
            if not missing and complete else None
        )
    row.update(
        n_days=n_days, n_covered=n_covered, missing=missing,
        kind="missing" if missing else _majority(selected, "kind", None),
        source=None if missing else _majority(selected, "source", None),
    )
    return row


def aggregate(
    daily: pd.DataFrame, grain: Literal["week", "month", "year"],
    value_cols: Sequence[str] = ("value", "lo", "hi"),
) -> pd.DataFrame:
    if grain not in {"week", "month", "year"}:
        raise ValueError(f"Unknown grain: {grain}")
    frame, columns = _prepare(daily, value_cols)
    output_columns = ["year"] + ([] if grain == "year" else [grain])
    output_columns += columns + ["n_days", "n_covered", "missing", "kind", "source"]
    if frame.empty:
        return pd.DataFrame(columns=output_columns)
    thresholds = load_science()["timebins"]
    frame["year"] = frame.local_day.dt.year
    keys = ["year"]
    if grain == "week":
        frame["week"] = frame.local_day.map(week_of_year)
        keys.append("week")
    elif grain == "month":
        frame["month"] = frame.local_day.dt.month
        keys.append("month")
    rows = []
    for key, group in frame.groupby(keys, sort=True):
        key = key if isinstance(key, tuple) else (key,)
        year = int(key[0])
        if grain == "week":
            n_days = days_in_week(year, int(key[1]))
            scale_days = 7
            minimum = thresholds["week_min_covered_days"]
        elif grain == "month":
            n_days = calendar.monthrange(year, int(key[1]))[1]
            scale_days = n_days
            minimum = thresholds["month_min_covered_frac"] * n_days
        else:
            n_days = 366 if calendar.isleap(year) else 365
            scale_days = n_days
            minimum = thresholds["year_min_covered_frac"] * n_days
        rows.append(dict(zip(keys, map(int, key))) | _summarise(group, columns, n_days, scale_days, minimum))
    return pd.DataFrame(rows, columns=output_columns)


def doy_window(
    daily: pd.DataFrame, end_doy: int, n_days: int, year: int,
    value_cols: Sequence[str] = ("value",),
) -> dict:
    if not 1 <= end_doy <= (366 if calendar.isleap(year) else 365):
        raise ValueError("end_doy is outside the requested year")
    if n_days <= 0:
        raise ValueError("n_days must be positive")
    frame, columns = _prepare(daily, value_cols)
    end = pd.Timestamp(date(year, 1, 1) + timedelta(days=end_doy - 1))
    start = end - pd.Timedelta(days=n_days - 1)
    selected = frame.loc[frame.local_day.between(start, end)]
    # SD-08's weekly covered fraction applies to rolling windows, including nowcast.
    minimum = load_science()["timebins"]["week_min_covered_days"] * n_days / 7
    return _summarise(selected, columns, n_days, n_days, minimum)
