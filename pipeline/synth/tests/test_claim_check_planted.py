"""SD-20 planted truth on the published synthland claim_check.json (V7 spirit: recover what was planted).

A claim equal to the planted trend over the whole record must hold up; a claim built from the naive splice
across the 2012 sensor change must be flagged (sensor_artifact or weaker_than_claimed).
"""

from __future__ import annotations

import json
from pathlib import Path

from pipeline.common.claim_check import check_claim, config_from_doc, r3, series_from_doc, window
from pipeline.synth import planted as P

ROOT = Path(__file__).resolve().parents[3]
DOC = json.loads((ROOT / "web/public/data/synthland/claim_check.json").read_text(encoding="utf-8"))
FIXTURE = json.loads((ROOT / "contracts/fixtures/claim_check_parity.json").read_text(encoding="utf-8"))


def _planted_change(cfg):
    y0, y1 = cfg["record_years"]
    factor = lambda y: 1 + P.TREND_PER_YEAR * (y - P.TREND_BASE_YEAR)

    def mean(w):
        years = range(w[0], w[1] + 1)
        return sum(factor(y) for y in years) / len(years)
    w = cfg["window_years"]
    return r3((mean(window(y1, cfg["record_years"], w)) / mean(window(y0, cfg["record_years"], w)) - 1) * 100)


def _claim(pct, y0, y1):
    return {"place": "region", "direction": "increased", "claimed_pct": pct, "from_year": y0, "to_year": y1}


def test_planted_trend_claim_holds_up():
    cfg = config_from_doc(DOC)
    y0, y1 = cfg["record_years"]
    out = check_claim(_claim(_planted_change(cfg), y0, y1), series_from_doc(DOC, "Synthland"), cfg)
    assert out["verdict"] == "holds_up", out


def test_naive_splice_claim_across_the_sensor_change_is_flagged():
    cfg = config_from_doc(DOC)
    series = series_from_doc(DOC, "Synthland")
    y0, y1 = 2005, 2020
    assert y0 < cfg["sensor_change_year"] <= y1
    naive = check_claim(_claim(1, y0, y1), series, cfg)["naive"]["change_pct"]
    out = check_claim(_claim(naive, y0, y1), series, cfg)
    assert out["verdict"] in ("sensor_artifact", "weaker_than_claimed"), out


def test_parity_fixture_planted_cases_use_the_planted_trend():
    cases = {c["name"]: c for c in FIXTURE["cases"]}
    case = cases["planted_trend_full_record"]
    assert case["claim"]["claimed_pct"] == _planted_change(config_from_doc(DOC))
    assert case["expected"]["verdict"] == "holds_up"
    assert cases["planted_naive_splice_across_2012"]["expected"]["verdict"] in ("sensor_artifact",
                                                                               "weaker_than_claimed")
