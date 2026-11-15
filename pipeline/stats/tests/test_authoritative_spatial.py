from datetime import date, timedelta

import pandas as pd
import pytest

from pipeline.stats.calendar import build_calendar_files
from pipeline.stats.spatial import yearly_contributions
from pipeline.stats.tests.fabricate import HEADER, SCIENCE, daily_table


def test_outage_substitution_partial_coverage_and_bounds_sum_to_regional_month():
    daily = daily_table(date(2022, 1, 1), date(2022, 1, 31), 2.,
                        uncovered=[date(2022, 1, d) for d in (29, 30, 31)])
    fallback = daily.local_day.eq(date(2022, 1, 5)) & daily.series.eq("harmonized")
    daily.loc[fallback, ["value", "lo", "hi", "source", "kind"]] = [3., 2., 4., "snpp", "harmonized"]
    raw = []
    for day in range(28):
        for sensor in ("aqua", "snpp"):
            for cell in ("a", "b"):
                raw.append((date(2022, 1, 1) + timedelta(day), sensor, cell + "6", cell, "D"))
    cells = pd.DataFrame(raw, columns=["local_day", "sensor", "h3_r6", "h3_r5", "daynight"])
    calendars = build_calendar_files(daily, "test", SCIENCE, HEADER)
    shard = yearly_contributions(cells, daily, "test", SCIENCE, HEADER, calendars)[2022]
    which = shard["series"].index("harmonized")
    rows = [row for row in shard["monthly"] if row[2] == which]
    assert sum(row[3] for row in rows) == pytest.approx(57 * 31 / 28)
    for i, field in enumerate(("value", "lo", "hi"), 3):
        expected = next(row[field] for row in calendars["monthly"]["rows"] if row["series"] == "harmonized")
        assert sum(row[i] for row in rows) == pytest.approx(expected)
