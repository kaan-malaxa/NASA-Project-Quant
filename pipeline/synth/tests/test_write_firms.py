"""The FIRMS writer on 10 fabricated rows per file."""

from __future__ import annotations

import re

import numpy as np
import pandas as pd

from pipeline.synth.write_firms import MODIS_HEADER, VIIRS_HEADER, format_rows, viirs_confidence, write_csv

SPEC_MODIS = ("latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,"
              "bright_t31,frp,daynight,type")
SPEC_VIIRS = ("latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,"
              "bright_ti5,frp,daynight,type")


def _fabricate(sensor: str, n: int = 10) -> pd.DataFrame:
    # 5 standard rows (2026-06-30) and 5 near-real-time rows (2026-07-01); two static rows.
    utc = np.array(["2026-06-30T00:05:00"] * 5 + ["2026-07-01T23:59:59"] * 5, dtype="datetime64[s]")
    return pd.DataFrame({
        "sensor": sensor, "utc": utc, "local_day": utc.astype("datetime64[D]"),
        "lat": np.linspace(10.1, 11.9, n), "lon": np.linspace(10.2, 11.8, n),
        "frp": np.geomspace(0.5, 500.0, n), "daynight": ["D", "N"] * (n // 2),
        "static": [True, False] * (n // 2), "source_id": np.arange(n),
    })


def _write(tmp_path, sensor, family, name):
    rows = format_rows(_fabricate(sensor), family, seed=1)
    path = tmp_path / name
    write_csv(rows, path)
    return path, pd.read_csv(path, dtype=str, keep_default_na=False)


def test_headers_match_spec_exactly():
    assert ",".join(MODIS_HEADER) == SPEC_MODIS
    assert ",".join(VIIRS_HEADER) == SPEC_VIIRS


def test_ten_rows_per_file(tmp_path):
    for sensor, family, name, header in [("aqua", "modis", "modis_synth.csv", SPEC_MODIS),
                                         ("snpp", "viirs", "viirs_snpp_synth.csv", SPEC_VIIRS),
                                         ("noaa20", "viirs", "viirs_noaa20_synth.csv", SPEC_VIIRS)]:
        path, df = _write(tmp_path, sensor, family, name)
        raw = path.read_bytes()
        assert raw.startswith((header + "\r\n").encode())
        assert raw.count(b"\r\n") == 11  # header + 10 rows, CRLF like the real FIRMS files
        assert len(df) == 10
        assert df["acq_time"].str.fullmatch(r"\d{4}").all()
        assert df["acq_date"].str.fullmatch(r"\d{4}-\d{2}-\d{2}").all()
        assert set(df["satellite"]) == {{"aqua": "Aqua", "snpp": "N", "noaa20": "N20"}[sensor]}


def test_utc_time_and_nrt_marks(tmp_path):
    _, df = _write(tmp_path, "snpp", "viirs", "v.csv")
    sp = df[df["acq_date"] == "2026-06-30"]
    nrt = df[df["acq_date"] == "2026-07-01"]
    assert (sp["acq_time"] == "0005").all() and (nrt["acq_time"] == "2359").all()
    assert set(sp["type"]) == {"0", "2"} and set(sp["version"]) == {"2"}
    assert (nrt["type"] == "").all() and nrt["version"].str.endswith("NRT").all()


def test_modis_formats(tmp_path):
    _, df = _write(tmp_path, "terra", "modis", "m.csv")
    assert set(df["instrument"]) == {"MODIS"}
    conf = df["confidence"].astype(int)
    assert conf.between(0, 100).all()
    assert df["scan"].astype(float).between(1.0, 1.2).all()
    assert all(re.fullmatch(r"\d+\.\d{4}", v) for v in df["latitude"])


def test_viirs_confidence_shares():
    frp = np.arange(1, 1001, dtype=float)
    conf = viirs_confidence(frp)
    assert (conf == "l").sum() == 100 and (conf == "h").sum() == 150
    assert conf[0] == "l" and conf[-1] == "h"
