"""Three-parameter eyesight curve p(x) = c * expit(a + b x), maximum likelihood, year-block bootstrap (SD-16)."""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.special import expit

BOUNDS = [(-15.0, 15.0), (-5.0, 15.0), (0.05, 1.0)]  # a, b, c
P_CLIP = (1e-9, 1.0 - 1e-9)
C_START = 0.9
N_STARTS = 3
CURVE_FRP = np.geomspace(0.5, 2000.0, 25)
BAND_Q = (5.0, 95.0)


def curve(a: float, b: float, c: float, x: np.ndarray) -> np.ndarray:
    return c * expit(a + b * np.asarray(x, dtype=float))


def _nll_and_grad(theta: np.ndarray, x: np.ndarray, y: np.ndarray) -> tuple[float, np.ndarray]:
    """Mean Bernoulli negative log-likelihood and its gradient (mean keeps L-BFGS-B well scaled)."""
    a, b, c = theta
    s = expit(a + b * x)
    p = np.clip(c * s, *P_CLIP)
    nll = -np.mean(y * np.log(p) + (1.0 - y) * np.log1p(-p))
    dl_dp = -(y / p - (1.0 - y) / (1.0 - p))
    ds = s * (1.0 - s)
    grad = np.array([np.mean(dl_dp * c * ds), np.mean(dl_dp * c * ds * x), np.mean(dl_dp * s)])
    return float(nll), grad


def _logistic_guess(x: np.ndarray, y: np.ndarray, c: float = C_START) -> tuple[float, float]:
    """Logistic-regression-like start: weighted line through logit(binned rate / c) against binned x."""
    edges = np.unique(np.quantile(x, np.linspace(0, 1, 11)))
    if edges.size < 3:
        return 0.0, 1.0
    idx = np.clip(np.searchsorted(edges[1:-1], x, side="right"), 0, edges.size - 2)
    n = np.bincount(idx, minlength=edges.size - 1).astype(float)
    k = np.bincount(idx, weights=y, minlength=edges.size - 1)
    ok = n > 0
    xm = np.bincount(idx, weights=x, minlength=edges.size - 1)[ok] / n[ok]
    rate = np.clip((k[ok] + 0.5) / (n[ok] + 1.0) / c, 0.02, 0.98)
    if xm.size < 2 or np.ptp(xm) == 0:
        return 0.0, 1.0
    b, a = np.polyfit(xm, np.log(rate / (1 - rate)), 1, w=np.sqrt(n[ok]))
    return float(np.clip(a, *BOUNDS[0])), float(np.clip(b, *BOUNDS[1]))


def fit_curve(x, y, init: tuple[float, float, float] | None = None, n_starts: int = N_STARTS) -> dict:
    """Maximum-likelihood fit. Returns a, b, c, nll (total), converged, flag (None or a reason string)."""
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    if init is None:
        a0, b0 = _logistic_guess(x, y)
        init = (a0, b0, C_START)
    a0, b0, c0 = init
    starts = [(a0, b0, c0), (a0 - 1.0, b0 * 1.5 + 0.5, 0.7), (a0 + 1.0, b0 * 0.7, 0.99)][:max(1, n_starts)]

    best = None
    for s in starts:
        s = np.array([np.clip(v, lo, hi) for v, (lo, hi) in zip(s, BOUNDS)])
        res = minimize(_nll_and_grad, s, args=(x, y), jac=True, method="L-BFGS-B", bounds=BOUNDS)
        if best is None or res.fun < best.fun:
            best = res

    a, b, c = (float(v) for v in best.x)
    flag = None
    converged = bool(best.success)
    if y.size == 0 or np.all(y == y[0]):
        flag, converged = "constant_y", False  # no information about the shape; never usable
    elif any(np.isclose(v, lo) or np.isclose(v, hi) for v, (lo, hi) in zip((a, b), BOUNDS[:2])):
        flag = "at_bound"
    return {"a": a, "b": b, "c": c, "nll": float(best.fun) * max(y.size, 1), "converged": converged,
            "flag": flag, "n": int(y.size)}


def bootstrap_curve(matched: pd.DataFrame, B: int, seed: int, init: tuple[float, float, float] | None = None
                    ) -> pd.DataFrame:
    """Year-block bootstrap: resample whole years with replacement, refit. One row per draw: a, b, c,
    converged, years (the resampled years, so g can be redrawn on the same years later)."""
    years = np.array(sorted(matched["year"].unique()))
    x_all = matched["x"].to_numpy(dtype=float)
    y_all = matched["y"].to_numpy(dtype=float)
    yr = matched["year"].to_numpy()
    rows_by_year = {int(v): np.flatnonzero(yr == v) for v in years}
    if init is None:
        full = fit_curve(x_all, y_all)
        init = (full["a"], full["b"], full["c"])

    rng = np.random.default_rng(seed)
    out = []
    for draw in range(B):
        pick = rng.choice(years, size=years.size, replace=True)
        idx = np.concatenate([rows_by_year[int(v)] for v in pick])
        # Warm start from the full-sample fit; one start is enough for a resample of the same data.
        f = fit_curve(x_all[idx], y_all[idx], init=init, n_starts=1)
        out.append({"draw": draw, "a": f["a"], "b": f["b"], "c": f["c"], "converged": f["converged"],
                    "years": [int(v) for v in pick]})
    return pd.DataFrame(out)


def _draw_matrix(draws: pd.DataFrame, x: np.ndarray) -> np.ndarray:
    d = draws[draws["converged"]] if "converged" in draws else draws
    return curve(d["a"].to_numpy()[:, None], d["b"].to_numpy()[:, None], d["c"].to_numpy()[:, None], x[None, :])


def curve_points(params: dict, draws: pd.DataFrame) -> list[dict]:
    """25 log-spaced FRP values from 0.5 to 2000 MW: fitted p and the 5th/95th percentile band of the draws."""
    x = np.log10(CURVE_FRP)
    p = curve(params["a"], params["b"], params["c"], x)
    lo, hi = np.percentile(_draw_matrix(draws, x), BAND_Q, axis=0)
    return [{"frp_mw": float(f), "p": float(pi), "lo": float(l), "hi": float(h)}
            for f, pi, l, h in zip(CURVE_FRP, p, lo, hi)]


def binned(matched: pd.DataFrame, n_bins: int = 8) -> list[dict]:
    """Quantile bins of x. frp_mw = geometric centre of the bin (10 ** mid-point of its x edges). Empty bins
    (possible when many x values tie, e.g. at the FRP floor) are left out."""
    x = matched["x"].to_numpy(dtype=float)
    y = matched["y"].to_numpy(dtype=float)
    if x.size == 0:
        return []
    edges = np.quantile(x, np.linspace(0.0, 1.0, n_bins + 1))
    idx = np.clip(np.searchsorted(edges[1:-1], x, side="right"), 0, n_bins - 1)
    out = []
    for b in range(n_bins):
        sel = idx == b
        if sel.any():
            out.append({"frp_mw": float(10 ** ((edges[b] + edges[b + 1]) / 2)), "p_obs": float(y[sel].mean()),
                        "n": int(sel.sum())})
    return out


def band_width_at(draws: pd.DataFrame, frp_mw: float = 10.0) -> float:
    """Width (95th - 5th percentile) of the bootstrap band of p at one FRP value."""
    lo, hi = np.percentile(_draw_matrix(draws, np.array([np.log10(frp_mw)]))[:, 0], BAND_Q)
    return float(hi - lo)
