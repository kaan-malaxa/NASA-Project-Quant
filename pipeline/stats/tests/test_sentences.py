"""Tests for pipeline/stats/sentences.py on fabricated estimates with known answers."""

from __future__ import annotations

from datetime import date

import pytest

from pipeline.stats.sentences import (
    Estimate,
    direction_of,
    nowcast_sentence,
    ruler_sentence,
    season_shift_sentence,
    verdict_id,
    verdict_sentence,
    whole,
)

GAP = 10


@pytest.mark.parametrize(("lo", "hi", "expected"), [
    (1, 5, "rising"), (-5, -1, "falling"), (-1, 1, "no_clear_change"), (0, 3, "no_clear_change"),
])
def test_direction_of(lo, hi, expected):
    assert direction_of(lo, hi) == expected


CASES = {
    "artifact_flat": (Estimate(2, -6, 9), Estimate(38, 25, 52)),
    "artifact_rising": (Estimate(15, 5, 25), Estimate(40, 30, 50)),
    "artifact_falling": (Estimate(-20, -30, -10), Estimate(10, 2, 18)),
    "agree": (Estimate(31, 12, 55), Estimate(36, 15, 60)),
    "unclear": (Estimate(14, -3, 33), Estimate(41, -1, 88)),
}


@pytest.mark.parametrize("sid", sorted(CASES))
def test_every_branch_reachable_and_filled(sid):
    h, n = CASES[sid]
    assert verdict_id(h, n, [h.direction, h.direction], GAP) == sid
    text = verdict_sentence(sid, h, n)
    assert "{" not in text and "}" not in text and "number of fires" not in text


def test_variant_disagreement_forces_unclear():
    h, n = CASES["agree"]
    assert verdict_id(h, n, ["rising", "no_clear_change"], GAP) == "unclear"


def test_flat_needs_naive_above_harmonized_range():
    # N rising but its lo is not above H.hi -> not artifact_flat
    assert verdict_id(Estimate(2, -6, 9), Estimate(12, 5, 20), [], GAP) == "unclear"


def test_whole_number_rounding():
    assert [whole(x) for x in (2.5, -2.5, 0.4, -0.4, 37.6)] == ["3", "-3", "0", "0", "38"]


def test_artifact_flat_text():
    h, n = CASES["artifact_flat"]
    assert verdict_sentence("artifact_flat", h, n) == (
        "The raw record suggests burning rose 38% per decade. After correcting for the sensor change, "
        "there is no clear change (-6 to 9% per decade).")


def test_unknown_sentence_id_raises():
    with pytest.raises(ValueError):
        verdict_sentence("maybe", *CASES["agree"])


def test_other_templates():
    assert ruler_sentence("Testland", 4.138).startswith("In Testland, VIIRS reports about 4.1 times")
    assert nowcast_sentence("unavailable", "Testland", None, None, None, 0) == "No recent satellite data."
    assert "Too little burning" in nowcast_sentence("low_activity", "Testland", date(2026, 11, 13), 1, 40, 23)
    assert nowcast_sentence("extreme", "Testland", date(2026, 11, 13), 987.1, 95.65, 23) == (
        "In the 7 days to 13 November 2026, Testland had 987 Aqua-equivalent fire cell-days: "
        "higher than 96% of the same week in 23 past years.")
    assert season_shift_sentence("summer", -6.2, -10, -4) == (
        "The summer season now starts about 6 days earlier per decade (-10 to -4).")
    assert season_shift_sentence("summer", 1, -1, 3) == "No clear shift in the timing of the summer season."
    assert season_shift_sentence("summer", None, None, None) == ""
