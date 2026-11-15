"""Tests for pipeline/stats/trend.py (R1 prompt B2) on fabricated tables with known answers."""

from __future__ import annotations

import json
from datetime import date, timedelta

import numpy as np
import pytest

from pipeline.stats.tests.fabricate import (
    HEADER,
    SCIENCE,
    annual_bootstrap,
    annual_daily,
    contract_validator,
    naive_annual,
)
from pipeline.stats.trend import bootstrap_replacer, boundaries, build_trend_files, estimate, pct_per_decade

YEARS = range(2003, 2026)


def build(harm, *, aqua=None, translated=None, modis=None, snpp=None, boot_noise=0.0, uncovered=()):
    """Run build_trend_files on fabricated tables. Unspecified series copy the harmonized line."""
    aqua = aqua or harm
    translated = translated or harm
    daily = annual_daily({"harmonized": harm, "aqua_raw": aqua, "viirs_as_aqua": translated},
                         uncovered=uncovered)
    boot = annual_bootstrap(harm, rel_noise=boot_noise)
    naive = naive_annual(modis or harm, snpp or {y: harm[y] for y in YEARS if y >= 2012})
    return build_trend_files(daily, boot, naive, "testland", "Testland", SCIENCE, HEADER)


def line(pct_per_decade_at_median: float, base: float = 1000.0) -> dict[int, float]:
    """Linear series whose median (year 2014) is `base`: slope = pct/1000 * base per year."""
    return {y: base * (1 + pct_per_decade_at_median / 1000.0 * (y - 2014)) for y in YEARS}


def noisy_flat(sd: float, seed: int, base: float = 1000.0) -> dict[int, float]:
    rng = np.random.default_rng(seed)
    return {y: base * float(np.exp(sd * rng.standard_normal())) for y in YEARS}


# ------------------------------------------------------------------ core estimate
def test_boundaries_come_from_science():
    b = boundaries(SCIENCE)
    assert (b["last_modis_naive"], b["first_viirs"], b["aqua_last"], b["jump_from"], b["jump_to"]) == \
        (2011, 2012, 2022, 2013, 2022)


def test_pct_per_decade_formula():
    assert pct_per_decade([2000, 2001, 2002], [90.0, 100.0, 110.0]) == pytest.approx(100.0)
    assert pct_per_decade([2000, 2000], [1.0, 2.0]) is None


def test_planted_plus_20_per_decade_is_recovered():
    docs = build(line(20.0))
    h = docs["trend"]["harmonized"]
    assert h["pct_per_decade"] == pytest.approx(20.0, abs=1.0)
    assert h["direction"] == "rising" and h["lo"] > 0
    assert docs["trend"]["sentence_id"] == "agree"          # naive copies harmonized here
    for v in docs["trend"]["robustness"]:
        assert v["direction"] == "rising"


def test_flat_series_with_noise_is_no_clear_change():
    docs = build(noisy_flat(0.15, seed=3))
    h = docs["trend"]["harmonized"]
    assert h["direction"] == "no_clear_change"
    assert h["lo"] < 0 < h["hi"]


def test_naive_step_is_an_artifact_and_jump_is_three():
    harm = noisy_flat(0.03, seed=5)
    snpp = {y: 3 * harm[y] for y in YEARS if y >= 2012}      # S-NPP sees 3x the MODIS count
    docs = build(harm, modis=harm, snpp=snpp)
    t, r = docs["trend"], docs["ruler"]
    assert t["harmonized"]["direction"] == "no_clear_change"
    assert t["naive"]["direction"] == "rising"
    assert t["sentence_id"] == "artifact_flat"
    assert t["sentence"].startswith("The raw record suggests burning rose ")
    jm = r["jump_multiple"]
    assert jm["value"] == pytest.approx(3.0) and jm["lo"] == pytest.approx(3.0) and jm["hi"] == pytest.approx(3.0)
    assert jm["years"] == [2013, 2022]
    assert "about 3.0 times as many hotspots" in r["sentence"]
    naive_src = {a["year"]: a["naive_source"] for a in t["annual"]}
    assert naive_src[2011] == "modis" and naive_src[2012] == "snpp"


def test_variant_disagreement_forces_unclear():
    harm = noisy_flat(0.03, seed=5)
    aqua_rising = line(80.0)                                 # aqua-only variant rises, primary is flat
    docs = build(harm, aqua=aqua_rising, modis=harm, snpp={y: 3 * harm[y] for y in YEARS if y >= 2012})
    variants = {v["variant"]: v["direction"] for v in docs["trend"]["robustness"]}
    assert variants["aqua_only_2003_2022"] == "rising"
    assert docs["trend"]["harmonized"]["direction"] == "no_clear_change"
    assert docs["trend"]["sentence_id"] == "unclear"


def test_translated_years_bootstrap_widens_the_range():
    tight = build(line(20.0))["trend"]["harmonized"]
    wide = build(line(20.0), boot_noise=0.5)["trend"]["harmonized"]
    assert wide["pct_per_decade"] == pytest.approx(tight["pct_per_decade"])   # point estimate unchanged
    assert (wide["hi"] - wide["lo"]) > (tight["hi"] - tight["lo"])


def test_estimate_skips_missing_years_and_is_seeded():
    series = {y: (None if y == 2010 else 100.0 + y - 2003) for y in YEARS}
    a = estimate(series, YEARS, np.random.default_rng([7, 0]), 200)
    b = estimate(series, YEARS, np.random.default_rng([7, 0]), 200)
    assert a == b and a.lo > 0


# ------------------------------------------------------------------ annual rows and ruler
def test_poorly_covered_year_is_missing_everywhere():
    gaps = [date(2007, 1, 1) + timedelta(i) for i in range(40)]   # 325 of 365 days covered: < 90%
    docs = build(line(20.0), uncovered=gaps)
    row = next(a for a in docs["trend"]["annual"] if a["year"] == 2007)
    assert row["harmonized"] is None and row["lo"] is None and row["kind"] == "missing"
    rrow = next(x for x in docs["ruler"]["rows"] if x["year"] == 2007)
    assert rrow["harmonized_index"] is None and rrow["kind"] == "missing"
    assert docs["trend"]["harmonized"]["pct_per_decade"] == pytest.approx(20.0, abs=1.0)


def test_ruler_indices_divide_by_own_2003_2011_mean():
    harm = {y: 100.0 for y in YEARS}
    snpp = {y: 300.0 for y in YEARS if y >= 2012}
    r = build(harm, modis=harm, snpp=snpp)["ruler"]
    assert r["index_base_years"] == [2003, 2011]
    idx = {x["year"]: x for x in r["rows"]}
    assert idx[2005]["naive_index"] == pytest.approx(1.0) and idx[2005]["harmonized_index"] == pytest.approx(1.0)
    assert idx[2015]["naive_index"] == pytest.approx(3.0) and idx[2015]["harmonized_index"] == pytest.approx(1.0)


def test_jump_range_is_min_max_of_yearly_ratios():
    harm = {y: 100.0 for y in YEARS}
    snpp = {y: (200.0 if y == 2013 else 450.0 if y == 2020 else 300.0) for y in YEARS if y >= 2012}
    jm = build(harm, modis=harm, snpp=snpp)["ruler"]["jump_multiple"]
    assert jm["lo"] == pytest.approx(2.0) and jm["hi"] == pytest.approx(4.5)
    assert jm["value"] == pytest.approx((200 + 450 + 8 * 300) / 1000)


# ------------------------------------------------------------------ contract and determinism
def test_outputs_validate_and_are_deterministic():
    harm = noisy_flat(0.03, seed=5)
    snpp = {y: 3 * harm[y] for y in YEARS if y >= 2012}
    first = build(harm, modis=harm, snpp=snpp)
    second = build(harm, modis=harm, snpp=snpp)
    for name in ("trend", "ruler"):
        text = json.dumps(first[name], sort_keys=True, allow_nan=False)
        assert text == json.dumps(second[name], sort_keys=True, allow_nan=False)
        assert [e.message for e in contract_validator(name).iter_errors(json.loads(text))] == []
        assert "{" not in first[name]["sentence"]


def test_null_bootstrap_year_round_trips_and_is_read_as_missing(tmp_path):
    """A year below the coverage threshold has a null replicate total: storable, and never a zero."""
    import pandas as pd

    from pipeline.common import io

    frame = pd.DataFrame({"replicate": [0, 0], "year": [2023, 2024],
                          "harmonized": pd.array([120.0, None], dtype="Float64")})
    path = tmp_path / "annual_bootstrap.parquet"
    io.write_parquet(frame, path, "annual_bootstrap")
    stored = io.read_parquet(path, "annual_bootstrap")
    assert stored["harmonized"].isna().tolist() == [False, True]
    assert bootstrap_replacer(stored)(np.random.default_rng(0)) == {2023: 120.0}
