"""Validation and the SD-17 decision on fabricated data generated from the model itself."""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest
from test_stage import _fabricated_region

from pipeline.eyesight.__main__ import main
from pipeline.eyesight.compat import write_parquet
from pipeline.eyesight.fit import fit_curve
from pipeline.eyesight.match import build_matched
from pipeline.eyesight.validate import loyo_fits, sd17_status, weekly_wape

TIER2 = {"max_band_at_10mw": 0.30, "max_reliability_err": 0.05, "max_wape_ratio_vs_t1": 1.10}
ROW_KEYS = {"region", "test", "method", "value", "n", "years", "note"}
CORRUPT_YEAR = 2017


def _run(tmp_path, corrupt: bool, t1_wape: float | None = 1.0):
    cd, cov = _fabricated_region(2000, seed=11)
    if corrupt:  # Aqua saw nothing in one year: y = 0 for every S-NPP cell-day of that year
        cd = cd[~((cd["sensor"] == "aqua") & (pd.to_datetime(cd["local_day"]).dt.year == CORRUPT_YEAR))]
    grid = tmp_path / "grid" / "fab"
    write_parquet(cd, grid / "celldays.parquet", "celldays")
    write_parquet(cov, grid / "coverage.parquet", "coverage")
    if t1_wape is not None:
        harm = tmp_path / "harmonized" / "fab"
        harm.mkdir(parents=True, exist_ok=True)
        (harm / "validation_t1.json").write_text(json.dumps({"validation": [
            {"region": "fab", "test": "loyo_weekly_wape", "method": "tier1", "value": t1_wape, "n": 520,
             "years": [2013, 2022], "note": ""}]}), encoding="utf-8")
    assert main(["--region", "fab", "--data-root", str(tmp_path)]) == 0
    out = tmp_path / "eyesight" / "fab"
    entry = json.loads((out / "curve.json").read_text(encoding="utf-8"))
    rows = {r["test"]: r for r in json.loads((out / "validation_t2.json").read_text(encoding="utf-8"))["validation"]}
    return entry, rows


@pytest.fixture(scope="module")
def clean(tmp_path_factory):
    return _run(tmp_path_factory.mktemp("clean"), corrupt=False)


def test_model_data_is_validated(clean):
    entry, rows = clean
    assert entry["status"] == "validated"
    assert set(rows) == {"reliability_err", "reliability_year_absolute_err", "loyo_weekly_wape", "backcast_weekly_wape", "t1_t2_wape"}
    assert all(set(r) == ROW_KEYS and r["method"] == "tier2" and r["years"] == [2013, 2022] for r in rows.values())
    assert rows["reliability_err"]["value"] < 0.05
    assert "Neighbour-match sensitivity (reported, not used)" in rows["reliability_err"]["note"]
    assert "NOAA-20" in rows["loyo_weekly_wape"]["note"]
    assert rows["t1_t2_wape"]["value"] is None and "missing" in rows["t1_t2_wape"]["note"]
    assert 0 < rows["loyo_weekly_wape"]["value"] < 1 and 0 < rows["backcast_weekly_wape"]["value"] < 1


def test_corrupt_year_is_visible_in_absolute_diagnostic_even_when_pooled_error_cancels(tmp_path, clean):
    _, clean_rows = clean
    entry, rows = _run(tmp_path, corrupt=True)
    assert rows["reliability_year_absolute_err"]["value"] > clean_rows["reliability_year_absolute_err"]["value"]
    assert rows["reliability_year_absolute_err"]["value"] > 0.05
    assert rows["reliability_err"]["value"] < 0.05
    assert entry["status"] == "validated"  # locked pooled criterion; diagnostic is reported, never substituted


def test_missing_tier1_validation_keeps_exploratory(tmp_path):
    entry, _ = _run(tmp_path, corrupt=False, t1_wape=None)
    assert entry["status"] == "exploratory"


def test_heldout_year_is_excluded_from_its_refit():
    cd, cov = _fabricated_region(600, seed=5)
    m, counts = build_matched(cd, cov, "2013-01-01", "2022-12-31", frp_floor_mw=0.1)
    init = (-2.0, 2.2, 0.88)
    fits = loyo_fits(m, counts["by_year"], init)
    n_year = m["year"].value_counts()
    for y, f in fits.items():
        assert y not in f["years_used"] and f["n_used"] == len(m) - n_year[y]
    # Scrambling the held-out year's y leaves the fit without that year unchanged.
    m2 = m.copy()
    sel = m2["year"] == CORRUPT_YEAR
    m2.loc[sel, "y"] = 1 - m2.loc[sel, "y"]
    f2 = loyo_fits(m2, counts["by_year"], init)[CORRUPT_YEAR]["params"]
    f1 = fits[CORRUPT_YEAR]["params"]
    assert (f2["a"], f2["b"], f2["c"]) == (f1["a"], f1["b"], f1["c"])
    assert fits[2013]["params"]["a"] != pytest.approx(fit_curve(m2["x"], m2["y"], init=init)["a"], abs=1e-9)


def test_sd17_conditions():
    good = {"converged": True, "b": 2.0}
    assert sd17_status(good, 0.1, 0.01, 0.30, 0.30, TIER2)[0] == "validated"
    assert sd17_status(good, 0.1, 0.01, 0.33, 0.30, TIER2)[0] == "validated"  # 0.33 <= 1.10 x 0.30
    status, conds = sd17_status(good, 0.1, 0.01, 0.34, 0.30, TIER2)
    assert status == "exploratory" and [c["passed"] for c in conds] == [True, True, True, False]
    assert sd17_status({"converged": True, "b": -0.1}, 0.1, 0.01, 0.3, 0.3, TIER2)[0] == "exploratory"
    assert sd17_status(good, 0.31, 0.01, 0.3, 0.3, TIER2)[0] == "exploratory"
    assert sd17_status(good, 0.1, 0.06, 0.3, 0.3, TIER2)[0] == "exploratory"
    status, conds = sd17_status(good, 0.1, 0.01, 0.3, None, TIER2)
    assert status == "exploratory" and "not evaluated" in conds[3]["detail"]


def test_weekly_wape_known_answer():
    days = pd.date_range("2015-01-01", "2015-01-14").date  # weeks 1 and 2, 7 days each
    d = pd.DataFrame({"local_day": days, "pred": [2.0] * 7 + [1.0] * 7, "obs": [1.0] * 14})
    wape, n = weekly_wape(d, "pred", "obs")
    assert n == 2 and wape == pytest.approx((7 + 0) / 14)
    d.loc[10:13, ["pred", "obs"]] = np.nan  # week 2 has only 3 covered days -> missing, excluded
    wape, n = weekly_wape(d, "pred", "obs")
    assert n == 1 and wape == pytest.approx(1.0)


def test_reliability_per_year_does_not_cancel():
    from pipeline.eyesight.validate import reliability_heldout

    m = pd.DataFrame({"year": [2013] * 4 + [2014] * 4, "x": [1.0] * 8, "y": [1, 1, 0, 0, 1, 1, 0, 0]})
    p_half = {"a": 0.0, "b": 0.0, "c": 1.0}  # p = 0.5 everywhere
    p_high = {"a": 50.0, "b": 0.0, "c": 0.75}  # p = 0.75 everywhere
    p_low = {"a": -50.0, "b": 0.0, "c": 0.05}  # p ~ 0
    pooled, per_year, n = reliability_heldout(m, {2013: {"params": p_half}, 2014: {"params": p_half}})
    assert per_year == pytest.approx(0.0) and pooled == pytest.approx(0.0) and n == 8
    # 2013 over-predicted by 1, 2014 under-predicted by 2: pooled = |1 - 2| / 4, per-year = (1 + 2) / 4
    pooled, per_year, _ = reliability_heldout(m, {2013: {"params": p_high}, 2014: {"params": p_low}})
    assert pooled == pytest.approx(1 / 4) and per_year == pytest.approx(3 / 4)


def test_matching_predictions_reject_training_year_leak_and_duplicates():
    from pipeline.eyesight.validate import matching_heldout_wape
    t1 = pd.DataFrame({"year": [2013, 2014], "week": [1, 1], "excluded_year": [2013, 2014],
                       "tier1": [10., 20.]})
    t2 = pd.DataFrame({"year": [2013, 2014], "week": [1, 1], "excluded_year": [2013, 2014],
                       "pred_aqua": [12., 18.]})
    assert matching_heldout_wape(t1, t2) == (pytest.approx(4 / 30), 2)
    t2.loc[0, "excluded_year"] = 2014
    with pytest.raises(ValueError, match="excluded year"):
        matching_heldout_wape(t1, t2)
    with pytest.raises(ValueError, match="duplicate"):
        matching_heldout_wape(pd.concat([t1, t1]), t1)
