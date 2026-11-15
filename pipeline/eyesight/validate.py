"""Tier 2 validation (SD-17, V6, V8) and the mechanical status decision.

For each held-out year Y of the fit window, the curve and g are refitted without Y and used to predict Y.
Training and test years never mix. The neighbour-match sensitivity is reported, never used.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from . import compat
from .fit import curve, fit_curve
from .match import build_matched, g_factor
from .translate import NOAA20_NOTE, k_t2_monthly


# ------------------------------------------------------------------ leave-one-year-out refits
def loyo_fits(matched: pd.DataFrame, by_year: dict[int, tuple[int, int]], init) -> dict[int, dict]:
    """Refit curve and g without each year. Returns {year: {params, g, n_used, years_used}}."""
    years = sorted(int(y) for y in matched["year"].unique())
    yr = matched["year"].to_numpy()
    out = {}
    for y in years:
        train = yr != y
        f = fit_curve(matched["x"].to_numpy()[train], matched["y"].to_numpy()[train], init=init)
        tot = sum(t for yy, (t, _) in by_year.items() if yy != y)
        mat = sum(m for yy, (_, m) in by_year.items() if yy != y)
        out[y] = {"params": f, "g": tot / mat if mat else np.nan, "n_used": int(train.sum()),
                  "years_used": sorted({int(v) for v in yr[train]})}
    return out


def reliability_heldout(matched: pd.DataFrame, fits: dict[int, dict]) -> tuple[float, float, int]:
    """Return the locked pooled reliability, per-year absolute diagnostic, and sample count."""
    abs_sum, total_p, total_y = 0.0, 0.0, 0.0
    for y, f in fits.items():
        rows = matched[matched["year"] == y]
        p = f["params"]
        sp = float(curve(p["a"], p["b"], p["c"], rows["x"].to_numpy(dtype=float)).sum())
        sy = float(rows["y"].sum())
        abs_sum += abs(sp - sy)
        total_p += sp
        total_y += sy
    if not total_y:
        return float("inf"), float("inf"), len(matched)
    return abs(total_p - total_y) / total_y, abs_sum / total_y, len(matched)


# ------------------------------------------------------------------ daily and weekly series
def daily_observed(celldays: pd.DataFrame, coverage: pd.DataFrame, fit_start: str, fit_end: str, pass_: str,
                   daily_r3: pd.DataFrame | None) -> pd.DataFrame:
    """One row per day of the fit window: aqua_obs and snpp_obs fire cell-days, null unless both sensors are
    covered. From R3's aqua_raw / snpp_raw when given, else counted from the cell-days (same definition)."""
    days = pd.date_range(fit_start, fit_end, freq="D")
    cov = coverage[coverage["sensor"].isin(["aqua", "snpp"])].copy()
    cov["d"] = pd.to_datetime(cov["local_day"])
    both = cov[cov["covered"]].groupby("d")["sensor"].nunique().reindex(days, fill_value=0).to_numpy() == 2
    if daily_r3 is not None:
        r3 = daily_r3.assign(d=pd.to_datetime(daily_r3["local_day"]))
        get = {s: r3[r3["series"] == f"{s}_raw"].set_index("d")["value"].astype(float).reindex(days).to_numpy()
               for s in ("aqua", "snpp")}
    else:
        cd = celldays[(celldays["daynight"] == pass_) & celldays["sensor"].isin(["aqua", "snpp"])]
        counts = cd.assign(d=pd.to_datetime(cd["local_day"])).groupby(["sensor", "d"]).size()
        get = {s: counts.get(s, pd.Series(dtype=float)).reindex(days, fill_value=0).to_numpy(dtype=float)
               for s in ("aqua", "snpp")}
    aqua = np.where(both, get["aqua"], np.nan)
    snpp = np.where(both, get["snpp"], np.nan)
    return pd.DataFrame({"local_day": days.date, "aqua_obs": aqua, "snpp_obs": snpp})


def heldout_predictions(daily: pd.DataFrame, matched: pd.DataFrame, fits: dict[int, dict]) -> pd.DataFrame:
    """For each day of held-out year Y, predictions from the fit without Y:
    pred_aqua = g_-Y * sum of p_-Y over that day's S-NPP cell-days (forward);
    pred_snpp = aqua_obs / k_T2,month,-Y (backcast; k_T2 from training years only)."""
    d = daily.copy()
    ts = pd.to_datetime(d["local_day"])
    d["year"], d["month"] = ts.dt.year.to_numpy(), ts.dt.month.to_numpy()
    d["pred_aqua"], d["pred_snpp"] = np.nan, np.nan
    m_day = pd.to_datetime(matched["local_day"])
    for y, f in fits.items():
        p = f["params"]
        rows = matched[matched["year"] == y]
        p_rows = curve(p["a"], p["b"], p["c"], rows["x"].to_numpy(dtype=float))
        per_day = pd.Series(p_rows, index=m_day[matched["year"] == y]).groupby(level=0).sum() * f["g"]
        sel = d["year"] == y
        d.loc[sel, "pred_aqua"] = per_day.reindex(ts[sel]).fillna(0.0).to_numpy()
        kt2 = k_t2_monthly(matched[matched["year"] != y], p, f["g"]).set_index("month")["k_t2"]
        d.loc[sel, "pred_snpp"] = d.loc[sel, "aqua_obs"] / kt2.reindex(d.loc[sel, "month"]).to_numpy()
    covered = d["aqua_obs"].notna()
    d.loc[~covered, ["pred_aqua", "pred_snpp"]] = np.nan
    return d


def weekly_wape(daily: pd.DataFrame, pred: str, obs: str) -> tuple[float | None, int]:
    """WAPE = sum |pred - obs| / sum obs over weeks where both are present (SD-08 weekly values)."""
    w = compat.aggregate_weekly(daily[["local_day", pred, obs]], [pred, obs])
    w = w[w[pred].notna() & w[obs].notna()]
    denom = float(w[obs].sum())
    if len(w) == 0 or denom == 0:
        return None, len(w)
    return float(np.abs(w[pred] - w[obs]).sum()) / denom, len(w)


def t1_t2_weekly_wape(daily_t2: pd.DataFrame, daily_r3: pd.DataFrame, fit_start: str, fit_end: str
                      ) -> tuple[float | None, int]:
    """Weekly WAPE between harmonized_t2 and R3's viirs_as_aqua over the fit window (Tier 1 as reference)."""
    days = pd.date_range(fit_start, fit_end, freq="D")

    def s(df, name):
        x = df[df["series"] == name].assign(d=pd.to_datetime(df.loc[df["series"] == name, "local_day"]))
        return x.set_index("d")["value"].astype(float).reindex(days).to_numpy()

    t2, t1 = s(daily_t2, "harmonized_t2"), s(daily_r3, "viirs_as_aqua")
    both = np.isfinite(t2) & np.isfinite(t1)
    df = pd.DataFrame({"local_day": days.date, "t2": np.where(both, t2, np.nan), "t1": np.where(both, t1, np.nan)})
    return weekly_wape(df, "t2", "t1")


def matching_heldout_wape(tier1: pd.DataFrame, tier2: pd.DataFrame):
    """Compare matching excluded-year predictions, never fits trained on the evaluated year."""
    keys = ["year", "week", "excluded_year"]
    for table in (tier1, tier2):
        if table.duplicated(keys).any() or not table["year"].eq(table["excluded_year"]).all():
            raise ValueError("Held-out predictions have duplicate keys or a mismatched excluded year")
    paired = tier1.merge(tier2, on=keys, validate="one_to_one")
    valid = paired[["tier1", "pred_aqua"]].notna().all(axis=1)
    paired = paired.loc[valid]
    denominator = float(paired.tier1.sum())
    return (float(abs(paired.pred_aqua - paired.tier1).sum()) / denominator if denominator else None,
            len(paired))


# ------------------------------------------------------------------ SD-17
def tier1_loyo_wape(validation_t1: dict | None, region: str) -> float | None:
    if not validation_t1:
        return None
    for r in validation_t1.get("validation", []):
        if r.get("test") == "loyo_weekly_wape" and r.get("method") == "tier1" and r.get("region", region) == region:
            return r.get("value")
    return None


def sd17_status(params: dict, band_10: float, reliability: float, wape_t2: float | None, wape_t1: float | None,
                tier2: dict) -> tuple[str, list[dict]]:
    """Apply SD-17 mechanically. A condition that cannot be evaluated counts as not met."""
    max_ratio = float(tier2["max_wape_ratio_vs_t1"])
    conds = [
        {"condition": "fit converged with b > 0", "passed": bool(params["converged"] and params["b"] > 0),
         "detail": f"converged={params['converged']}, b={params['b']:.3f}"},
        {"condition": f"band width of p at 10 MW < {tier2['max_band_at_10mw']}",
         "passed": bool(band_10 < float(tier2["max_band_at_10mw"])), "detail": f"{band_10:.3f}"},
        {"condition": f"held-out reliability error < {tier2['max_reliability_err']}",
         "passed": bool(reliability < float(tier2["max_reliability_err"])), "detail": f"{reliability:.4f}"},
    ]
    if wape_t2 is None or wape_t1 is None:
        conds.append({"condition": f"Tier 2 LOYO weekly WAPE <= {max_ratio} x Tier 1", "passed": False,
                      "detail": "not evaluated: " + ("Tier 1 loyo_weekly_wape unavailable (R3 validation_t1.json)"
                                                     if wape_t1 is None else "Tier 2 WAPE unavailable")})
    else:
        conds.append({"condition": f"Tier 2 LOYO weekly WAPE <= {max_ratio} x Tier 1",
                      "passed": bool(wape_t2 <= max_ratio * wape_t1),
                      "detail": f"T2 {wape_t2:.4f} vs {max_ratio} x T1 {wape_t1:.4f} = {max_ratio * wape_t1:.4f}"})
    return ("validated" if all(c["passed"] for c in conds) else "exploratory"), conds


# ------------------------------------------------------------------ neighbour sensitivity
def neighbour_note(celldays, coverage, fit_start, fit_end, pass_, floor, params, g, kt2) -> str:
    """Refit with neighbour matching; report the change in c and in k_T2 (reported, never used)."""
    m_nb, c_nb = build_matched(celldays, coverage, fit_start, fit_end, pass_=pass_, neighbour=True,
                               frp_floor_mw=floor)
    f_nb = fit_curve(m_nb["x"], m_nb["y"], init=(params["a"], params["b"], params["c"]))
    g_nb = g_factor(c_nb) or float("nan")
    k_nb = k_t2_monthly(m_nb, f_nb, g_nb)["k_t2"].to_numpy(dtype=float)
    k_same = kt2["k_t2"].to_numpy(dtype=float)
    dk = k_nb - k_same
    return (f"Neighbour-match sensitivity (reported, not used): c {params['c']:.3f} -> {f_nb['c']:.3f} "
            f"(change {f_nb['c'] - params['c']:+.3f}); mean monthly k_T2 {np.nanmean(k_same):.3f} -> "
            f"{np.nanmean(k_nb):.3f} (change {np.nanmean(dk):+.3f}, largest monthly change {dk[np.nanargmax(np.abs(dk))]:+.3f}); "
            f"g kept same-cell ({g:.3f}).")


# ------------------------------------------------------------------ assembly
def row(region, test, value, n, years, note="", method="tier2") -> dict:
    return {"region": region, "test": test, "method": method, "value": value, "n": n, "years": years,
            "note": note}


def validate(region: str, entry: dict, diag: dict, celldays: pd.DataFrame, coverage: pd.DataFrame,
             science: dict, pass_: str, log: logging.Logger, daily_r3: pd.DataFrame | None,
             validation_t1: dict | None) -> tuple[list[dict], str, list[dict]]:
    t2 = science["tier2"]
    fit_start, fit_end = (str(v) for v in t2["fit"])
    years = [int(fit_start[:4]), int(fit_end[:4])]
    params, matched, counts = diag["_params"], diag["_matched"], diag["_counts"]
    floor = float(t2["frp_floor_mw"])

    fits = loyo_fits(matched, counts["by_year"], init=(params["a"], params["b"], params["c"]))
    rel, rel_by_year, n_rel = reliability_heldout(matched, fits)
    daily = heldout_predictions(daily_observed(celldays, coverage, fit_start, fit_end, pass_, daily_r3),
                                matched, fits)
    source_note = "aqua_raw/snpp_raw from R3 daily.parquet" if daily_r3 is not None else \
        "aqua_raw/snpp_raw counted from celldays (R3 daily.parquet missing)"
    loyo, n_loyo = weekly_wape(daily, "pred_aqua", "aqua_obs")
    back, n_back = weekly_wape(daily, "pred_snpp", "snpp_obs")
    from pipeline.common import io, paths, timebins

    heldout = timebins.aggregate(daily[["local_day", "aqua_obs", "pred_aqua"]], "week",
                                 value_cols=("aqua_obs", "pred_aqua"))
    heldout = heldout[["year", "week", "aqua_obs", "pred_aqua"]].copy()
    heldout["excluded_year"] = heldout["year"]
    io.write_parquet(heldout, paths.heldout_predictions(region, "eyesight"), "heldout_weekly_t2")
    io.write_json({str(year): {"training_years": fit["years_used"]} for year, fit in fits.items()},
                  paths.eyesight_dir(region) / "folds.json")
    t1_path = paths.heldout_predictions(region, "harmonize")
    if t1_path.is_file():
        t1_predictions = io.read_parquet(t1_path, "heldout_weekly_t1")
        t1t2, n_t1t2 = matching_heldout_wape(t1_predictions, heldout)
        pairs = t1_predictions.merge(heldout, on=["year", "week", "excluded_year"], validate="one_to_one")
        entry["heldout_compare"] = [{"year": int(row.year), "week": int(row.week),
                                     "excluded_year": int(row.excluded_year), "observed": float(row.aqua_obs),
                                     "tier1": float(row.tier1), "tier2": float(row.pred_aqua), "kind": "harmonized"}
                                    for row in pairs.dropna(subset=["tier1", "pred_aqua", "aqua_obs"]).itertuples()]
        t1t2_note = "Tier 1 vs Tier 2 predictions from matching excluded-year folds, weekly"
    else:
        entry["heldout_compare"] = []
        t1t2, n_t1t2, t1t2_note = None, 0, "not computed: R3 daily.parquet (viirs_as_aqua) missing"
    nb = neighbour_note(celldays, coverage, fit_start, fit_end, pass_, floor, params, entry["g"], diag["k_t2"])

    rows = [
        row(region, "reliability_err", rel, n_rel, years,
            f"Locked pooled |sum p - sum observed| / sum observed across held-out years. {nb}"),
        row(region, "reliability_year_absolute_err", rel_by_year, n_rel, years,
            "Diagnostic: sum of absolute yearly prediction errors / total observed; does not cancel across years."),
        row(region, "loyo_weekly_wape", loyo, n_loyo, years, f"{NOAA20_NOTE} {source_note}."),
        row(region, "backcast_weekly_wape", back, n_back, years, source_note + "."),
        row(region, "t1_t2_wape", t1t2, n_t1t2, years, t1t2_note + "."),
    ]
    wape_t1 = tier1_loyo_wape(validation_t1, region)
    status, conds = sd17_status(params, diag["band_width_at_10mw"], rel, loyo, wape_t1, t2)
    diag.update({"loyo_fits": fits, "validation_daily": daily, "wape_t1": wape_t1})
    return rows, status, conds
