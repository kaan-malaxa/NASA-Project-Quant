"""pipeline/common/claim_check.py (SD-20) on fabricated inputs, and the Python side of the parity fixture."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from jsonschema import Draft202012Validator

from pipeline.common.claim_check import (
    NOTES,
    TEMPLATES,
    check_claim,
    config_from_doc,
    quantile,
    r3,
    series_from_doc,
    signed_pct,
    window,
    window_text,
)
from pipeline.export.check import load_registry

ROOT = Path(__file__).resolve().parents[3]
FIXTURE = json.loads((ROOT / "contracts/fixtures/claim_check_parity.json").read_text(encoding="utf-8"))
DOCS = {key: json.loads((ROOT / f"web/public/data/{key}/claim_check.json").read_text(encoding="utf-8"))
        for key in ("us", "synthland")}


def _inputs(case):
    if case["doc"] is None:
        return case["series"], FIXTURE["inline_config"]
    doc = DOCS[case["doc"]]
    return series_from_doc(doc, case["place_name"]), config_from_doc(doc)


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=[c["name"] for c in FIXTURE["cases"]])
def test_parity_fixture_still_matches_the_reference(case):
    series, config = _inputs(case)
    assert check_claim(case["claim"], series, config) == case["expected"]


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=[c["name"] for c in FIXTURE["cases"]])
def test_every_result_matches_the_contract(case):
    validator = Draft202012Validator({"$ref": "claim_check.schema.json#/$defs/result"}, registry=load_registry())
    assert [e.message for e in validator.iter_errors(case["expected"])] == []


def test_fixture_covers_every_verdict_and_template():
    templates = {c["expected"]["template_id"] for c in FIXTURE["cases"]}
    assert set(TEMPLATES) <= templates
    notes = {n["id"] for c in FIXTURE["cases"] for n in c["expected"]["notes"]}
    assert set(NOTES) <= notes


def test_rounding_is_half_away_from_zero_and_never_negative_zero():
    assert r3(0.0005) == 0.001
    assert r3(-0.0005) == -0.001
    assert str(r3(-0.0001)) == "0.0"
    assert signed_pct(20.5) == "+21%"
    assert signed_pct(-20.5) == "−21%"
    assert signed_pct(-0.4) == "0%"


def test_windows_are_centred_and_trimmed_at_the_record_edges():
    assert window(2010, [2003, 2025], 3) == [2009, 2011]
    assert window(2003, [2003, 2025], 3) == [2003, 2004]
    assert window(2025, [2003, 2025], 3) == [2024, 2025]
    assert window(2010, [2003, 2025], 1) == [2010, 2010]
    assert window_text([2009, 2011]) == "2009–2011"
    assert window_text([2010, 2010]) == "2010"


def test_quantile_matches_numpy_linear():
    values = sorted([3.0, 1.0, 4.0, 1.5, 9.0, 2.6, 5.3])
    for p in (0.05, 0.5, 0.95):
        assert quantile(values, p) == pytest.approx(float(np.percentile(values, p * 100)), abs=1e-12)


def _flat(missing=()):
    return {"place_name": "Testland", "naive_unit": "hotspots", "replicates": {"source": "t", "n": 0, "years": [],
            "values": []}, "annual": [
        {"year": y, "harmonized": None if y in missing else 100.0, "lo": None if y in missing else 100.0,
         "hi": None if y in missing else 100.0, "kind": "missing" if y in missing else "observed",
         "naive_count": None if y in missing else 100.0, "naive_source": "modis"} for y in range(2003, 2026)]}


def test_missing_year_is_never_read_as_zero():
    out = check_claim({"place": "region", "direction": "increased", "claimed_pct": 10, "from_year": 2010,
                       "to_year": 2020}, _flat(missing={2021}), FIXTURE["inline_config"])
    assert out["verdict"] == "cant_tell_missing"
    assert out["missing_years"] == [2021]
    assert out["naive"] is None and out["harmonized"] is None
    assert "missing" in out["kinds"]


def test_from_year_not_before_to_year_is_rejected():
    for y0, y1 in ((2010, 2010), (2015, 2010)):
        out = check_claim({"place": "region", "direction": "increased", "claimed_pct": 10, "from_year": y0,
                           "to_year": y1}, _flat(), FIXTURE["inline_config"])
        assert out["ok"] is False and out["error"] == "years_order" and out["verdict"] is None
