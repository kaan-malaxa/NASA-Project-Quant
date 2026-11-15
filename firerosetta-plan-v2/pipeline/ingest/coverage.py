"""SD-08 coverage from this region's unfiltered UTC-date row counts."""
from datetime import date

import pandas as pd

from pipeline.ingest.clean import SENSORS, typed


def build_coverage(raw_counts, last_day, science, outages):
    start = date.fromisoformat(science["eras"]["record_start"])
    if last_day < start:
        return typed(pd.DataFrame(), "coverage")
    counts = raw_counts.copy()
    counts["utc_date"] = pd.to_datetime(counts.utc_date).dt.date
    if (counts.n_raw_rows < 0).any():
        raise ValueError("Raw row counts must not be negative")
    rows = []
    for sensor in SENSORS:
        observed = counts.loc[(counts.sensor == sensor) & (counts.n_raw_rows > 0)]
        dates = set(observed.utc_date)
        first = min(dates) if dates else None
        last = max(dates) if dates else None
        if sensor == "snpp":
            first = date.fromisoformat(science["eras"]["snpp_first_day"])
        sensor_outages = [
            (date.fromisoformat(item["start"]), date.fromisoformat(item["end"]) if item["end"] else None)
            for item in outages if item["sensor"] == sensor
        ]
        for timestamp in pd.date_range(start, last_day):
            day = timestamp.date()
            if first is None or day < first:
                reason = "before_start"
            elif last is not None and day > last:
                reason = "after_end"
            elif any(begin <= day and (end is None or day <= end) for begin, end in sensor_outages):
                reason = "outage_list"
            elif day not in dates:
                reason = "no_raw_rows"
            else:
                reason = "ok"
            rows.append({"sensor": sensor, "local_day": day, "covered": reason == "ok", "reason": reason})
    return typed(pd.DataFrame(rows), "coverage")
