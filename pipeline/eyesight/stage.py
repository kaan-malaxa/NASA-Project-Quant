"""Eyesight stage steps: match, fit, bootstrap, write curve.json and the figure (SD-16, contracts 5.12)."""

from __future__ import annotations

import logging
import time

import numpy as np
import pandas as pd

from . import compat
from .figures import eyesight_by_year_png, eyesight_curve_png, k_tier1_vs_tier2_png
from .fit import band_width_at, binned, bootstrap_curve, curve, curve_points, fit_curve
from .match import build_matched, g_factor
from .translate import NOAA20_NOTE, backward_t2, forward_t2, g_per_draw, k_compare, k_t2_monthly
from .validate import validate

MIN_MATCHED_ROWS = 2000
STATUS_DEFAULT = "exploratory"  # SD-17 decides validated/exploratory in D1
FRP_QUANTILES = (5, 25, 50, 75, 95)
# Geographic boxes (lat, lon) of Alaska (incl. the Aleutians across 180) and Hawaii. The usa region is the
# contiguous US, so no matched cell may fall in them (R4 role file, C1 and section 11).
OUTSIDE_CONUS = {
    "alaska": lambda lat, lon: (lat >= 51.0) & ((lon <= -129.0) | (lon >= 172.0)),
    "hawaii": lambda lat, lon: (lat >= 18.5) & (lat <= 22.5) & (lon >= -161.0) & (lon <= -154.5),
}


class RegionClipError(RuntimeError):
    """The matched table holds cells the region must not contain; do not fit (section 11)."""


def outside_conus_counts(matched: pd.DataFrame) -> dict[str, int]:
    """Matched rows whose cell centre lies in Alaska or Hawaii."""
    import h3

    cells = matched["h3_r6"].unique()
    if cells.size == 0:
        return {k: 0 for k in OUTSIDE_CONUS}
    ll = np.array([h3.cell_to_latlng(c) for c in cells]).reshape(-1, 2)
    per_cell = matched["h3_r6"].value_counts()
    out = {}
    for name, inside in OUTSIDE_CONUS.items():
        hit = cells[inside(ll[:, 0], ll[:, 1])]
        out[name] = int(per_cell.reindex(hit).sum()) if hit.size else 0
    return out


def year_summary(matched: pd.DataFrame) -> pd.DataFrame:
    """Matched rows and share with y = 1 per year."""
    return (matched.groupby("year").agg(n=("y", "size"), share_y1=("y", "mean")).reset_index())


def fits_by_year(matched: pd.DataFrame, init) -> list[dict]:
    out = []
    for year, grp in matched.groupby("year"):
        f = fit_curve(grp["x"], grp["y"], init=init)
        out.append({"year": int(year), "n": len(grp), **{k: f[k] for k in ("a", "b", "c", "converged", "flag")}})
    return out


def describe_before_fit(matched: pd.DataFrame, log: logging.Logger) -> list[int]:
    """Log per-year counts and y-share and FRP quantiles; return the years with < MIN_MATCHED_ROWS rows."""
    ys = year_summary(matched)
    for r in ys.itertuples():
        log.info("year %d: matched rows %d, share with y = 1 %.3f", r.year, r.n, r.share_y1)
    q = np.percentile(matched["frp_sum"].fillna(0).to_numpy(dtype=float), FRP_QUANTILES)
    log.info("S-NPP FRP per cell-day quantiles (MW): %s",
             ", ".join(f"p{p}={v:.2f}" for p, v in zip(FRP_QUANTILES, q)))
    thin = [int(y) for y in ys.loc[ys["n"] < MIN_MATCHED_ROWS, "year"]]
    if thin:
        log.warning("years with fewer than %d matched rows (kept, reported): %s", MIN_MATCHED_ROWS, thin)
    return thin


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
    t0 = time.time()
    matched, counts = build_matched(celldays, coverage, fit_start, fit_end, pass_=pass_,
                                    frp_floor_mw=float(t2["frp_floor_mw"]))
    n = len(matched)
    diag = {"n_matched": n, **counts, "seconds_match": time.time() - t0}

    outside = outside_conus_counts(matched)
    if region == "usa" and any(outside.values()):
        raise RegionClipError(f"usa matched table holds Alaska/Hawaii rows {outside}; fix the region clip (R2)")
    diag["outside_conus_rows"] = outside
    if n:
        diag["thin_years"] = describe_before_fit(matched, log)
    if n < MIN_MATCHED_ROWS:
        diag["reason"] = f"only {n} matched S-NPP cell-days (< {MIN_MATCHED_ROWS})"
        return absent_entry(region, n), diag

    t0 = time.time()
    params = fit_curve(matched["x"], matched["y"])
    diag["fit"] = params
    diag["seconds_fit"] = time.time() - t0
    if not params["converged"]:
        diag["reason"] = f"fit did not converge (flag={params['flag']})"
        return absent_entry(region, n), diag

    g = g_factor(counts)
    if g is None:
        diag["reason"] = "no Aqua cell-day was also seen by S-NPP; g undefined"
        return absent_entry(region, n), diag

    t0 = time.time()
    draws = bootstrap_curve(matched, B=int(t2["bootstrap_b"]), seed=int(science.get("seed", 7)),
                            init=(params["a"], params["b"], params["c"]))
    diag["seconds_bootstrap"] = time.time() - t0
    diag["bootstrap_b"] = int(t2["bootstrap_b"])
    diag["by_year"] = fits_by_year(matched, init=(params["a"], params["b"], params["c"]))
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
                 "bootstrap_converged": f"{len(ok)}/{len(draws)}",
                 "_matched": matched, "_draws": draws, "_params": params, "_counts": counts})
    return entry, diag


def translate(region: str, entry: dict, diag: dict, celldays: pd.DataFrame, coverage: pd.DataFrame,
              science: dict, pass_: str, log: logging.Logger) -> pd.DataFrame:
    """C2: forward harmonized_t2, monthly k_T2, backward viirs_equiv_t2 and k_compare (R3 inputs when present)."""
    eras, t2 = science["eras"], science["tier2"]
    record_start = eras.get("record_start", "2003-01-01")
    last_day = max(pd.to_datetime(coverage["local_day"])).date()
    params, draws, matched = diag["_params"], diag["_draws"], diag["_matched"]

    g_draws = g_per_draw(diag["_counts"]["by_year"], draws)
    log.info("NOAA-20 assumption: %s", NOAA20_NOTE)
    t0 = time.time()
    fwd = forward_t2(celldays, coverage, params, entry["g"], draws, g_draws, eras["snpp_through"], record_start,
                     last_day, float(t2["frp_floor_mw"]), pass_)
    diag["seconds_forward"] = time.time() - t0
    kt2 = k_t2_monthly(matched, params, entry["g"])
    diag["k_t2"] = kt2
    parts = [fwd]

    daily_path = compat.harmonized_daily_path(region)
    if daily_path.exists():
        parts.append(backward_t2(compat.read_parquet(daily_path, "daily"), kt2, eras["snpp_first_day"],
                                 record_start, last_day))
    else:
        log.warning("R3 input %s missing: viirs_equiv_t2 not written (needs aqua_raw and viirs_raw)", daily_path)

    cal_path = compat.calibration_path(region)
    if cal_path.exists():
        entry["k_compare"] = k_compare(compat.read_json(cal_path), kt2)
    else:
        log.warning("R3 input %s missing: k_compare left empty, no k_tier1_vs_tier2.png", cal_path)
    daily = pd.concat(parts, ignore_index=True)
    compat.write_parquet(daily, compat.daily_t2_path(region), "daily_t2")
    return daily


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
    if entry["status"] != "absent":
        diag["daily_t2"] = translate(region, entry, diag, celldays, coverage, science, pass_, log)
        daily_path, t1_path = compat.harmonized_daily_path(region), compat.validation_t1_path(region)
        daily_r3 = compat.read_parquet(daily_path, "daily") if daily_path.exists() else None
        validation_t1 = compat.read_json(t1_path) if t1_path.exists() else None
        if validation_t1 is None:
            log.warning("R3 input %s missing: the SD-17 Tier 1 WAPE condition cannot be evaluated", t1_path)
        rows, status, conds = validate(region, entry, diag, celldays, coverage, science, pass_, log, daily_r3,
                                       validation_t1)
        entry["status"] = status
        diag.update({"validation_rows": rows, "sd17": conds})
        compat.write_json({"validation": rows}, compat.validation_t2_path(region))
    compat.write_json(entry, out / "curve.json")
    if entry["status"] == "absent":
        log.warning("status absent: %s", diag["reason"])
    else:
        eyesight_curve_png(entry, out / "figures" / "eyesight_curve.png")
        eyesight_by_year_png(entry, diag["by_year"], out / "figures" / "eyesight_by_year.png")
        if entry["k_compare"]:
            k_tier1_vs_tier2_png(entry, out / "figures" / "k_tier1_vs_tier2.png")
    return entry, diag
