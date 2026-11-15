"""Tests for pipeline/stats/season.py (R1 prompt B3) on fabricated climatologies and daily tables."""

from __future__ import annotations

import json
import math
from datetime import date

import numpy as np
import pytest

from pipeline.stats.calendar import calendar_rows, climatology_json
from pipeline.stats.season import (
    build_season,
    critical_weeks,
    week_label,
    window_runs,
    windows,
)
from pipeline.stats.tests.fabricate import (
    HEADER,
    SCIENCE,
    contract_validator,
    daily_table,
)


def bumps(*peaks: tuple[float, float, float], floor: float = 0.0) -> list[float]:
    """52 weekly p50 values: sum of circular Gaussians (centre week, area, width in weeks)."""
    out = []
    for w in range(1, 53):
        v = floor
        for centre, area, width in peaks:
            d = abs(w - centre) % 52
            d = min(d, 52 - d)
            v += area / (width * math.sqrt(2 * math.pi)) * math.exp(-d * d / (2 * width * width))
        out.append(v)
    return out


def climatology_of(p50: list[float]) -> dict:
    return {"weeks": [{"week": w, "p50": v} for w, v in enumerate(p50, start=1)]}


# ------------------------------------------------------------------ step 1
def test_single_peak_gives_one_window_centred_on_the_peak():
    crit, wins = windows(bumps((30, 100, 2.0)), SCIENCE)
    assert len(wins) == 1
    w = wins[0]
    assert w["peak_week"] == 30
    # weeks are added one at a time, so an exact tie can leave one extra week on one side
    assert abs((30 - w["start_week"]) - (w["end_week"] - 30)) <= 1
    assert crit == list(range(w["start_week"], w["end_week"] + 1))


def test_two_peaks_70_30_give_two_windows_ordered_by_share():
    _, wins = windows(bumps((15, 30, 1.5), (40, 70, 1.5)), SCIENCE)
    assert [w["peak_week"] for w in wins] == [40, 15]
    assert wins[0]["share"] > wins[1]["share"] >= 0.15
    assert wins[0]["share"] == pytest.approx(0.7, abs=0.08)


def test_season_wrapping_the_year_end_is_one_window():
    _, wins = windows(bumps((1, 100, 2.0)), SCIENCE)
    assert len(wins) == 1
    w = wins[0]
    assert w["start_week"] > w["end_week"]
    assert w["peak_week"] == 1


def test_critical_weeks_reach_the_share_with_fewest_weeks():
    p50 = [0.0] * 52
    p50[9], p50[10], p50[11] = 50.0, 30.0, 20.0              # weeks 10, 11, 12
    assert critical_weeks(p50, 0.8) == [10, 11]


def test_one_week_gaps_merge_and_small_windows_drop():
    assert window_runs([10, 11, 13, 14]) == [[10, 11, 12, 13, 14]]
    assert window_runs([10, 11, 14, 15]) == [[10, 11], [14, 15]]
    assert window_runs([51, 52, 1, 2]) == [[51, 52, 1, 2]]
    _, wins = windows(bumps((10, 88, 1.5), (35, 12, 1.0)), SCIENCE)   # second peak below 15%
    assert [w["peak_week"] for w in wins] == [10]


def test_flat_zero_climatology_has_no_critical_weeks_or_windows():
    assert windows([0.0] * 52, SCIENCE) == ([], [])


@pytest.mark.parametrize(("start", "end", "label"), [
    (42, 46, "mid-October to mid-November"),
    (16, 20, "mid-April to mid-May"),
    (27, 28, "early to mid July"),
    (51, 2, "mid-December to mid-January"),
])
def test_labels_in_plain_words(start, end, label):
    assert week_label(start, end) == label


# ------------------------------------------------------------------ step 2
def seasonal_table(centre_doy, width_days=12.0, amp=50.0, first=2003, last=2026, noise=0.0, seed=1, floor=0.1):
    rng = np.random.default_rng(seed)
    jitter = {y: float(rng.standard_normal()) * noise for y in range(first, last + 1)}

    def value(d: date) -> float:
        doy = d.timetuple().tm_yday
        c = centre_doy(d.year) + jitter[d.year]
        dist = min(abs(doy - c), 365 - abs(doy - c))
        return amp * math.exp(-dist * dist / (2 * width_days ** 2)) + floor

    return daily_table(date(first, 1, 1), date(last, 12, 31), value, series=("harmonized",))


def season_doc(table):
    weekly = calendar_rows(table, "week", table["local_day"].max())
    monthly = calendar_rows(table, "month", table["local_day"].max())
    clim = climatology_json(weekly, monthly, "testland", SCIENCE, HEADER)
    return build_season(clim, table, "testland", SCIENCE, HEADER)


def test_planted_shift_of_minus_5_days_per_decade_is_recovered():
    doc = season_doc(seasonal_table(lambda y: 200 - 0.5 * (y - 2014), noise=1.0))
    w = doc["windows"][0]
    assert len(w["by_year"]) == 23
    for key in ("start", "centroid", "end"):
        s = w["shift_days_per_decade"][key]
        assert s["value"] == pytest.approx(-5.0, abs=1.5), key
        assert s["lo"] < s["value"] < s["hi"] < 0
    assert w["sentence"].startswith(f"The {w['label']} season now starts about 5 days earlier per decade (")


def test_no_shift_gives_the_no_clear_shift_sentence():
    doc = season_doc(seasonal_table(lambda y: 200.0, noise=3.0))
    w = doc["windows"][0]
    assert w["shift_days_per_decade"]["start"]["lo"] <= 0 <= w["shift_days_per_decade"]["start"]["hi"]
    assert w["sentence"] == f"No clear shift in the timing of the {w['label']} season."


def test_wrapping_season_timing_and_contract():
    doc = season_doc(seasonal_table(lambda y: 3.0))
    w = doc["windows"][0]
    assert w["start_week"] > w["end_week"]
    starts = {r["start_doy"] for r in w["by_year"]}
    assert all(r["start_doy"] > 300 and r["end_doy"] < 60 for r in w["by_year"]), starts
    assert len(w["by_year"]) == 23                          # 2025's season ends in January 2026, data present
    assert [e.message for e in contract_validator("season").iter_errors(json.loads(json.dumps(doc)))] == []


def test_years_without_enough_activity_are_skipped_and_step2_falls_back():
    # no background: a year's whole bump is 0.5 * 12 * sqrt(2 pi) ~ 15 cell-days < 20; 2010 is 40x that
    t = seasonal_table(lambda y: 200.0, amp=0.5, floor=0.0)
    t.loc[t["local_day"].map(lambda d: d.year == 2010), "value"] *= 40
    doc = season_doc(t)
    w = doc["windows"][0]
    assert [r["year"] for r in w["by_year"]] == [2010]
    assert w["shift_days_per_decade"]["start"] == {"value": None, "lo": None, "hi": None}
    assert "unavailable" in w["sentence"]


def test_document_validates_and_is_deterministic():
    t = seasonal_table(lambda y: 200 - 0.5 * (y - 2014), noise=1.0)
    a, b = season_doc(t), season_doc(t)
    text = json.dumps(a, sort_keys=True, allow_nan=False)
    assert text == json.dumps(b, sort_keys=True, allow_nan=False)
    assert [e.message for e in contract_validator("season").iter_errors(json.loads(text))] == []
    assert a["definition"] == "The fewest weeks that hold 80% of a typical year's burning"


def test_scattered_critical_weeks_give_no_window_and_the_definition_says_so():
    # Equal bursts every third week: each run is one week (~5.6% of the year), below the 15% window floor.
    p50 = [10.0 if (w - 1) % 3 == 0 else 0.0 for w in range(1, 53)]
    crit, wins = windows(p50, SCIENCE)
    assert crit and wins == []
    doc = build_season({"weeks": [{"week": w, "p50": v} for w, v in enumerate(p50, start=1)]},
                       seasonal_table(lambda y: 200), "testland", SCIENCE, HEADER)
    assert doc["windows"] == [] and doc["critical_weeks"] == crit
    assert doc["definition"] == ("The fewest weeks that hold 80% of a typical year's burning; no run of them "
                                 "holds 15% of it, so there is no distinct season window")
    assert [e.message for e in contract_validator("season").iter_errors(json.loads(json.dumps(doc)))] == []
