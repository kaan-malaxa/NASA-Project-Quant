"""Tests for pipeline/stats/calendar.py (R1 prompt B1) on fabricated daily tables."""

from __future__ import annotations

import calendar as cal
import json
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

from pipeline.stats.calendar import (
    build_calendar_files,
    calendar_rows,
    daily_json,
    majority_kind,
    smooth_circular,
)
from pipeline.stats.tests.fabricate import HEADER, SCIENCE, daily_table

CONTRACTS = Path(__file__).resolve().parents[3] / "contracts"


def week_days(year: int, week: int) -> list[date]:
    start = date(year, 1, 1) + timedelta((week - 1) * 7)
    return [start + timedelta(i) for i in range(7)]


def rows_of(rows, series, grain="week"):
    return {(r["year"], r[grain]): r for r in rows if r["series"] == series}


# ------------------------------------------------------------------ weekly scaling and missing
def test_constant_two_gives_fourteen_every_week_including_week_52_and_leap_years():
    t = daily_table(date(2003, 1, 1), date(2025, 12, 31), 2.0)
    rows = calendar_rows(t, "week", date(2025, 12, 31))
    harm = rows_of(rows, "harmonized")
    assert len(harm) == 23 * 52
    assert all(r["value"] == pytest.approx(14.0) for r in harm.values())
    for leap in (2004, 2008, 2012, 2016, 2020, 2024):
        assert harm[(leap, 52)]["value"] == pytest.approx(14.0)
    for leap in (2004, 2008, 2012, 2016, 2020):         # observed Aqua era: lo = hi = value
        assert harm[(leap, 52)]["lo"] == harm[(leap, 52)]["hi"] == pytest.approx(14.0)
    assert harm[(2024, 52)]["lo"] == pytest.approx(14.0 * 0.9)   # translated era: lo/hi scale like value


def test_three_uncovered_days_make_the_week_missing():
    gaps = week_days(2010, 10)[:3]
    t = daily_table(date(2010, 1, 1), date(2010, 12, 31), 2.0, uncovered=gaps)
    r = rows_of(calendar_rows(t, "week", date(2010, 12, 31)), "harmonized")[(2010, 10)]
    assert r == {"year": 2010, "week": 10, "series": "harmonized", "value": None, "lo": None, "hi": None,
                 "kind": "missing", "source": None}


def test_two_uncovered_days_scale_by_seven_fifths():
    gaps = week_days(2010, 10)[:2]
    t = daily_table(date(2010, 1, 1), date(2010, 12, 31), 3.0, uncovered=gaps)
    r = rows_of(calendar_rows(t, "week", date(2010, 12, 31)), "harmonized")[(2010, 10)]
    assert r["value"] == pytest.approx(15.0 * 7 / 5)
    assert r["kind"] == "observed" and r["source"] == "aqua"


def test_monthly_scaling_and_missing_rule():
    # June 2010: 30 days. 6 uncovered -> 24 covered = 80% -> kept and scaled; 7 uncovered -> missing.
    june = [date(2010, 6, d) for d in range(1, 31)]
    ok = rows_of(calendar_rows(daily_table(date(2010, 1, 1), date(2010, 12, 31), 1.0, uncovered=june[:6]),
                               "month", date(2010, 12, 31)), "harmonized", "month")[(2010, 6)]
    assert ok["value"] == pytest.approx(30.0)
    bad = rows_of(calendar_rows(daily_table(date(2010, 1, 1), date(2010, 12, 31), 1.0, uncovered=june[:7]),
                                "month", date(2010, 12, 31)), "harmonized", "month")[(2010, 6)]
    assert bad["value"] is None and bad["kind"] == "missing"


def test_bins_after_the_last_data_day_are_omitted():
    t = daily_table(date(2026, 1, 1), date(2026, 11, 13), 1.0)
    rows = calendar_rows(t, "week", date(2026, 11, 13))
    weeks = sorted(w for (_, w) in rows_of(rows, "harmonized"))
    assert weeks[-1] == 45                              # week 46 ends 2026-11-18
    months = sorted(m for (_, m) in rows_of(calendar_rows(t, "month", date(2026, 11, 13)), "harmonized", "month"))
    assert months[-1] == 10


# ------------------------------------------------------------------ kind and series mapping
def test_majority_kind_and_ties():
    from collections import Counter
    assert majority_kind(Counter(observed=4, harmonized=3)) == "observed"
    assert majority_kind(Counter(observed=3, harmonized=3)) == "harmonized"
    assert majority_kind(Counter(observed=3, estimated=3)) == "estimated"


def test_week_kind_tie_goes_to_harmonized():
    days = week_days(2012, 10)

    def ks(series, d):
        return ("harmonized", "snpp") if d in days[:3] else ("observed", "aqua")

    t = daily_table(date(2012, 1, 1), date(2012, 12, 31), 1.0, uncovered=[days[6]], kind_source=ks)
    r = rows_of(calendar_rows(t, "week", date(2012, 12, 31)), "harmonized")[(2012, 10)]
    assert r["kind"] == "harmonized"


def test_series_mapping_and_meta():
    t = daily_table(date(2011, 1, 1), date(2012, 12, 31), lambda d: 1.0)
    t.loc[t["series"] == "viirs_equiv_t1", "value"] = 5.0
    t.loc[t["series"] == "snpp_raw", "value"] = 99.0
    doc = build_calendar_files(t, "testland", SCIENCE, HEADER)["weekly"]
    assert {r["series"] for r in doc["rows"]} == {"aqua_raw", "viirs_raw", "viirs_as_aqua", "harmonized", "viirs_equiv"}
    equiv = rows_of(doc["rows"], "viirs_equiv")
    assert equiv[(2011, 5)]["value"] == pytest.approx(35.0)
    assert equiv[(2011, 5)]["kind"] == "estimated"
    assert doc["series_meta"]["viirs_equiv"]["method"] == "tier1"
    assert all(r["value"] != pytest.approx(99.0 * 7) for r in doc["rows"])


# ------------------------------------------------------------------ climatology
def test_smoothing_is_circular():
    v = [0.0] * 52
    v[0], v[51] = 3.0, 6.0
    s = smooth_circular(v, 3)
    assert s[51] == pytest.approx((0.0 + 6.0 + 3.0) / 3)    # week 52 uses week 51, 52 and 1
    assert s[0] == pytest.approx((6.0 + 3.0 + 0.0) / 3)     # week 1 uses week 52


def test_climatology_of_identical_years_equals_that_year():
    # Daily value = week number (constant within each week), so every year's weekly value is 7 * week.
    from pipeline.common import timebins
    t = daily_table(date(2003, 1, 1), date(2025, 12, 31), lambda d: float(timebins.week_of_year(d)),
                    series=("harmonized",))
    t2 = daily_table(date(2003, 1, 1), date(2025, 12, 31), lambda d: float(d.month), series=("harmonized",))
    weekly = calendar_rows(t, "week", date(2025, 12, 31))
    monthly = calendar_rows(t2, "month", date(2025, 12, 31))
    from pipeline.stats.calendar import climatology_json
    clim = climatology_json(weekly, monthly, "testland", SCIENCE, HEADER)
    year = [7.0 * w for w in range(1, 53)]
    expected = smooth_circular(year, 3)
    for w in clim["weeks"]:
        for q in ("min", "p10", "p25", "p50", "p75", "p90", "max"):
            assert w[q] == pytest.approx(expected[w["week"] - 1])
        assert w["n_years"] == 23
    assert clim["weeks"][51]["p50"] == pytest.approx(7 * (51 + 52 + 1) / 3)
    for m in clim["months"]:
        if m["month"] != 2:                             # February has 28 or 29 days
            assert m["min"] == m["max"] == pytest.approx(m["month"] * cal.monthrange(2003, m["month"])[1])
    assert clim["baseline_years"] == [2003, 2025]


def test_climatology_quantiles_are_numpy_linear_over_non_missing_years():
    # Week-10 value of year y = 7 * (y - 2002): 1..23 times 7. One year missing.
    from pipeline.stats.calendar import climatology_json
    rows = [{"series": "harmonized", "year": y, "week": w, "value": 7.0 * (y - 2002)}
            for y in range(2003, 2026) for w in range(1, 53)]
    rows = [dict(r, value=None) if (r["year"], r["week"]) == (2010, 10) else r for r in rows]
    months = [{"series": "harmonized", "year": y, "month": m, "value": 1.0} for y in range(2003, 2026) for m in range(1, 13)]
    clim = climatology_json(rows, months, "t", {**SCIENCE, "climatology": {"baseline_years": [2003, 2025],
                                                                          "smooth_weeks": 1}}, HEADER)
    w10 = clim["weeks"][9]
    assert w10["n_years"] == 22
    vals = sorted(7.0 * k for k in range(1, 24) if k != 8)
    import numpy as np
    assert w10["p10"] == pytest.approx(float(np.quantile(vals, 0.1)))
    assert w10["min"] == 7.0 and w10["max"] == 161.0


# ------------------------------------------------------------------ daily.json
def test_kind_runs_reproduce_per_day_kinds_exactly():
    gaps = [date(2020, 8, d) for d in range(16, 31)] + [date(2024, 2, 29)]
    t = daily_table(date(2020, 1, 1), date(2026, 3, 31), 1.0, uncovered=gaps)
    doc = daily_json(t, "testland", HEADER)
    start = date.fromisoformat(doc["start"])
    for s in ("harmonized", "aqua_raw", "viirs_equiv"):
        expected = []
        src = t[t["series"] == ("viirs_equiv_t1" if s == "viirs_equiv" else s)].sort_values("local_day")
        for k, so in zip(src["kind"], src["source"]):
            expected.append((k, None if k == "missing" else so))
        got = []
        for run in (r for r in doc["kind_runs"] if r["series"] == s):
            n = (date.fromisoformat(run["to"]) - date.fromisoformat(run["from"])).days + 1
            assert (date.fromisoformat(run["from"]) - start).days == len(got)     # runs are contiguous
            got += [(run["kind"], run["source"])] * n
        assert got == expected, s
    harm_runs = [(r["from"], r["kind"], r["source"]) for r in doc["kind_runs"] if r["series"] == "harmonized"]
    assert ("2023-01-01", "harmonized", "snpp") in harm_runs
    assert ("2026-01-01", "harmonized", "noaa20") in harm_runs


def test_daily_columns_nulls_and_lengths():
    t = daily_table(date(2020, 1, 1), date(2020, 1, 10), 2.0, uncovered=[date(2020, 1, 3)])
    t = t[~((t["series"] == "aqua_raw") & (t["local_day"] == date(2020, 1, 5)))]   # a day absent from the table
    doc = daily_json(t, "testland", HEADER)
    assert doc["n_days"] == 10 and doc["start"] == "2020-01-01"
    h = doc["series"]["harmonized"]
    assert len(h["value"]) == len(h["lo"]) == len(h["hi"]) == 10
    assert h["value"][2] is None and h["lo"][2] is None
    assert doc["series"]["aqua_raw"]["value"][4] is None
    assert "lo" not in doc["series"]["aqua_raw"]


# ------------------------------------------------------------------ contract conformance
def _validator(name: str) -> Draft202012Validator:
    registry = Registry().with_resources(
        (p.name, Resource.from_contents(json.loads(p.read_text(encoding="utf-8")), default_specification=DRAFT202012))
        for p in CONTRACTS.glob("*.schema.json"))
    return Draft202012Validator(json.loads((CONTRACTS / f"{name}.schema.json").read_text(encoding="utf-8")),
                                registry=registry)


def test_outputs_validate_against_contracts_and_have_no_nan(tmp_path):
    gaps = [d for w in (10, 30) for d in week_days(2005, w)]
    t = daily_table(date(2003, 1, 1), date(2026, 11, 13), lambda d: float(d.month % 5), uncovered=gaps)
    path = tmp_path / "daily.parquet"
    t.to_parquet(path)                                   # round-trip through Parquet like the real input
    docs = build_calendar_files(pd.read_parquet(path), "testland", SCIENCE, HEADER)
    for name, doc in docs.items():
        text = json.dumps(doc, allow_nan=False)          # raises on NaN / Infinity
        errors = [e.message for e in _validator(name).iter_errors(json.loads(text))]
        assert errors == [], name
    missing = [r for r in docs["weekly"]["rows"] if r["series"] == "harmonized" and r["value"] is None]
    assert {(r["year"], r["week"]) for r in missing} == {(2005, 10), (2005, 30)}
