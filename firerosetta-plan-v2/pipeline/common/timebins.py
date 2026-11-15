"""The sole SD-03/SD-08 implementation: UTC, local solar dates, coverage scaling."""

import calendar
from datetime import date, timedelta

import numpy as np
import pandas as pd

from pipeline.common.config import load_science


def local_day(acq_datetime_utc, longitude):
    divisor = load_science()["timebins"]["solar_degrees_per_hour"]
    if isinstance(acq_datetime_utc, (pd.Series, pd.DatetimeIndex)):
        shifted = pd.to_datetime(acq_datetime_utc, utc=True) + pd.to_timedelta(longitude / divisor, unit="h")
        return shifted.dt.date if isinstance(shifted, pd.Series) else shifted.date
    return (acq_datetime_utc + timedelta(hours=float(longitude) / divisor)).date()


def week_of_year(d: date) -> int:
    settings = load_science()["timebins"]
    return min(settings["weeks_per_year"], (d.timetuple().tm_yday - 1) // settings["week_days"] + 1)


def days_in_week(year: int, week: int) -> int:
    settings = load_science()["timebins"]
    if not 1 <= week <= settings["weeks_per_year"]:
        raise ValueError("Week is outside the configured annual calendar")
    return (
        (366 if calendar.isleap(year) else 365) - settings["week_days"] * (week - 1)
        if week == settings["weeks_per_year"]
        else settings["week_days"]
    )


def aggregate(daily, grain, value_cols=("value", "lo", "hi")):
    if grain not in ("week", "month", "year"):
        raise ValueError(f"Unknown grain: {grain}")
    value_cols = list(value_cols)
    if not value_cols:
        raise ValueError("At least one value column is required")
    frame = daily.copy()
    dates = pd.to_datetime(frame["local_day"], errors="raise")
    if dates.isna().any() or dates.duplicated().any():
        raise ValueError("Aggregate requires one valid row per local_day")
    for column in value_cols:
        values = pd.to_numeric(frame[column], errors="raise")
        if np.isinf(values.to_numpy(dtype=float, na_value=np.nan)).any():
            raise ValueError("Infinite daily values are not allowed")
        frame[column] = pd.array(values, dtype="Float64")
        if not frame[column].notna().equals(frame[value_cols[0]].notna()):
            raise ValueError("All value columns must have the same covered-day mask")
    frame["year"] = dates.dt.year.to_numpy()
    keys = ["year"]
    settings = load_science()["timebins"]
    if grain == "week":
        frame["week"] = np.minimum(
            settings["weeks_per_year"], (dates.dt.day_of_year - 1) // settings["week_days"] + 1
        ).to_numpy()
        keys.append("week")
    elif grain == "month":
        frame["month"] = dates.dt.month.to_numpy()
        keys.append("month")
    rows = []
    for key, group in frame.groupby(keys, sort=True):
        values = key if isinstance(key, tuple) else (key,)
        row = dict(zip(keys, values, strict=True))
        year = int(row["year"])
        n_days = (
            days_in_week(year, int(row["week"]))
            if grain == "week"
            else calendar.monthrange(year, int(row["month"]))[1]
            if grain == "month"
            else 366
            if calendar.isleap(year)
            else 365
        )
        covered = group[value_cols[0]].notna()
        n_covered = int(covered.sum())
        valid = (
            n_covered >= settings["week_min_covered_days"]
            if grain == "week"
            else n_covered >= n_days * settings[f"{grain}_min_covered_frac"]
        )
        normalizer = settings["week_days"] if grain == "week" else n_days
        for column in value_cols:
            row[column] = (
                float(group.loc[covered, column].sum()) * normalizer / n_covered
                if valid and n_covered
                else None
            )
        row.update(n_days=n_days, n_covered=n_covered, missing=not valid)
        for column in ("kind", "source"):
            modes = group.loc[covered, column].mode() if column in group else pd.Series(dtype=str)
            row[column] = str(modes.iloc[0]) if valid and len(modes) else "missing"
        rows.append(row)
    result = pd.DataFrame(
        rows, columns=keys + value_cols + ["n_days", "n_covered", "missing", "kind", "source"]
    )
    for column in value_cols:
        result[column] = pd.array(result[column], dtype="Float64")
    return result


def doy_window(daily, end_doy, n_days, year, value_cols=("value",)):
    end = pd.Timestamp(year=year, month=1, day=1) + pd.Timedelta(days=end_doy - 1)
    days = pd.date_range(end=end, periods=n_days)
    frame = daily.copy()
    frame["local_day"] = pd.to_datetime(frame["local_day"])
    frame = frame.set_index("local_day").reindex(days)
    covered = frame[value_cols[0]].notna()
    count = int(covered.sum())
    settings = load_science()["timebins"]
    valid = count * settings["week_days"] >= n_days * settings["week_min_covered_days"]
    return {
        **{
            column: float(frame.loc[covered, column].sum()) * n_days / count if valid and count else None
            for column in value_cols
        },
        "n_days": n_days,
        "n_covered": count,
        "missing": not valid,
    }
