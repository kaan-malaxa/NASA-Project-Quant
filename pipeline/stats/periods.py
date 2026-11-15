"""Precomputed science for contiguous complete calendar-year intervals; no calibration refitting."""
from copy import deepcopy
from datetime import date

import pandas as pd

from pipeline.common import io
from pipeline.stats.calendar import climatology_json
from pipeline.stats.season import build_season
from pipeline.stats.trend import build_trend_files


def complete_years(daily):
    days = pd.to_datetime(daily.local_day)
    first, last = days.min().date(), days.max().date()
    return list(range(first.year + (first != date(first.year, 1, 1)),
                      last.year + (last == date(last.year, 12, 31))))


def period_document(daily, annual_bootstrap, naive, calendars, region, name, science, header, years):
    selected = deepcopy(science)
    selected["climatology"]["baseline_years"] = list(years)
    climatology = climatology_json(calendars["weekly"]["rows"], calendars["monthly"]["rows"], region,
                                  selected, header)
    if "configuration" in calendars["climatology"]:
        climatology["configuration"] = deepcopy(calendars["climatology"]["configuration"])
    days = pd.to_datetime(daily.local_day).dt.year
    subset = daily.loc[days.between(*years)]
    season = build_season(climatology, subset, region, selected, header)
    trends = build_trend_files(daily, annual_bootstrap, naive, region, name, science, header,
                               analysis_years=years)
    return {**header, "schema_version": "2.0", "region": region, "analysis_years": list(years),
            "anomaly_baseline_years": science["climatology"]["baseline_years"],
            "climatology": climatology, "season": season, **trends}


def write_periods(out, daily, annual_bootstrap, naive, calendars, region, name, science, header):
    years = complete_years(daily)
    entries = []
    for first in years:
        for last in years:
            if last < first:
                continue
            doc = period_document(daily, annual_bootstrap, naive, calendars, region, name, science, header,
                                  (first, last))
            relative = f"periods/{first}-{last}.json"
            file = out / relative
            io.write_json(doc, file, compact=True)
            entries.append({"years": [first, last], "path": relative,
                            "sha256": io.sha256(file), "bytes": file.stat().st_size})
    return {**header, "schema_version": "2.0", "region": region, "available_years": years,
            "default_years": [years[0], years[-1]] if years else None,
            "anomaly_baseline_years": science["climatology"]["baseline_years"], "periods": entries}
