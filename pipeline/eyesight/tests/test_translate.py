"""Tier 2 translation on fabricated inputs with known answers."""

from __future__ import annotations

import json
from datetime import date

import numpy as np
import pandas as pd
import pytest
from fabricate import cell, celldays, coverage

from pipeline.eyesight.compat import read_parquet, write_parquet
from pipeline.eyesight.fit import curve
from pipeline.eyesight.translate import (DAILY_COLUMNS, backward_t2, forward_t2, g_per_draw, k_compare,
                                         k_t2_monthly)

PARAMS = {"a": -2.0, "b": 2.2, "c": 0.88}
G = 1.25
C1, C2, C3 = cell(10.5, 10.5), cell(10.5, 11.5), cell(11.5, 10.5)


def _draws(n=20, jitter=0.0, seed=0):
    rng = np.random.default_rng(seed)
    return pd.DataFrame({"a": PARAMS["a"] + jitter * rng.standard_normal(n), "b": PARAMS["b"],
                         "c": PARAMS["c"], "converged": True, "years": [[2015]] * n})


def _forward(rows, cov, draws=None, g_draws=None, through="2025-12-31", start="2025-12-29", end="2026-01-02"):
    draws = _draws() if draws is None else draws
    g_draws = np.full(len(draws), G) if g_draws is None else g_draws
    return forward_t2(celldays(rows), cov, PARAMS, G, draws, g_draws, through, start, end, 0.1)


def test_equal_frp_forward_is_exact():
    rows = [("snpp", "2025-12-30", C1, 10.0), ("snpp", "2025-12-30", C2, 10.0), ("snpp", "2025-12-30", C3, 10.0),
            ("snpp", "2025-12-31", C1, 10.0)]
    cov = coverage("2025-12-29", "2026-01-02", sensors=("snpp", "noaa20"))
    f = _forward(rows, cov)
    p10 = float(curve(PARAMS["a"], PARAMS["b"], PARAMS["c"], 1.0))
    v = dict(zip(f["local_day"], f["value"]))
    assert v[date(2025, 12, 30)] == pytest.approx(3 * G * p10, abs=1e-12)
    assert v[date(2025, 12, 31)] == pytest.approx(1 * G * p10, abs=1e-12)
    assert v[date(2025, 12, 29)] == 0.0  # covered, no fire: zero, not missing
    # Identical draws: the band collapses onto the value.
    assert f["lo"].astype(float).tolist() == pytest.approx(f["value"].astype(float).tolist())
    assert f["hi"].astype(float).tolist() == pytest.approx(f["value"].astype(float).tolist())


def test_forward_missing_where_not_covered_and_noaa20_after_through():
    rows = [("snpp", "2026-01-01", C1, 10.0),  # S-NPP after snpp_through: not the primary sensor, ignored
            ("noaa20", "2026-01-01", C2, 10.0), ("noaa20", "2026-01-01", C3, 10.0, "N"),  # night ignored
            ("snpp", "2025-12-30", C1, 10.0)]
    cov = coverage("2025-12-29", "2026-01-02", sensors=("snpp", "noaa20"), uncovered={"snpp": ["2025-12-30"]})
    f = _forward(rows, cov).set_index("local_day")
    p10 = float(curve(PARAMS["a"], PARAMS["b"], PARAMS["c"], 1.0))
    assert f.loc[date(2026, 1, 1), "value"] == pytest.approx(G * p10)
    assert f.loc[date(2026, 1, 1), "source"] == "noaa20" and f.loc[date(2025, 12, 31), "source"] == "snpp"
    miss = f.loc[date(2025, 12, 30)]
    assert miss["kind"] == "missing" and pd.isna(miss["value"]) and pd.isna(miss["lo"]) and not miss["covered"]


def test_forward_band_from_draws_of_curve_and_g():
    rows = [("snpp", "2025-12-30", C1, 10.0), ("snpp", "2025-12-30", C2, 3.0)]
    cov = coverage("2025-12-29", "2026-01-02", sensors=("snpp", "noaa20"))
    draws = _draws(n=200, jitter=0.2)
    g_draws = np.linspace(1.1, 1.4, 200)
    f = _forward(rows, cov, draws, g_draws).set_index("local_day").loc[date(2025, 12, 30)]
    assert f["lo"] < f["value"] < f["hi"]


def test_k_t2_monthly_known_answer():
    m = pd.DataFrame({"month": [1, 1, 1, 2], "year": [2014, 2015, 2015, 2015], "x": [1.0, 1.0, 1.0, 0.0]})
    k = k_t2_monthly(m, PARAMS, G).set_index("month")
    assert k.loc[1, "k_t2"] == pytest.approx(G * float(curve(-2.0, 2.2, 0.88, 1.0)))
    assert k.loc[2, "k_t2"] == pytest.approx(G * float(curve(-2.0, 2.2, 0.88, 0.0)))
    assert k.loc[1, "n_years"] == 2 and k.loc[1, "k_lo"] == pytest.approx(k.loc[1, "k_hi"])
    assert np.isnan(k.loc[3, "k_t2"]) and k.loc[3, "n"] == 0


def test_g_per_draw_known_answer():
    by_year = {2014: (10, 8), 2015: (30, 20)}
    d = pd.DataFrame({"years": [[2014, 2014], [2014, 2015], [2015, 2015]]})
    assert g_per_draw(by_year, d).tolist() == pytest.approx([20 / 16, 40 / 28, 60 / 40])


def _r3_daily(start="2011-12-28", end="2012-01-25", aqua=6.0, viirs=9.0, aqua_missing=("2012-01-01",)):
    rows = []
    for d in pd.date_range(start, end).date:
        miss = d.isoformat() in aqua_missing
        rows.append({"local_day": d, "series": "aqua_raw", "value": None if miss else aqua,
                     "lo": None, "hi": None, "kind": "missing" if miss else "observed", "source": "aqua",
                     "covered": not miss})
        if d >= date(2012, 1, 20):
            rows.append({"local_day": d, "series": "viirs_raw", "value": viirs, "lo": viirs, "hi": viirs,
                         "kind": "observed", "source": "snpp", "covered": True})
    return pd.DataFrame(rows)


def test_backward_times_k_returns_aqua_raw():
    kt2 = pd.DataFrame({"month": range(1, 13), "k_t2": 0.5, "k_lo": 0.4, "k_hi": 0.6, "n": 1, "n_years": 3})
    kt2.loc[11, ["k_t2", "k_lo", "k_hi"]] = [0.25, 0.2, 0.3]  # December
    b = backward_t2(_r3_daily(), kt2, "2012-01-20", "2011-12-28", "2012-01-25").set_index("local_day")
    dec = b.loc[date(2011, 12, 30)]
    assert dec["value"] * 0.25 == pytest.approx(6.0) and dec["kind"] == "estimated" and dec["source"] == "aqua"
    jan = b.loc[date(2012, 1, 10)]
    assert jan["value"] * 0.5 == pytest.approx(6.0)
    assert jan["lo"] == pytest.approx(6.0 / 0.6) and jan["hi"] == pytest.approx(6.0 / 0.4)
    assert b.loc[date(2012, 1, 1), "kind"] == "missing" and pd.isna(b.loc[date(2012, 1, 1), "value"])
    after = b.loc[date(2012, 1, 22)]
    assert after["value"] == 9.0 and after["kind"] == "observed" and after["source"] == "snpp"


def test_no_negatives_and_one_row_per_series_per_day(tmp_path):
    rows = [("snpp", "2025-12-30", C1, 0.0), ("snpp", "2025-12-30", C2, None), ("snpp", "2025-12-31", C1, 500.0)]
    cov = coverage("2025-12-29", "2026-01-02", sensors=("snpp", "noaa20"))
    f = _forward(rows, cov, _draws(50, 0.3))
    kt2 = pd.DataFrame({"month": range(1, 13), "k_t2": 0.5, "k_lo": 0.4, "k_hi": 0.6, "n": 1, "n_years": 3})
    b = backward_t2(_r3_daily(), kt2, "2012-01-20", "2011-12-28", "2012-01-25")
    daily = pd.concat([f, b], ignore_index=True)
    assert list(daily.columns) == DAILY_COLUMNS
    assert not daily.duplicated(["series", "local_day"]).any()
    for col in ("value", "lo", "hi"):
        assert (daily[col].dropna().astype(float) >= 0).all()
    for _, grp in daily.groupby("series"):
        days = pd.to_datetime(grp["local_day"])
        assert (days.diff().dropna() == pd.Timedelta(days=1)).all()
    # Missing stays null (not NaN, not 0) through Parquet.
    write_parquet(daily, tmp_path / "d.parquet", "daily_t2")
    back = read_parquet(tmp_path / "d.parquet", "daily_t2")
    assert back.loc[back["kind"] == "missing", "value"].isna().all()
    assert len(back) == len(daily)


def test_k_compare_known_answer():
    cal = {"k": {"snpp": [{"month": m, "k": 0.4 + m / 100} for m in range(1, 13)]}}
    kt2 = pd.DataFrame({"month": range(1, 13), "k_t2": [0.5] * 11 + [np.nan]})
    kc = k_compare(cal, kt2)
    assert len(kc) == 12 and kc[0]["month"] == 1
    assert kc[0]["k_tier1"] == pytest.approx(0.41) and kc[0]["k_tier2"] == 0.5
    assert kc[11]["k_tier2"] is None
    assert k_compare({}, kt2)[0]["k_tier1"] is None


def test_stage_with_r3_inputs_writes_both_series_and_k_compare(tmp_path):
    from test_stage import _fabricated_region

    from pipeline.eyesight.__main__ import main

    cd, cov = _fabricated_region(400)
    grid, harm = tmp_path / "grid" / "fab", tmp_path / "harmonized" / "fab"
    write_parquet(cd, grid / "celldays.parquet", "celldays")
    write_parquet(cov, grid / "coverage.parquet", "coverage")
    write_parquet(_r3_daily("2003-01-01", "2022-12-31", aqua_missing=()), harm / "daily.parquet", "daily")
    harm.mkdir(parents=True, exist_ok=True)
    (harm / "calibration.json").write_text(json.dumps(
        {"k": {"snpp": [{"month": m, "k": 0.5} for m in range(1, 13)]}}), encoding="utf-8")
    assert main(["--region", "fab", "--data-root", str(tmp_path)]) == 0

    out = tmp_path / "eyesight" / "fab"
    daily = read_parquet(out / "daily_t2.parquet", "daily_t2")
    assert set(daily["series"]) == {"harmonized_t2", "viirs_equiv_t2"}
    assert daily.groupby("series").size().nunique() == 1
    est = daily[(daily["series"] == "viirs_equiv_t2") & (pd.to_datetime(daily["local_day"]) < "2012-01-20")]
    assert set(est["kind"]) == {"estimated"}
    entry = json.loads((out / "curve.json").read_text(encoding="utf-8"))
    assert [r["month"] for r in entry["k_compare"]] == list(range(1, 13))
    assert all(r["k_tier1"] == 0.5 and r["k_tier2"] > 0 for r in entry["k_compare"])
    assert (out / "figures" / "k_tier1_vs_tier2.png").stat().st_size > 10_000
