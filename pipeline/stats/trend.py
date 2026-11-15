"""trend.json and ruler.json (contracts 6.7, 6.8; science SD-09, SD-14, SD-15).

Inputs: daily.parquet (5.8), annual_bootstrap.parquet (5.9), naive_annual.parquet (5.11).
Annual totals come from pipeline.common.timebins (SD-08: coverage-scaled, missing below 90%).
Every year boundary is derived from science.yaml:
  record_start year .. snpp_first_day year - 1  -> naive MODIS years and the ruler's index base (2003-2011)
  snpp_first_day year                           -> naive S-NPP and "translated" variant start (2012)
  tier1.snpp_fit years                          -> jump-multiple years (2013-2022)
  aqua_trusted_through year                     -> last Aqua year; later years draw R3 replicates (2022)
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable, Sequence
from datetime import date
from typing import Any

import numpy as np
import pandas as pd
from scipy.stats import theilslopes

from pipeline.common import timebins
from pipeline.common.sentences import (
    Estimate,
    ruler_sentence,
    verdict_id,
    verdict_sentence,
)
from pipeline.stats.calendar import majority_kind, series_frame

JUMP_DEFINITION = ("Mean yearly S-NPP VIIRS hotspot count divided by mean yearly MODIS (Terra + Aqua) "
                   "hotspot count, same years, same place")
# Fixed per-estimate seed offsets, so each estimate's replicates do not depend on computation order.
SEED_OFFSETS = {"harmonized": 0, "naive": 1, "aqua_only_2003_2022": 2, "translated_from_2012": 3}


# ------------------------------------------------------------------ year boundaries from science.yaml
def boundaries(science: dict[str, Any]) -> dict[str, int]:
    eras = science["eras"]
    first_viirs = date.fromisoformat(eras["snpp_first_day"]).year
    fit = [date.fromisoformat(d).year for d in science["tier1"]["snpp_fit"]]
    return {
        "record_start": date.fromisoformat(eras["record_start"]).year,
        "first_viirs": first_viirs,
        "last_modis_naive": first_viirs - 1,
        "aqua_last": date.fromisoformat(eras["aqua_trusted_through"]).year,
        "jump_from": fit[0],
        "jump_to": fit[1],
        "trend_from": science["trend"]["years"][0],
        "trend_to": science["trend"]["years"][1],
    }


# ------------------------------------------------------------------ annual series
def annual_table(frame: pd.DataFrame) -> dict[int, dict[str, Any]]:
    """{year: value, lo, hi, kind} from a daily frame (local_day, value, lo, hi, kind, source) via timebins."""
    agg = timebins.aggregate(frame, "year", value_cols=("value", "lo", "hi"))
    covered = frame[frame["value"].notna()]
    kinds: dict[int, Counter[str]] = {}
    for d, k in zip(covered["local_day"], covered["kind"]):
        kinds.setdefault(d.year, Counter())[k] += 1
    out = {}
    for rec in agg.to_dict("records"):
        y = int(rec["year"])
        if bool(rec["missing"]):
            out[y] = {"value": None, "lo": None, "hi": None, "kind": "missing"}
        else:
            out[y] = {"value": float(rec["value"]), "lo": float(rec["lo"]), "hi": float(rec["hi"]),
                      "kind": majority_kind(kinds[y])}
    return out


def spliced_frame(daily: pd.DataFrame, first_year: int) -> pd.DataFrame:
    """aqua_raw before first_year, viirs_as_aqua from first_year (the 'translated_from_2012' variant)."""
    a, v = series_frame(daily, "aqua_raw"), series_frame(daily, "viirs_as_aqua")
    cut = date(first_year, 1, 1)
    return pd.concat([a[a["local_day"] < cut], v[v["local_day"] >= cut]], ignore_index=True)


def naive_annual_counts(naive: pd.DataFrame, science: dict[str, Any]) -> dict[int, dict[str, Any]]:
    """SD-09 naive count: MODIS through last_modis_naive, S-NPP after, each divided by its covered fraction.

    A year whose fraction is below timebins.year_min_covered_frac is missing (SD-08).
    """
    b = boundaries(science)
    min_frac = science["timebins"]["year_min_covered_frac"]
    out = {}
    for rec in naive.to_dict("records"):
        y = int(rec["year"])
        for name in ("modis", "snpp"):
            frac = rec[f"{name}_covered_frac"]
            count = rec[f"{name}_count"]
            ok = not (pd.isna(frac) or pd.isna(count)) and frac >= min_frac and frac > 0
            rec[name] = float(count) / float(frac) if ok else None
        source = "modis" if y <= b["last_modis_naive"] else "snpp"
        out[y] = {"modis": rec["modis"], "snpp": rec["snpp"], "source": source, "naive": rec[source]}
    return out


# ------------------------------------------------------------------ Theil-Sen percent per decade
def pct_per_decade(years: Sequence[float], values: Sequence[float]) -> float | None:
    """SD-14: 100 * 10 * Theil-Sen slope / median(values)."""
    if len(set(years)) < 2:
        return None
    med = float(np.median(values))
    if med == 0:
        return None
    return 100.0 * 10.0 * float(theilslopes(values, years).slope) / med


def estimate(series: dict[int, float | None], years: range, rng: np.random.Generator, n_boot: int,
             replace: Callable[[np.random.Generator], dict[int, float]] | None = None) -> Estimate:
    """Point estimate and 5th-95th percentile range over n_boot replicates.

    Each replicate resamples the non-missing years with replacement. When `replace` is given, it is
    called once per replicate and returns substitute values for some years (R3's bootstrap replicate
    of the translated years), so harmonization uncertainty is inside the range (SD-14).
    """
    ys = [y for y in years if series.get(y) is not None]
    if len(ys) < 3:
        return Estimate(None, None, None, "fewer than three valid annual observations")
    point = pct_per_decade(ys, [series[y] for y in ys])
    if point is None:
        return Estimate(None, None, None, "the median annual activity is zero")
    xs_all, vals_all = [], []
    for _ in range(n_boot):
        sub = replace(rng) if replace else {}
        pick = rng.integers(0, len(ys), len(ys))
        xs = [ys[i] for i in pick]
        xs_all.append(xs)
        vals_all.append([sub.get(x, series[x]) for x in xs])
    xs, vals = np.array(xs_all, dtype=float), np.array(vals_all, dtype=float)
    left, right = np.triu_indices(len(ys), 1)
    dx = xs[:, right] - xs[:, left]
    valid = np.any(dx != 0, axis=1) & (np.median(vals, axis=1) > 0)
    dx, xs, vals = dx[valid], xs[valid], vals[valid]
    with np.errstate(divide="ignore", invalid="ignore"):
        slopes = np.where(dx != 0, (vals[:, right] - vals[:, left]) / dx, np.nan)
        boot = 1000 * np.nanmedian(slopes, axis=1) / np.median(vals, axis=1)
    boot = boot[np.isfinite(boot)]
    if not len(boot):
        return Estimate(None, None, None, "no valid bootstrap comparisons")
    lo, hi = np.percentile(boot, [5, 95])
    return Estimate(point, float(lo), float(hi))


def bootstrap_replacer(annual_bootstrap: pd.DataFrame) -> Callable[[np.random.Generator], dict[int, float]]:
    """Pick one complete R3 replicate, including translated fills in Aqua-era years.

    One replicate per trend replicate keeps the year-to-year correlation of the k uncertainty.
    """
    ab = annual_bootstrap
    reps = {int(r): dict(zip(g["year"].astype(int), g["harmonized"].astype(float)))
            for r, g in ab.groupby("replicate")}
    ids = sorted(reps)
    if not ids:
        return lambda rng: {}
    return lambda rng: {y: v for y, v in reps[ids[int(rng.integers(0, len(ids)))]].items() if not np.isnan(v)}


# ------------------------------------------------------------------ documents
def _est(e: Estimate) -> dict[str, Any]:
    return {"pct_per_decade": e.pct_per_decade, "lo": e.lo, "hi": e.hi, "direction": e.direction,
            "availability": "available" if e.pct_per_decade is not None else "unavailable", "reason": e.reason}


def build_trend_files(daily: pd.DataFrame, annual_bootstrap: pd.DataFrame, naive_annual: pd.DataFrame,
                      region: str, region_name: str, science: dict[str, Any],
                      header: dict[str, Any], analysis_years=None) -> dict[str, dict[str, Any]]:
    b = boundaries(science)
    n_boot = science["trend"]["bootstrap_b"]
    seed = science.get("seed", 7)
    y0, y1 = analysis_years or (b["trend_from"], b["trend_to"])
    years = range(y0, y1 + 1)

    def rng(name: str) -> np.random.Generator:
        return np.random.default_rng([seed, SEED_OFFSETS[name]])

    harm = annual_table(series_frame(daily, "harmonized"))
    aqua = annual_table(series_frame(daily, "aqua_raw"))
    spliced = annual_table(spliced_frame(daily, b["first_viirs"]))
    naive = naive_annual_counts(naive_annual, science)

    def values(table: dict[int, dict[str, Any]], key: str = "value") -> dict[int, float | None]:
        return {y: table[y][key] for y in table}

    H = estimate(values(harm), years, rng("harmonized"), n_boot,
                 bootstrap_replacer(annual_bootstrap))
    N = estimate(values(naive, "naive"), years, rng("naive"), n_boot)
    variants = {
        "aqua_only_2003_2022": estimate(values(aqua), range(y0, min(y1, b["aqua_last"]) + 1),
                                        rng("aqua_only_2003_2022"), n_boot),
        "translated_from_2012": estimate(values(spliced), years, rng("translated_from_2012"), n_boot),
    }
    sid = verdict_id(H, N, [v.direction for v in variants.values()], science["trend"]["artifact_gap_points"])
    missing_variants = [name for name, value in variants.items() if value.pct_per_decade is None]
    if missing_variants:
        sid = "unclear"
    qualification = ("Robustness comparison unavailable for the selected years: " + ", ".join(missing_variants)
                     if missing_variants else "")

    annual_rows = []
    for y in years:
        h = harm.get(y, {"value": None, "lo": None, "hi": None, "kind": "missing"})
        nv = naive.get(y, {"naive": None, "source": "modis" if y <= b["last_modis_naive"] else "snpp"})
        annual_rows.append({"year": y, "harmonized": h["value"], "lo": h["lo"], "hi": h["hi"], "kind": h["kind"],
                            "naive_count": nv["naive"], "naive_source": nv["source"]})
    trend = {**header, "region": region, "years": [y0, y1], "annual": annual_rows,
             "harmonized": _est(H), "naive": _est(N),
             "robustness": [{"variant": k, **_est(v)} for k, v in variants.items()],
             "sentence_id": sid, "sentence": verdict_sentence(sid, H, N), "qualification": qualification}

    # ruler (SD-09)
    base = range(b["record_start"], b["last_modis_naive"] + 1)

    def base_mean(key: str) -> float | None:
        table, field = (harm, "value") if key == "harmonized" else (naive, "naive")
        vals = [table[y][field] for y in base if y in table and table[y][field] is not None]
        if not vals or sum(vals) == 0:
            return None
        return sum(vals) / len(vals)

    nb, hb = base_mean("naive_count"), base_mean("harmonized")
    jump_years = [y for y in range(b["jump_from"], b["jump_to"] + 1)
                  if y in naive and naive[y]["snpp"] is not None and naive[y]["modis"]]
    j = (sum(naive[y]["snpp"] for y in jump_years) / sum(naive[y]["modis"] for y in jump_years)
         if jump_years else None)
    ratios = [naive[y]["snpp"] / naive[y]["modis"] for y in jump_years]
    ruler = {**header, "region": region, "index_base_years": [base.start, base.stop - 1],
             "jump_multiple": {"value": j, "lo": min(ratios) if ratios else None,
                               "hi": max(ratios) if ratios else None,
                               "years": [b["jump_from"], b["jump_to"]], "definition": JUMP_DEFINITION},
             "rows": [{"year": r["year"],
                       "naive_index": None if r["naive_count"] is None or nb is None else r["naive_count"] / nb,
                       "harmonized_index": None if r["harmonized"] is None or hb is None else r["harmonized"] / hb,
                       "naive_source": r["naive_source"], "kind": r["kind"]} for r in annual_rows],
             "sentence": ruler_sentence(region_name, j) if j is not None else
                         "The sensor comparison is unavailable: no valid paired annual observations."}
    return {"trend": trend, "ruler": ruler}
