"""Tier 2 translation (SD-16, contracts 5.13): forward harmonized_t2, monthly k_T2, backward viirs_equiv_t2,
and the Tier 1 vs Tier 2 k comparison.

NOAA-20 days use the S-NPP-fitted curve (same instrument design); this assumption is logged by the stage.
"""

from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd

from .fit import curve

DAILY_COLUMNS = ["local_day", "series", "value", "lo", "hi", "kind", "source", "covered"]
BAND_Q = (5.0, 95.0)
NOAA20_NOTE = ("NOAA-20 days of harmonized_t2 use the curve fitted on S-NPP (same VIIRS instrument design); "
               "no NOAA-20-specific curve was fitted.")


def _as_date(v) -> date:
    return pd.Timestamp(str(v)).date()


def day_index(start: date, end: date) -> pd.DatetimeIndex:
    return pd.date_range(start, end, freq="D")


def g_per_draw(by_year: dict[int, tuple[int, int]], draws: pd.DataFrame) -> np.ndarray:
    """g recomputed on each draw's resampled years: sum of Aqua cell-days / sum of those also seen by S-NPP."""
    out = []
    for years in draws["years"]:
        tot = sum(by_year.get(int(y), (0, 0))[0] for y in years)
        mat = sum(by_year.get(int(y), (0, 0))[1] for y in years)
        out.append(tot / mat if mat else np.nan)
    return np.array(out, dtype=float)


def _with_nulls(values: np.ndarray, missing: np.ndarray) -> pd.arrays.FloatingArray:
    arr = pd.array(values.astype(float), dtype="Float64")
    arr[missing] = pd.NA
    return arr


def forward_t2(celldays: pd.DataFrame, coverage: pd.DataFrame, params: dict, g: float, draws: pd.DataFrame,
               g_draws: np.ndarray, snpp_through, record_start, last_day, frp_floor_mw: float,
               pass_: str = "D") -> pd.DataFrame:
    """harmonized_t2: g * sum of p(x) over the primary VIIRS sensor's fire cell-days of each day.
    Primary = S-NPP through snpp_through, NOAA-20 after. Missing (null) where that sensor is not covered."""
    start, end, through = _as_date(record_start), _as_date(last_day), _as_date(snpp_through)
    days = day_index(start, end)
    n_days = len(days)
    sensor = np.where(days.date <= through, "snpp", "noaa20")

    cov = coverage[coverage["sensor"].isin(["snpp", "noaa20"])]
    cov_key = pd.Series(cov["covered"].to_numpy(dtype=bool),
                        index=pd.MultiIndex.from_arrays([cov["sensor"].to_numpy(),
                                                         pd.to_datetime(cov["local_day"]).to_numpy()]))
    covered = cov_key.reindex(pd.MultiIndex.from_arrays([sensor, days.to_numpy()])).fillna(False).to_numpy(bool)

    cd = celldays[(celldays["daynight"] == pass_) & celldays["sensor"].isin(["snpp", "noaa20"])]
    di = ((pd.to_datetime(cd["local_day"]) - pd.Timestamp(start)).dt.days).to_numpy()
    inside = (di >= 0) & (di < n_days)
    cd, di = cd[inside], di[inside]
    is_primary = cd["sensor"].to_numpy() == sensor[di]
    cd, di = cd[is_primary], di[is_primary]
    x = np.log10(np.maximum(cd["frp_sum"].astype(float).fillna(0.0).to_numpy(), frp_floor_mw))

    value = g * np.bincount(di, weights=curve(params["a"], params["b"], params["c"], x), minlength=n_days)
    ok = draws["converged"].to_numpy(bool) & np.isfinite(g_draws)
    sims = np.empty((n_days, int(ok.sum())))
    for j, (a, b, c, gd) in enumerate(zip(draws["a"][ok], draws["b"][ok], draws["c"][ok], g_draws[ok])):
        sims[:, j] = gd * np.bincount(di, weights=curve(a, b, c, x), minlength=n_days)
    lo, hi = np.percentile(sims, BAND_Q, axis=1) if sims.shape[1] else (value, value)

    missing = ~covered
    return pd.DataFrame({
        "local_day": days.date, "series": "harmonized_t2",
        "value": _with_nulls(value, missing), "lo": _with_nulls(lo, missing), "hi": _with_nulls(hi, missing),
        "kind": np.where(missing, "missing", "harmonized"), "source": sensor, "covered": covered,
    })[DAILY_COLUMNS]


def k_t2_monthly(matched: pd.DataFrame, params: dict, g: float) -> pd.DataFrame:
    """k_T2,m = g * mean p over the fit-window matched rows of month m; lo/hi = 5th/95th percentile of the yearly
    k_T2,m,y (same pooled curve and g, rows of month m in year y)."""
    p = curve(params["a"], params["b"], params["c"], matched["x"].to_numpy(dtype=float))
    df = pd.DataFrame({"month": matched["month"].to_numpy(), "year": matched["year"].to_numpy(), "p": p})
    monthly = df.groupby("month")["p"].agg(["mean", "size"]).reindex(range(1, 13))
    yearly = df.groupby(["month", "year"])["p"].mean() * g
    rows = []
    for m in range(1, 13):
        ky = yearly.loc[m].to_numpy() if m in yearly.index.get_level_values(0) else np.array([])
        lo, hi = np.percentile(ky, BAND_Q) if ky.size else (np.nan, np.nan)
        n = monthly.loc[m, "size"]
        rows.append({"month": m, "k_t2": g * monthly.loc[m, "mean"] if n == n and n > 0 else np.nan,
                     "k_lo": lo, "k_hi": hi, "n": int(n) if n == n else 0, "n_years": int(ky.size)})
    return pd.DataFrame(rows)


def backward_t2(daily_r3: pd.DataFrame, kt2: pd.DataFrame, snpp_first_day, record_start, last_day
                ) -> pd.DataFrame:
    """viirs_equiv_t2: before snpp_first_day aqua_raw / k_T2,m (kind estimated; band from the yearly k_T2 range);
    from that day on, R3's viirs_raw as is (kind observed or missing)."""
    start, end, first = _as_date(record_start), _as_date(last_day), _as_date(snpp_first_day)
    days = day_index(start, end)

    def series(name: str) -> pd.DataFrame:
        s = daily_r3[daily_r3["series"] == name].copy()
        s.index = pd.to_datetime(s["local_day"])
        return s.reindex(days)

    aqua, viirs = series("aqua_raw"), series("viirs_raw")
    months = days.month.to_numpy()
    k = kt2.set_index("month").reindex(range(1, 13))
    k_m, k_lo, k_hi = (k[c].to_numpy(dtype=float)[months - 1] for c in ("k_t2", "k_lo", "k_hi"))

    before = days.date < first
    a_val = aqua["value"].astype("Float64").to_numpy(dtype=float, na_value=np.nan)
    with np.errstate(divide="ignore", invalid="ignore"):
        est, est_lo, est_hi = a_val / k_m, a_val / k_hi, a_val / k_lo  # larger k -> smaller VIIRS-equivalent
    v_val = viirs["value"].astype("Float64").to_numpy(dtype=float, na_value=np.nan)

    value = np.where(before, est, v_val)
    lo = np.where(before, est_lo, v_val)
    hi = np.where(before, est_hi, v_val)
    missing = ~np.isfinite(value)
    kind = np.where(missing, "missing", np.where(before, "estimated", "observed"))
    source = np.where(before, "aqua", viirs["source"].fillna("snpp").to_numpy(dtype=object))
    covered = np.where(before, aqua["covered"].fillna(False).to_numpy(bool),
                       viirs["covered"].fillna(False).to_numpy(bool)) & ~missing
    return pd.DataFrame({
        "local_day": days.date, "series": "viirs_equiv_t2", "value": _with_nulls(value, missing),
        "lo": _with_nulls(lo, missing), "hi": _with_nulls(hi, missing), "kind": kind, "source": source,
        "covered": covered.astype(bool),
    })[DAILY_COLUMNS]


def k_compare(calibration: dict, kt2: pd.DataFrame) -> list[dict]:
    """[{month, k_tier1 (R3's S-NPP monthly k), k_tier2}] for months 1-12; null where either is unavailable."""
    t1 = {int(r["month"]): r["k"] for r in calibration.get("k", {}).get("snpp", [])}
    t2 = dict(zip(kt2["month"].astype(int), kt2["k_t2"].astype(float)))
    out = []
    for m in range(1, 13):
        k2 = t2.get(m, np.nan)
        out.append({"month": m, "k_tier1": t1.get(m), "k_tier2": float(k2) if np.isfinite(k2) else None})
    return out
