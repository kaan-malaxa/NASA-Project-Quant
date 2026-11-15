"""truth.json: planted parameters and expected answers (R4 section 9.5, prompt A2).

Every expected value is computed here from the simulator's own detection tables, with code that is independent
of pipeline.ingest / harmonize / eyesight / stats. The detection tables are the exact rows written to the CSVs
(rounded numbers, confidence, type), so the expected values are what a correct pipeline should recover:
SD-02 filters, SD-04 res-6 daytime fire cell-days, bbox membership by cell centre, SD-06 k, SD-16 g and the
binned cell-day detection rate, SD-14 Theil-Sen trend. Coverage is the planted coverage (sensor up and not in a
planted outage).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import compat
from . import planted as P
from .sensors import covered_mask, observe_fires
from .write_firms import modis_confidence

N_BINS = 8
MIN_WEEKS_BETWEEN_PEAKS = 8
N20_MIN_DAYS_IN_YEAR = 300
COMPONENT_REF_CONF = 60

# Tolerances from R4 section 9.5.
TOL = {"k_annual_snpp": 0.03, "k_annual_noaa20": 0.04, "k_month_snpp_max_abs_err": 0.08, "g": 0.03,
       "reliability_err": 0.05, "trend_pct_per_decade": 5.0, "peak_week": 1, "aqua_outage_days_missing": 0,
       "static_rows_surviving": 0, "binned_rate": 0.04}


# ---------------------------------------------------------------- season, outages
def weekly_fire_totals(fires: pd.DataFrame) -> pd.Series:
    """Total fires per week of year (timebins rule), all years pooled."""
    days = pd.Series(fires["day"].to_numpy().astype("datetime64[D]"))
    counts = days.value_counts()
    weeks = np.array([compat.week_of_year(pd.Timestamp(d).date()) for d in counts.index])
    return pd.Series(counts.to_numpy(), index=weeks).groupby(level=0).sum().reindex(range(1, 53), fill_value=0)


def peak_weeks(fires: pd.DataFrame) -> tuple[int, int, float, float]:
    """Main peak week, second peak week (at least 8 weeks away, circular) and their shares of all fires."""
    w = weekly_fire_totals(fires)
    main = int(w.idxmax())
    dist = np.abs(w.index.to_numpy() - main)
    dist = np.minimum(dist, 52 - dist)
    second = int(w[dist >= MIN_WEEKS_BETWEEN_PEAKS].idxmax())
    total = float(w.sum())
    return main, second, float(w[main]) / total, float(w[second]) / total


def outage_days(sensor: str) -> list[str]:
    out = []
    for o in P.OUTAGES:
        if o["sensor"] == sensor:
            d = np.arange(np.datetime64(o["start"], "D"), np.datetime64(o["end"], "D") + np.timedelta64(1, "D"))
            out.extend(np.datetime_as_string(d, unit="D").tolist())
    return out


# ---------------------------------------------------------------- cell-days
def detections_from_rows(det: pd.DataFrame, rows: pd.DataFrame) -> pd.DataFrame:
    """Join the internal detections (sorted, aligned) with what was written to the CSV."""
    assert len(det) == len(rows)
    return pd.DataFrame({
        "sensor": det["sensor"].to_numpy(), "local_day": det["local_day"].to_numpy().astype("datetime64[D]"),
        "daynight": rows["daynight"].to_numpy(), "lat": rows["latitude"].astype(float).to_numpy(),
        "lon": rows["longitude"].astype(float).to_numpy(), "frp": rows["frp"].astype(float).to_numpy(),
        "confidence": rows["confidence"].to_numpy(), "type": rows["type"].to_numpy(),
        "static": det["static"].to_numpy(dtype=bool),
    })


def static_cell_check(det: pd.DataFrame, points: pd.DataFrame, bbox, science: dict, mask_res: int = 8,
                      min_static: int = 3, dilate: int = 1) -> dict:
    """Expected cell-days in the res-6 cells of the static points after SD-02 and SD-18, all sensors and passes.

    Fires land in those cells too, so the right answer is not 0: it is the count a correct pipeline produces.
    Standard rows keep type 0 only; rows without type are dropped when their res-8 cell is in the static mask
    (res-8 cells with >= 3 standard detections of type 1, 2 or 3, dilated by one ring). Also returns how many
    true static detections survive the rules (information: 0 means the spec removes them all)."""
    import h3

    f = science["filters"]
    west, south, east, north = bbox
    d = det[det["lon"].between(west, east) & det["lat"].between(south, north)]
    r8 = np.array([h3.latlng_to_cell(a, b, mask_res) for a, b in zip(d["lat"], d["lon"])], dtype=object)
    counts = pd.Series(r8[d["type"].isin(["1", "2", "3"]).to_numpy()]).value_counts()
    seeds = counts[counts >= min_static].index
    mask = set().union(*[h3.grid_disk(c, dilate) for c in seeds]) if len(seeds) else set()

    is_modis = d["sensor"].isin(["aqua", "terra"]).to_numpy()
    conf = d["confidence"].astype(str).to_numpy().astype(str)
    conf_ok = np.where(is_modis, pd.to_numeric(pd.Series(conf), errors="coerce").fillna(-1).to_numpy()
                       >= f["modis_min_confidence"], np.isin(np.char.lower(conf).astype("<U1"), f["viirs_keep"]))
    typ = d["type"].to_numpy()
    keep = conf_ok & ((typ == "0") | ((typ == "") & ~np.isin(r8, list(mask))))
    k = d[keep]
    res = int(science["grid"]["count_res"])
    cells = np.array([h3.latlng_to_cell(a, b, res) for a, b in zip(k["lat"], k["lon"])], dtype=object)
    centre = {c: h3.cell_to_latlng(c) for c in pd.unique(cells)}
    inside = np.array([south <= centre[c][0] <= north and west <= centre[c][1] <= east for c in cells], dtype=bool)
    static_cells = {h3.latlng_to_cell(p.lat, p.lon, res) for p in points.itertuples()}
    in_static = inside & np.isin(cells, list(static_cells))
    cd = pd.DataFrame({"sensor": k["sensor"].to_numpy()[in_static], "day": k["local_day"].to_numpy()[in_static],
                       "dn": k["daynight"].to_numpy()[in_static], "cell": cells[in_static]}).drop_duplicates()
    return {"celldays_in_static_cells": len(cd),
            "static_detections_surviving": int((k["static"].to_numpy() & inside).sum()),
            "static_cells_r6": sorted(static_cells)}


def reference_aqua(fires: pd.DataFrame, seed: int) -> pd.DataFrame:
    """Undrifted, outage-free Aqua detections, formatted the way the MODIS file would be."""
    det = observe_fires(fires, "aqua_ref", "D", seed)
    rng = np.random.default_rng([seed, COMPONENT_REF_CONF])
    frp = np.round(det["frp"].to_numpy(), 1)
    return pd.DataFrame({
        "sensor": "aqua_ref", "local_day": det["local_day"].to_numpy().astype("datetime64[D]"), "daynight": "D",
        "lat": np.round(det["lat"].to_numpy(), 4), "lon": np.round(det["lon"].to_numpy(), 4), "frp": frp,
        "confidence": modis_confidence(frp, rng.normal(0.0, P.MODIS_CONF["noise_sd"], len(det))).astype(str),
        "type": "0", "static": False,
    })


def passes_filters(d: pd.DataFrame, bbox, science: dict) -> np.ndarray:
    """SD-02 for standard rows (type column present) plus the daytime pass (SD-01)."""
    west, south, east, north = bbox
    f = science["filters"]
    is_modis = d["sensor"].isin(["aqua", "terra", "aqua_ref"]).to_numpy()
    conf = d["confidence"].astype(str).to_numpy()
    modis_ok = np.zeros(len(d), dtype=bool)
    modis_ok[is_modis] = conf[is_modis].astype(int) >= f["modis_min_confidence"]
    viirs_ok = ~is_modis & np.isin(np.char.lower(conf.astype(str)).astype("<U1"), f["viirs_keep"])
    return ((d["daynight"].to_numpy() == "D") & (d["type"].to_numpy() == "0")
            & d["lon"].between(west, east).to_numpy() & d["lat"].between(south, north).to_numpy()
            & (modis_ok | viirs_ok))


def celldays(d: pd.DataFrame, bbox, science: dict) -> pd.DataFrame:
    """Daytime fire cell-days at the counting resolution: sensor, local_day, cell, n_det, frp_sum."""
    import h3  # truth only; the simulator itself never uses H3

    res = int(science["grid"]["count_res"])
    d = d[passes_filters(d, bbox, science)]
    cells = np.array([h3.latlng_to_cell(la, lo, res) for la, lo in zip(d["lat"].to_numpy(), d["lon"].to_numpy())],
                     dtype=object)
    uniq = pd.unique(cells)
    centres = np.array([h3.cell_to_latlng(c) for c in uniq]).reshape(-1, 2)
    west, south, east, north = bbox
    inside = dict(zip(uniq, (centres[:, 0] >= south) & (centres[:, 0] <= north)
                      & (centres[:, 1] >= west) & (centres[:, 1] <= east)))
    keep = np.array([inside[c] for c in cells], dtype=bool)
    g = pd.DataFrame({"sensor": d["sensor"].to_numpy()[keep], "local_day": d["local_day"].to_numpy()[keep],
                      "cell": cells[keep], "frp": d["frp"].to_numpy()[keep]})
    out = g.groupby(["sensor", "local_day", "cell"], sort=True).agg(n_det=("frp", "size"), frp_sum=("frp", "sum"))
    return out.reset_index()


# ---------------------------------------------------------------- the quantities
def _days(start: str, end: str) -> np.ndarray:
    return np.arange(np.datetime64(start, "D"), np.datetime64(end, "D") + np.timedelta64(1, "D"))


def both_covered_days(a: str, b: str, start: str, end: str) -> np.ndarray:
    days = _days(start, end)
    return days[covered_mask(a, days) & covered_mask(b, days)]


def _on_days(cd: pd.DataFrame, sensor: str, days: np.ndarray) -> pd.DataFrame:
    sub = cd[cd["sensor"] == sensor]
    return sub[np.isin(sub["local_day"].to_numpy().astype("datetime64[D]"), days)]


def k_factors(cd: pd.DataFrame, sensor: str, days: np.ndarray, n0: float) -> dict:
    """SD-06: k_ann = sum A / sum V; k_m = (A_m + n0 k_ann) / (V_m + n0)."""
    a = _on_days(cd, "aqua", days)
    v = _on_days(cd, sensor, days)
    a_m = pd.to_datetime(a["local_day"]).dt.month.value_counts().reindex(range(1, 13), fill_value=0)
    v_m = pd.to_datetime(v["local_day"]).dt.month.value_counts().reindex(range(1, 13), fill_value=0)
    k_ann = float(a_m.sum()) / float(v_m.sum())
    months = [{"month": m, "k": (float(a_m[m]) + n0 * k_ann) / (float(v_m[m]) + n0),
               "aqua_celldays": int(a_m[m]), "viirs_celldays": int(v_m[m])} for m in range(1, 13)]
    return {"k_annual": k_ann, "monthly": months, "n_days": int(days.size)}


def g_and_matched(cd: pd.DataFrame, days: np.ndarray, floor_mw: float) -> tuple[float, pd.DataFrame]:
    """SD-16: g = Aqua cell-days / Aqua cell-days also seen by S-NPP; matched S-NPP cell-days with x and y."""
    a = _on_days(cd, "aqua", days)
    s = _on_days(cd, "snpp", days)
    a_keys = set(zip(a["local_day"].to_numpy().astype("datetime64[D]").tolist(), a["cell"]))
    s_keys = list(zip(s["local_day"].to_numpy().astype("datetime64[D]").tolist(), s["cell"]))
    y = np.array([k in a_keys for k in s_keys], dtype=int)
    n_both = int(y.sum())
    g = len(a_keys) / n_both
    x = np.log10(np.maximum(s["frp_sum"].to_numpy(dtype=float), floor_mw))
    return g, pd.DataFrame({"x": x, "y": y})


def binned_rates(matched: pd.DataFrame, n_bins: int = N_BINS) -> list[dict]:
    """Quantile bins of x; frp_mw is the geometric centre of the bin (10 ** mid-point of its x edges)."""
    x, y = matched["x"].to_numpy(), matched["y"].to_numpy()
    edges = np.quantile(x, np.linspace(0.0, 1.0, n_bins + 1))
    idx = np.clip(np.searchsorted(edges[1:-1], x, side="right"), 0, n_bins - 1)
    out = []
    for b in range(n_bins):
        sel = idx == b
        out.append({"frp_mw": float(10 ** ((edges[b] + edges[b + 1]) / 2)), "frp_lo": float(10 ** edges[b]),
                    "frp_hi": float(10 ** edges[b + 1]), "p_true": float(y[sel].mean()), "n": int(sel.sum()),
                    "tolerance": TOL["binned_rate"]})
    return out


def theil_sen_pct_per_decade(years: np.ndarray, values: np.ndarray) -> float:
    """SD-14: 100 * 10 * median pairwise slope / median value."""
    i, j = np.triu_indices(len(years), k=1)
    slope = float(np.median((values[j] - values[i]) / (years[j] - years[i])))
    return 100.0 * 10.0 * slope / float(np.median(values))


def aqua_scale_annual(cd: pd.DataFrame, science: dict) -> pd.DataFrame:
    """True Aqua-scale annual cell-days: observed Aqua (coverage-scaled, SD-08) through aqua_trusted_through,
    then the undrifted reference Aqua."""
    y0, y1 = (int(v) for v in science["trend"]["years"])
    trusted_year = int(str(science["eras"]["aqua_trusted_through"])[:4])
    rows = []
    for year in range(y0, y1 + 1):
        days = _days(f"{year}-01-01", f"{year}-12-31")
        sensor = "aqua" if year <= trusted_year else "aqua_ref"
        covered = days[covered_mask(sensor, days)] if sensor == "aqua" else days
        n = len(_on_days(cd, sensor, covered))
        rows.append({"year": year, "value": n * days.size / covered.size, "source": sensor,
                     "covered_days": int(covered.size)})
    return pd.DataFrame(rows)


def n20_first_full_year(noaa20_days: np.ndarray) -> int:
    """First calendar year with NOAA-20 detections on >= 300 distinct days (SD-06)."""
    years = pd.Series(pd.to_datetime(pd.unique(noaa20_days))).dt.year.value_counts().sort_index()
    return int(years[years >= N20_MIN_DAYS_IN_YEAR].index.min())


# ---------------------------------------------------------------- assembly
def build_truth(seed: int, size: str, bbox, fires: pd.DataFrame, points: pd.DataFrame,
                written: dict[str, tuple[pd.DataFrame, pd.DataFrame]], counts: dict) -> dict:
    """written: file key -> (sorted internal detections, formatted rows), aligned row by row."""
    science, _ = compat.science()
    det = pd.concat([detections_from_rows(d, r) for d, r in written.values()]
                    + [reference_aqua(fires, seed)], ignore_index=True)
    cd = celldays(det[det["sensor"] != "terra"], bbox, science)
    sm = science.get("static_mask", {"min_static_detections": 3, "dilate_rings": 1})
    static = static_cell_check(det[det["sensor"] != "aqua_ref"], points, bbox, science,
                               mask_res=int(science["grid"].get("mask_res", 8)),
                               min_static=int(sm["min_static_detections"]), dilate=int(sm["dilate_rings"]))

    t1 = science["tier1"]
    snpp_fit = [str(v) for v in t1["snpp_fit"]]
    k_snpp = k_factors(cd, "snpp", both_covered_days("aqua", "snpp", *snpp_fit), float(t1["n0"]))

    n20_days = det.loc[det["sensor"] == "noaa20", "local_day"].to_numpy()
    n20_year = n20_first_full_year(n20_days)
    n20_fit = [f"{n20_year}-01-01", snpp_fit[1]]
    n20_years = int(snpp_fit[1][:4]) - n20_year + 1
    k_n20 = k_factors(cd, "noaa20", both_covered_days("aqua", "noaa20", *n20_fit), float(t1["n0"]))

    t2 = science["tier2"]
    t2_fit = [str(v) for v in t2["fit"]]
    g, matched = g_and_matched(cd, both_covered_days("aqua", "snpp", *t2_fit), float(t2["frp_floor_mw"]))

    annual = aqua_scale_annual(cd, science)
    trend = theil_sen_pct_per_decade(annual["year"].to_numpy(float), annual["value"].to_numpy(float))

    main, second, share_main, share_second = peak_weeks(fires)
    aqua_out = outage_days("aqua")

    def entry(q, truth, tol, source_file, path, **extra):
        return {"quantity": q, "truth": truth, "tolerance": tol, "source_file": source_file, "path": path, **extra}

    return {
        "seed": seed,
        "size": size,
        "planted": {
            "curve": dict(P.AQUA_CURVE),
            "trend_pct_per_decade_fires": 100.0 * 10 * P.TREND_PER_YEAR,
            "season": {"peak_weeks": list(P.SEASON_PEAK_WEEKS), "weights": list(P.SEASON_WEIGHTS)},
            "outages": [dict(o) for o in P.OUTAGES],
            "outage_days": {"aqua": aqua_out},
            "static_sources": P.N_STATIC,
            "static_points": [{"lat": float(r.lat), "lon": float(r.lon)} for r in points.itertuples()],
            "aqua_drift_from": P.AQUA_DRIFT_FROM,
            "noaa20_first_full_year": P.NOAA20_FIRST_FULL_YEAR,
            "expected_noaa20_method": P.EXPECTED_NOAA20_METHOD,
        },
        "expected": [
            entry("k_annual_snpp", k_snpp["k_annual"], TOL["k_annual_snpp"], "calibration.json",
                  "k_annual.snpp.k", fit_window=snpp_fit),
            entry("k_annual_noaa20", k_n20["k_annual"], TOL["k_annual_noaa20"], "calibration.json",
                  "k_annual.noaa20.k", fit_window=n20_fit),
            entry("k_month_snpp_max_abs_err", 0.0, TOL["k_month_snpp_max_abs_err"], "calibration.json",
                  "k.snpp[*].k", truth_by_month=[{"month": m["month"], "k": m["k"]} for m in k_snpp["monthly"]]),
            entry("g", g, TOL["g"], "curve.json", "g", fit_window=t2_fit),
            entry("reliability_err", 0.0, TOL["reliability_err"], "validation_t2.json", "reliability_err"),
            entry("trend_pct_per_decade", trend, TOL["trend_pct_per_decade"], "trend.json",
                  "harmonized.pct_per_decade"),
            entry("peak_week_main", main, TOL["peak_week"], "season.json", "windows[0].peak_week",
                  share=share_main),
            entry("peak_week_second", second, TOL["peak_week"], "season.json", "windows[1].peak_week",
                  share=share_second),
            entry("aqua_outage_days_missing", len(aqua_out), TOL["aqua_outage_days_missing"], "coverage.parquet",
                  "aqua covered=false in outage"),
            entry("static_rows_surviving", static["celldays_in_static_cells"], TOL["static_rows_surviving"],
                  "celldays.parquet",
                  "count of cell-days (all sensors and passes) in static_cells_r6; fires land there too, so the "
                  "truth is the SD-02 + SD-18 count, and any static leak raises it",
                  static_cells_r6=static["static_cells_r6"],
                  static_detections_surviving_spec=static["static_detections_surviving"]),
        ],
        "binned_rates": binned_rates(matched),
        "k_monthly": {"snpp": k_snpp["monthly"], "noaa20": k_n20["monthly"]},
        "noaa20": {"first_full_year": n20_year, "fit_years": n20_years,
                   "method": "direct" if n20_years >= int(t1["n20_min_fit_years"]) else "chained"},
        "aqua_scale_annual": annual.to_dict(orient="records"),
        "matched_celldays": len(matched),
        "counts": counts,
        "world": {"start": P.WORLD_START, "end": P.WORLD_END, "n_fires": len(fires)},
    }
