"""Planted-truth checks on synthland (V7). Skipped when synthland cell-days or truth.json are missing.

Only tests read truth.json; the eyesight code never does.
"""

from __future__ import annotations

import json

import pytest

from pipeline.eyesight import compat
from pipeline.eyesight.fit import binned, fit_curve
from pipeline.eyesight.match import build_matched, g_factor
from pipeline.eyesight.stage import reliability_err

REGION = "synthland"
MAX_RELIABILITY_ERR = 0.03  # B3 prompt: within 3 %


@pytest.fixture(scope="module")
def planted():
    cd_path, cov_path = compat.celldays_path(REGION), compat.coverage_path(REGION)
    truth_path = compat.raw_dir(REGION) / "truth.json"
    missing = [str(p) for p in (cd_path, cov_path, truth_path) if not p.exists()]
    if missing:
        pytest.skip(f"synthland inputs missing: {missing}")
    science, _ = compat.science()
    t2 = science["tier2"]
    matched, counts = build_matched(compat.read_parquet(cd_path, "celldays"),
                                    compat.read_parquet(cov_path, "coverage"), *(str(v) for v in t2["fit"]),
                                    frp_floor_mw=float(t2["frp_floor_mw"]))
    truth = json.loads(truth_path.read_text(encoding="utf-8"))
    return matched, counts, truth


def test_planted_truth_reliability(planted):
    matched, _, _ = planted
    params = fit_curve(matched["x"], matched["y"])
    assert params["converged"]
    assert reliability_err(params, matched) < MAX_RELIABILITY_ERR


def test_planted_truth_binned_rates(planted):
    matched, _, truth = planted
    ours = binned(matched, n_bins=len(truth["binned_rates"]))
    assert len(ours) == len(truth["binned_rates"])
    for got, want in zip(ours, truth["binned_rates"]):
        assert got["frp_mw"] == pytest.approx(want["frp_mw"], rel=0.05)
        assert abs(got["p_obs"] - want["p_true"]) <= want["tolerance"], (got, want)


def test_planted_truth_g(planted):
    _, counts, truth = planted
    want = next(e for e in truth["expected"] if e["quantity"] == "g")
    assert abs(g_factor(counts) - want["truth"]) <= want["tolerance"]


def test_planted_truth_static_cells(planted):
    _, _, truth = planted
    want = next(e for e in truth["expected"] if e["quantity"] == "static_rows_surviving")
    cd = compat.read_parquet(compat.celldays_path(REGION), "celldays")
    got = int(cd["h3_r6"].isin(want["static_cells_r6"]).sum())
    assert abs(got - want["truth"]) <= want["tolerance"], (got, want["truth"])
