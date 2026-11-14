"""fit_curve, bootstrap_curve, curve_points, binned, band_width_at on simulated points with known answers."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from scipy.special import expit

from pipeline.eyesight.fit import (CURVE_FRP, _nll_and_grad, band_width_at, binned, bootstrap_curve, curve,
                                   curve_points, fit_curve)

TRUE = (-2.0, 2.2, 0.88)


def simulate(n, a, b, c, seed, n_years=None):
    rng = np.random.default_rng(seed)
    x = np.log10(8.0 * np.exp(1.2 * rng.standard_normal(n)))  # FRP like the simulator: median 8 MW, sigma_ln 1.2
    y = (rng.random(n) < c * expit(a + b * x)).astype(int)
    df = pd.DataFrame({"x": x, "y": y})
    if n_years:
        df["year"] = 2013 + np.arange(n) % n_years
    return df


def test_gradient_matches_finite_differences():
    d = simulate(2000, *TRUE, seed=1)
    theta = np.array([-1.5, 1.8, 0.8])
    _, g = _nll_and_grad(theta, d["x"].to_numpy(), d["y"].to_numpy(float))
    eps = 1e-6
    for i in range(3):
        up, dn = theta.copy(), theta.copy()
        up[i] += eps
        dn[i] -= eps
        num = (_nll_and_grad(up, d["x"].to_numpy(), d["y"].to_numpy(float))[0]
               - _nll_and_grad(dn, d["x"].to_numpy(), d["y"].to_numpy(float))[0]) / (2 * eps)
        assert g[i] == pytest.approx(num, rel=1e-4, abs=1e-7)


def test_recovers_known_curve_from_200k_points():
    d = simulate(200_000, *TRUE, seed=42)
    f = fit_curve(d["x"], d["y"])
    assert f["converged"] and f["flag"] is None
    assert abs(f["a"] - TRUE[0]) < 0.15 and abs(f["b"] - TRUE[1]) < 0.15 and abs(f["c"] - TRUE[2]) < 0.02
    assert f["nll"] > 0 and f["n"] == 200_000


def test_ceiling_one_is_recovered():
    d = simulate(200_000, -2.0, 2.2, 1.0, seed=43)
    assert fit_curve(d["x"], d["y"])["c"] > 0.97


@pytest.mark.parametrize("value", [1, 0])
def test_constant_y_does_not_crash_and_is_flagged(value):
    x = np.linspace(-1, 3, 500)
    f = fit_curve(x, np.full(500, value))
    assert f["flag"] == "constant_y" and f["converged"] is False
    assert all(np.isfinite([f["a"], f["b"], f["c"], f["nll"]]))


@pytest.fixture(scope="module")
def boot_data():
    d = simulate(60_000, *TRUE, seed=44, n_years=10)
    full = fit_curve(d["x"], d["y"])
    draws = bootstrap_curve(d, B=60, seed=7, init=(full["a"], full["b"], full["c"]))
    return d, full, draws


def test_bootstrap_reproducible(boot_data):
    d, full, draws = boot_data
    again = bootstrap_curve(d, B=60, seed=7, init=(full["a"], full["b"], full["c"]))
    pd.testing.assert_frame_equal(draws, again)
    other = bootstrap_curve(d, B=5, seed=8, init=(full["a"], full["b"], full["c"]))
    assert not np.allclose(other["a"].to_numpy(), draws["a"].to_numpy()[:5])
    assert all(len(y) == 10 and set(y) <= set(range(2013, 2023)) for y in draws["years"])


def test_band_contains_true_curve(boot_data):
    _, full, draws = boot_data
    pts = {round(p["frp_mw"], 6): p for p in curve_points(full, draws)}
    assert len(pts) == 25 and CURVE_FRP[0] == 0.5 and CURVE_FRP[-1] == 2000.0
    lo, hi = np.percentile(curve(draws["a"].to_numpy()[:, None], draws["b"].to_numpy()[:, None],
                                 draws["c"].to_numpy()[:, None], np.log10([1.0, 10.0, 100.0])[None, :]),
                           [5, 95], axis=0)
    truth = curve(*TRUE, np.log10([1.0, 10.0, 100.0]))
    assert np.all(lo <= truth) and np.all(truth <= hi), (lo, truth, hi)
    for p in pts.values():
        assert p["lo"] <= p["p"] + 0.02 and p["p"] - 0.02 <= p["hi"]


def test_band_width_at_matches_curve_points(boot_data):
    _, _, draws = boot_data
    w = band_width_at(draws, 10.0)
    p = curve(draws["a"].to_numpy(), draws["b"].to_numpy(), draws["c"].to_numpy(), 1.0)
    assert w == pytest.approx(np.percentile(p, 95) - np.percentile(p, 5))
    assert 0 < w < 0.30


def test_binned_known_answer():
    x = np.repeat(np.arange(8, dtype=float), 10)
    y = np.repeat([0, 0, 0, 0, 1, 1, 1, 1], 10)
    b = binned(pd.DataFrame({"x": x, "y": y}))
    assert [r["n"] for r in b] == [10] * 8
    assert [r["p_obs"] for r in b] == [0.0] * 4 + [1.0] * 4
    assert b[0]["frp_mw"] == pytest.approx(10 ** ((0 + 0.875) / 2))


def test_binned_skips_empty_bins_on_ties():
    x = np.r_[np.full(50, -1.0), np.linspace(0, 2, 50)]  # half the points at the FRP floor
    b = binned(pd.DataFrame({"x": x, "y": np.r_[np.zeros(50), np.ones(50)]}))
    assert sum(r["n"] for r in b) == 100 and all(r["n"] > 0 for r in b)
