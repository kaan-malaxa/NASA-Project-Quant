"""Sensor windows, outages, static sources and NRT marks on the full tiny simulation."""

from __future__ import annotations

import json

import numpy as np
import pandas as pd

from pipeline.synth import planted as P
from pipeline.synth.sensors import covered_mask, eyesight_prob, in_view_prob


def _dates(df: pd.DataFrame) -> pd.Series:
    return pd.to_datetime(df["acq_date"]).dt.date.astype(str)


def test_known_detection_probabilities():
    day = np.array(["2015-06-01"], dtype="datetime64[D]")
    late = np.array(["2025-01-01"], dtype="datetime64[D]")
    assert np.isclose(eyesight_prob("aqua", np.array([10.0]), day)[0], 1 / (1 + np.exp(-0.2)))
    assert np.isclose(eyesight_prob("snpp", np.array([1.0]), day)[0], 0.97 / (1 + np.exp(-2.5)))
    # From 2023-01-01, a falls by 0.25 per year: two years later a = -2.5.
    assert np.isclose(eyesight_prob("aqua", np.array([10.0]), late)[0], 1 / (1 + np.exp(0.3)), atol=2e-3)
    assert in_view_prob("aqua") == 0.88 and in_view_prob("snpp") == 1.0


def test_covered_mask_outage():
    d = np.array(["2020-08-15", "2020-08-16", "2020-09-02", "2020-09-03", "2026-08-27"], dtype="datetime64[D]")
    assert covered_mask("aqua", d).tolist() == [True, False, False, True, False]


def test_sensor_windows(tables7):
    snpp = _dates(tables7["snpp"])
    assert snpp.min() >= "2012-01-20" and snpp.max() <= "2026-07-09"
    assert _dates(tables7["noaa20"]).min() >= "2018-01-01"
    modis = tables7["modis"]
    aqua = _dates(modis[modis["satellite"] == "Aqua"])
    assert not aqua.between("2020-08-16", "2020-09-02").any()
    assert aqua.max() <= "2026-08-26"
    assert _dates(modis[modis["satellite"] == "Terra"]).between("2020-08-16", "2020-09-02").any()


def test_nrt_rows_after_june_2026(tables7):
    for df in tables7.values():
        late = _dates(df) > P.LAST_SP_DATE
        assert late.any()
        assert (df.loc[late, "type"] == "").all()
        assert df.loc[late, "version"].str.endswith("NRT").all()
        assert (df.loc[~late, "type"] != "").all()
        assert not df.loc[~late, "version"].str.endswith("NRT").any()


def test_static_sources_daily_and_type_2(tiny7, tables7):
    truth = json.loads((tiny7 / "truth.json").read_text(encoding="utf-8"))
    pts = pd.DataFrame(truth["planted"]["static_points"])
    assert len(pts) == 5
    for key, df in tables7.items():
        sats = ["Aqua", "Terra"] if key == "modis" else [df["satellite"].iloc[0]]
        for sat in sats:
            sub = df[(df["satellite"] == sat) & (df["daynight"] == "D")]
            lat, lon = sub["latitude"].astype(float).to_numpy(), sub["longitude"].astype(float).to_numpy()
            sensor = {"Aqua": "aqua", "Terra": "terra", "N": "snpp", "N20": "noaa20"}[sat]
            all_days = np.arange(np.datetime64(P.WORLD_START), np.datetime64(P.WORLD_END) + np.timedelta64(1, "D"))
            n_covered = int(covered_mask(sensor, all_days).sum())
            for p in pts.itertuples():
                near = (np.abs(lat - p.lat) < 0.01) & (np.abs(lon - p.lon) < 0.01)
                rows = sub[near]
                sp = rows[_dates(rows) <= P.LAST_SP_DATE]
                assert rows["acq_date"].nunique() >= 0.95 * n_covered, (sat, p.Index)
                # Static rows in standard files are type 2 (fires that land on the same spot are rare).
                assert (sp["type"] == "2").mean() > 0.99, (sat, p.Index)
