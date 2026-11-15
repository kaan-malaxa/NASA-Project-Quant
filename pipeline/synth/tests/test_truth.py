"""truth.json: schema, tolerances, independence, and known answers for each truth computation."""

from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from pipeline.synth import planted as P
from pipeline.synth.truth import (
    TOL,
    binned_rates,
    celldays,
    g_and_matched,
    k_factors,
    n20_first_full_year,
    theil_sen_pct_per_decade,
)

SCHEMA_PATH = Path(__file__).resolve().parents[1] / "truth_schema.json"
# R4 section 9.5 sets these two exact-count quantities to tolerance 0; every other tolerance must be > 0.
EXACT_COUNT_QUANTITIES = {"aqua_outage_days_missing", "static_rows_surviving"}
SCIENCE = {"grid": {"count_res": 6}, "filters": {"modis_min_confidence": 30, "viirs_keep": ["n", "h"]}}
BBOX = (10.0, 10.0, 12.0, 12.0)


# ------------------------------------------------------------ a small JSON Schema checker (no new dependency)
_TYPES = {"object": dict, "array": list, "string": str, "boolean": bool, "null": type(None)}


def _check_type(value, t) -> bool:
    if t == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if t == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    return isinstance(value, _TYPES[t])


def validate(value, schema: dict, root: dict, where: str = "$") -> list[str]:
    if "$ref" in schema:
        name = schema["$ref"].split("/")[-1]
        return validate(value, root["$defs"][name], root, where)
    errors = []
    if "type" in schema:
        types = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not any(_check_type(value, t) for t in types):
            return [f"{where}: expected {schema['type']}, got {type(value).__name__}"]
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{where}: {value!r} not in {schema['enum']}")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{where}: {value} < {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{where}: {value} > {schema['maximum']}")
        if "exclusiveMinimum" in schema and value <= schema["exclusiveMinimum"]:
            errors.append(f"{where}: {value} <= {schema['exclusiveMinimum']}")
    if isinstance(value, str) and "pattern" in schema and not re.search(schema["pattern"], value):
        errors.append(f"{where}: {value!r} does not match {schema['pattern']}")
    if isinstance(value, dict):
        for key in schema.get("required", []):
            if key not in value:
                errors.append(f"{where}: missing {key}")
        props = schema.get("properties", {})
        for key, sub in value.items():
            if key in props:
                errors += validate(sub, props[key], root, f"{where}.{key}")
            elif schema.get("additionalProperties") is False:
                errors.append(f"{where}: unexpected key {key}")
    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0) or len(value) > schema.get("maxItems", len(value)):
            errors.append(f"{where}: {len(value)} items")
        if "items" in schema:
            for i, item in enumerate(value):
                errors += validate(item, schema["items"], root, f"{where}[{i}]")
    return errors


@pytest.fixture(scope="module")
def schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def truth(tiny7) -> dict:
    return json.loads((tiny7 / "truth.json").read_text(encoding="utf-8"))


# ------------------------------------------------------------ truth.json as written
def test_validator_catches_errors(schema):
    bad = {"seed": "7", "size": "huge"}
    errors = validate(bad, schema, schema)
    assert any("seed" in e for e in errors) and any("size" in e for e in errors)
    assert any("missing planted" in e for e in errors)


def test_truth_validates_against_schema(truth, schema):
    assert validate(truth, schema, schema) == []


def test_every_tolerance_positive(truth):
    for e in truth["expected"]:
        if e["quantity"] in EXACT_COUNT_QUANTITIES:
            assert e["tolerance"] == 0, e
        else:
            assert e["tolerance"] > 0, e
    assert all(b["tolerance"] > 0 for b in truth["binned_rates"])
    assert {e["quantity"]: e["tolerance"] for e in truth["expected"]} == {
        "k_annual_snpp": 0.03, "k_annual_noaa20": 0.04, "k_month_snpp_max_abs_err": 0.08, "g": 0.03,
        "reliability_err": 0.05, "trend_pct_per_decade": 5.0, "peak_week_main": 1, "peak_week_second": 1,
        "aqua_outage_days_missing": 0, "static_rows_surviving": 0}


def test_truth_values_are_plausible(truth):
    exp = {e["quantity"]: e for e in truth["expected"]}
    assert 0.2 < exp["k_annual_snpp"]["truth"] < 1.0
    assert 0.2 < exp["k_annual_noaa20"]["truth"] < 1.0
    assert exp["g"]["truth"] >= 1.0
    assert abs(exp["peak_week_main"]["truth"] - 44) <= 1 and abs(exp["peak_week_second"]["truth"] - 18) <= 1
    assert exp["aqua_outage_days_missing"]["truth"] == 18
    assert truth["noaa20"] == {"first_full_year": P.NOAA20_FIRST_FULL_YEAR, "fit_years": 5,
                               "method": P.EXPECTED_NOAA20_METHOD}
    p = [b["p_true"] for b in truth["binned_rates"]]
    assert p[0] < p[-1] <= P.AQUA_CURVE["c"] + TOL["binned_rate"]
    annual = {a["year"]: a for a in truth["aqua_scale_annual"]}
    assert sorted(annual) == list(range(2003, 2026))
    assert annual[2020]["covered_days"] == 366 - 18 and annual[2024]["source"] == "aqua_ref"
    assert 0 < exp["trend_pct_per_decade"]["truth"] < 25


def test_truth_code_is_independent():
    import ast

    tree = ast.parse((Path(__file__).resolve().parents[1] / "truth.py").read_text(encoding="utf-8"))
    modules = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(a.name for a in node.names)
        elif isinstance(node, ast.ImportFrom):
            modules.add("." * node.level + (node.module or ""))
    for stage in ("ingest", "harmonize", "eyesight", "stats", "export"):
        assert not any(stage in m.split(".") for m in modules), modules


# ------------------------------------------------------------ known answers on fabricated inputs
def _cd(rows):
    return pd.DataFrame(rows, columns=["sensor", "local_day", "cell", "frp_sum"]).assign(
        local_day=lambda d: pd.to_datetime(d["local_day"]).to_numpy().astype("datetime64[D]"), n_det=1)


def test_k_factors_known_answer():
    days = np.array(["2015-01-05", "2015-02-05"], dtype="datetime64[D]")
    cd = _cd([("aqua", "2015-01-05", "c1", 1), ("snpp", "2015-01-05", "c1", 1), ("snpp", "2015-01-05", "c2", 1),
              ("snpp", "2015-02-05", "c1", 1), ("snpp", "2015-02-05", "c3", 1),
              ("aqua", "2015-03-05", "c1", 1)])  # outside the days: ignored
    k = k_factors(cd, "snpp", days, n0=2.0)
    assert k["k_annual"] == pytest.approx(1 / 4)
    jan, feb = k["monthly"][0], k["monthly"][1]
    assert jan["k"] == pytest.approx((1 + 2 * 0.25) / (2 + 2))
    assert feb["k"] == pytest.approx((0 + 2 * 0.25) / (2 + 2))
    assert k["monthly"][5]["k"] == pytest.approx(0.25)  # empty month shrinks fully to k_ann


def test_g_and_matched_known_answer():
    days = np.array(["2015-01-05"], dtype="datetime64[D]")
    cd = _cd([("snpp", "2015-01-05", "c1", 10.0), ("snpp", "2015-01-05", "c2", 0.0),
              ("snpp", "2015-01-05", "c3", 100.0), ("snpp", "2015-01-05", "c4", 1.0),
              ("aqua", "2015-01-05", "c1", 5.0), ("aqua", "2015-01-05", "c3", 5.0),
              ("aqua", "2015-01-05", "c9", 5.0)])  # Aqua-only cell-day raises g
    g, m = g_and_matched(cd, days, floor_mw=0.1)
    assert g == pytest.approx(3 / 2)
    assert m["y"].tolist() == [1, 0, 1, 0]
    assert m["x"].tolist() == pytest.approx([1.0, -1.0, 2.0, 0.0])  # FRP 0 floored to 0.1, not dropped


def test_binned_rates_known_answer():
    x = np.repeat(np.arange(8, dtype=float), 10)
    y = np.repeat([0, 0, 0, 0, 1, 1, 1, 1], 10)
    b = binned_rates(pd.DataFrame({"x": x, "y": y}))
    assert [r["n"] for r in b] == [10] * 8
    assert b[0]["p_true"] == 0.0 and b[-1]["p_true"] == 1.0
    assert all(r["frp_lo"] <= r["frp_mw"] <= r["frp_hi"] for r in b)


def test_theil_sen_known_answer():
    years = np.arange(2003, 2026, dtype=float)
    values = 100.0 + 2.0 * (years - 2003)
    assert theil_sen_pct_per_decade(years, values) == pytest.approx(100 * 10 * 2.0 / 122.0)


def test_n20_first_full_year():
    d2017 = np.arange(np.datetime64("2017-10-01"), np.datetime64("2018-01-01"))
    d2018 = np.arange(np.datetime64("2018-01-01"), np.datetime64("2018-12-01"))
    assert n20_first_full_year(np.concatenate([d2017, d2018])) == 2018


def test_celldays_filters_and_merging():
    pytest.importorskip("h3")
    rows = pd.DataFrame({
        "sensor": ["snpp", "snpp", "snpp", "snpp", "aqua", "aqua", "snpp", "snpp"],
        "local_day": np.array(["2015-01-05"] * 8, dtype="datetime64[D]"),
        "daynight": ["D", "D", "D", "N", "D", "D", "D", "D"],
        "lat": [11.0, 11.0001, 11.0, 11.0, 11.0, 11.0, 11.0, 13.0],
        "lon": [11.0, 11.0001, 11.0, 11.0, 11.0, 11.0, 11.0, 11.0],
        "frp": [2.0, 3.0, 50.0, 9.0, 4.0, 1.0, 7.0, 7.0],
        "confidence": ["n", "h", "l", "n", "80", "10", "n", "n"],
        "type": ["0", "0", "0", "0", "0", "0", "2", "0"],
    })
    cd = celldays(rows, BBOX, SCIENCE)
    # Kept: snpp rows 0 and 1 (same cell, merged), aqua row 4. Dropped: low confidence (2, 5), night (3),
    # static type 2 (6), outside the bbox (7).
    assert sorted(cd["sensor"]) == ["aqua", "snpp"]
    snpp = cd[cd["sensor"] == "snpp"].iloc[0]
    assert snpp["n_det"] == 2 and snpp["frp_sum"] == pytest.approx(5.0)


def test_static_cell_truth_counts_fires_not_static(truth):
    e = next(x for x in truth["expected"] if x["quantity"] == "static_rows_surviving")
    assert e["static_detections_surviving_spec"] == 0  # SD-02 + SD-18 remove every static detection
    assert e["truth"] > 0 and len(e["static_cells_r6"]) == 5  # fires land in those cells too
