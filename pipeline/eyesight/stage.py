"""Eyesight stage steps: match, fit, bootstrap, write curve.json and the figure (SD-16, contracts 5.12)."""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from . import compat
from .figures import eyesight_curve_png
from .fit import band_width_at, binned, bootstrap_curve, curve, curve_points, fit_curve
from .match import build_matched, g_factor

MIN_MATCHED_ROWS = 2000
STATUS_DEFAULT = "exploratory"  # SD-17 decides validated/exploratory in D1


def reliability_err(params: dict, matched: pd.DataFrame) -> float:
    """|sum of fitted p - observed Aqua co-detections| / observed."""
    p = curve(params["a"], params["b"], params["c"], matched["x"].to_numpy(dtype=float))
    observed = float(matched["y"].sum())
    return abs(float(p.sum()) - observed) / observed if observed > 0 else float("inf")


def absent_entry(region: str, n: int) -> dict:
    params = {k: None for k in ("a", "b", "c", "a_lo", "a_hi", "b_lo", "b_hi", "c_lo", "c_hi")}
    return {"region": region, "status": "absent", "params": params, "g": None, "n_celldays": n, "curve": [],
            "binned": [], "k_compare": []}


def fit_entry(region: str, celldays: pd.DataFrame, coverage: pd.DataFrame, science: dict, pass_: str,
              log: logging.Logger) -> tuple[dict, dict]:
    """Return (curve.json entry, diagnostics). Diagnostics are logged, never written into the JSON."""
    t2 = science["tier2"]
    fit_start, fit_end = (str(v) for v in t2["fit"])
    matched, counts = build_matched(celldays, coverage, fit_start, fit_end, pass_=pass_,
                                    frp_floor_mw=float(t2["frp_floor_mw"]))
    n = len(matched)
    diag = {"n_matched": n, **counts}
    if n < MIN_MATCHED_ROWS:
        diag["reason"] = f"only {n} matched S-NPP cell-days (< {MIN_MATCHED_ROWS})"
        return absent_entry(region, n), diag

    params = fit_curve(matched["x"], matched["y"])
    diag["fit"] = params
    if not params["converged"]:
        diag["reason"] = f"fit did not converge (flag={params['flag']})"
        return absent_entry(region, n), diag

    g = g_factor(counts)
    if g is None:
        diag["reason"] = "no Aqua cell-day was also seen by S-NPP; g undefined"
        return absent_entry(region, n), diag

    draws = bootstrap_curve(matched, B=int(t2["bootstrap_b"]), seed=int(science.get("seed", 7)),
                            init=(params["a"], params["b"], params["c"]))
    ok = draws[draws["converged"]]
    lo_hi = {}
    for k in ("a", "b", "c"):
        lo, hi = np.percentile(ok[k].to_numpy(), [5, 95])
        lo_hi[f"{k}_lo"], lo_hi[f"{k}_hi"] = float(lo), float(hi)

    entry = {
        "region": region,
        "status": STATUS_DEFAULT,
        "params": {"a": params["a"], "b": params["b"], "c": params["c"], **lo_hi},
        "g": g,
        "n_celldays": n,
        "curve": curve_points(params, draws),
        "binned": binned(matched),
        "k_compare": [],
    }
    diag.update({"g": g, "reliability_err": reliability_err(params, matched),
                 "band_width_at_10mw": band_width_at(draws, 10.0),
                 "bootstrap_converged": f"{len(ok)}/{len(draws)}"})
    return entry, diag


def run(region: str, pass_: str, log: logging.Logger) -> tuple[dict, dict]:
    science, from_yaml = compat.science()
    if not from_yaml:
        log.warning("science.yaml not found; using the contracts section 4.2 copy in pipeline/eyesight/compat.py")
    cd_path, cov_path = compat.celldays_path(region), compat.coverage_path(region)
    for p in (cd_path, cov_path):
        if not p.exists():
            raise FileNotFoundError(f"missing input {p} (run ingest first)")
    celldays = compat.read_parquet(cd_path, "celldays")
    coverage = compat.read_parquet(cov_path, "coverage")

    entry, diag = fit_entry(region, celldays, coverage, science, pass_, log)
    out = compat.eyesight_dir(region)
    compat.write_json(entry, out / "curve.json")
    if entry["status"] == "absent":
        log.warning("status absent: %s", diag["reason"])
    else:
        eyesight_curve_png(entry, out / "figures" / "eyesight_curve.png")
    return entry, diag
