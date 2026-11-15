"""SD-17 tests (R1 prompt D2): which tier feeds the viirs_equiv lens, and Tier 2 never reaching trend.json."""

from __future__ import annotations

import json
from datetime import date

import pandas as pd
import pytest

from pipeline.stats.calendar import build_calendar_files, viirs_equiv_method
from pipeline.stats.tests.fabricate import (
    HEADER,
    SCIENCE,
    annual_bootstrap,
    annual_daily,
    contract_validator,
    daily_table,
    naive_annual,
)
from pipeline.stats.trend import build_trend_files

START, END = date(2003, 1, 1), date(2025, 12, 31)


def tables():
    """Tier 1 daily (every series 1.0/day) and a daily_t2 whose series are 3.0 and 99.0 per day."""
    t1 = daily_table(START, END, 1.0)
    t2 = pd.concat([daily_table(START, END, 3.0, series=("viirs_equiv_t2",)),
                    daily_table(START, END, 99.0, series=("harmonized_t2",))], ignore_index=True)
    return t1, t2


def weekly(docs, series):
    return {(r["year"], r["week"]): r for r in docs["weekly"]["rows"] if r["series"] == series}


@pytest.mark.parametrize(("curve", "expected"), [
    (None, "tier1"),
    ({"region": "x", "status": "absent"}, "tier1"),
    ({"region": "x", "status": "exploratory"}, "tier1"),
    ({"region": "x", "status": "validated"}, "tier2"),
])
def test_method_follows_curve_status(curve, expected):
    assert viirs_equiv_method(curve) == expected


def test_validated_curve_uses_tier2_for_viirs_equiv_only():
    t1, t2 = tables()
    docs = build_calendar_files(t1, "testland", SCIENCE, HEADER, curve={"status": "validated"}, daily_t2=t2)
    for name in ("weekly", "monthly"):
        assert docs[name]["series_meta"]["viirs_equiv"]["method"] == "tier2"
    assert weekly(docs, "viirs_equiv")[(2010, 10)]["value"] == pytest.approx(21.0)     # 3.0 x 7
    assert weekly(docs, "harmonized")[(2010, 10)]["value"] == pytest.approx(7.0)       # harmonized_t2 ignored
    assert docs["daily"]["series"]["viirs_equiv"]["value"][0] == pytest.approx(3.0)
    assert docs["daily"]["series"]["harmonized"]["value"][0] == pytest.approx(1.0)
    tier1 = build_calendar_files(t1, "testland", SCIENCE, HEADER)
    assert docs["climatology"] == tier1["climatology"]                                  # built from Tier 1
    for name in ("weekly", "monthly", "daily"):
        text = json.dumps(docs[name], allow_nan=False)
        assert [e.message for e in contract_validator(name).iter_errors(json.loads(text))] == []


@pytest.mark.parametrize("curve", [None, {"status": "exploratory"}])
def test_otherwise_tier1_even_when_daily_t2_exists(curve):
    t1, t2 = tables()
    docs = build_calendar_files(t1, "testland", SCIENCE, HEADER, curve=curve, daily_t2=t2)
    assert docs["weekly"]["series_meta"]["viirs_equiv"]["method"] == "tier1"
    assert weekly(docs, "viirs_equiv")[(2010, 10)]["value"] == pytest.approx(7.0)      # 1.0 x 7 from Tier 1


def test_validated_without_tier2_series_is_an_error():
    t1, _ = tables()
    with pytest.raises(ValueError, match="viirs_equiv_t2"):
        build_calendar_files(t1, "testland", SCIENCE, HEADER, curve={"status": "validated"}, daily_t2=None)
    harmonized_only = daily_table(START, END, 99.0, series=("harmonized_t2",))
    with pytest.raises(ValueError, match="viirs_equiv_t2"):
        build_calendar_files(t1, "testland", SCIENCE, HEADER, curve={"status": "validated"},
                             daily_t2=harmonized_only)


def test_trend_never_reads_tier2_series():
    years = range(2003, 2026)
    harm = {y: 1000.0 * (1 + 0.02 * (y - 2014)) for y in years}
    daily = annual_daily({"harmonized": harm, "aqua_raw": harm, "viirs_as_aqua": harm})
    t2 = annual_daily({"harmonized_t2": {y: 5000.0 for y in years}, "viirs_equiv_t2": {y: 5000.0 for y in years}})
    boot = annual_bootstrap(harm)
    naive = naive_annual(harm, {y: harm[y] for y in years if y >= 2012})
    clean = build_trend_files(daily, boot, naive, "testland", "Testland", SCIENCE, HEADER)
    polluted = build_trend_files(pd.concat([daily, t2], ignore_index=True), boot, naive, "testland", "Testland",
                                 SCIENCE, HEADER)
    assert polluted == clean
