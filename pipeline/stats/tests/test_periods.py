from copy import deepcopy
from datetime import date

import pandas as pd

from pipeline.stats.calendar import build_calendar_files
from pipeline.stats.periods import complete_years, period_document
from pipeline.stats.season import build_season
from pipeline.stats.tests.fabricate import HEADER, SCIENCE, daily_table
from pipeline.stats.trend import build_trend_files


def test_complete_calendar_years_exclude_partial_boundaries():
    daily = pd.DataFrame({"local_day": pd.date_range("2019-02-01", "2022-04-01")})
    assert complete_years(daily) == [2020, 2021]


def test_short_period_has_null_trends_and_qualified_verdict():
    daily = daily_table(date(2019, 1, 1), date(2020, 12, 31), 2.0)
    calendars = build_calendar_files(daily, "test", SCIENCE, HEADER)
    naive = pd.DataFrame({"year": [2019, 2020], "modis_count": [100., 100.], "snpp_count": [200., 200.],
                          "modis_covered_frac": [1., 1.], "snpp_covered_frac": [1., 1.]})
    boot = pd.DataFrame(columns=["replicate", "year", "harmonized"])
    doc = period_document(daily, boot, naive, calendars, "test", "Test", SCIENCE, HEADER, (2019, 2020))
    assert doc["trend"]["harmonized"]["pct_per_decade"] is None
    assert "unavailable" in doc["trend"]["sentence"].lower()
    assert doc["climatology"]["baseline_years"] == [2019, 2020]
    assert doc["anomaly_baseline_years"] == SCIENCE["climatology"]["baseline_years"]


def test_full_period_reproduces_the_canonical_science_documents():
    science = deepcopy(SCIENCE)
    science["climatology"]["baseline_years"] = [2019, 2021]
    science["trend"]["years"] = [2019, 2021]
    daily = daily_table(date(2019, 1, 1), date(2021, 12, 31), lambda day: float(day.year - 2017))
    calendars = build_calendar_files(daily, "test", science, HEADER)
    naive = pd.DataFrame({"year": [2019, 2020, 2021], "modis_count": [100., 110., 120.],
                          "snpp_count": [200., 220., 240.], "modis_covered_frac": [1.] * 3,
                          "snpp_covered_frac": [1.] * 3})
    boot = pd.DataFrame(columns=["replicate", "year", "harmonized"])
    canonical = build_trend_files(daily, boot, naive, "test", "Test", science, HEADER)
    canonical["season"] = build_season(calendars["climatology"], daily, "test", science, HEADER)
    doc = period_document(daily, boot, naive, calendars, "test", "Test", science, HEADER, (2019, 2021))
    for key in ("trend", "ruler", "season"):
        assert doc[key] == canonical[key]
    assert doc["climatology"] == calendars["climatology"]
