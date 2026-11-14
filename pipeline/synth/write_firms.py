"""Write detections in the FIRMS archive CSV format (R4 section 9.4).

Line endings are CRLF and columns follow the real FIRMS country CSVs in data/ (checked 2026-11-14).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from . import planted as P

MODIS_HEADER = ["latitude", "longitude", "brightness", "scan", "track", "acq_date", "acq_time", "satellite",
                "instrument", "confidence", "version", "bright_t31", "frp", "daynight", "type"]
VIIRS_HEADER = ["latitude", "longitude", "bright_ti4", "scan", "track", "acq_date", "acq_time", "satellite",
                "instrument", "confidence", "version", "bright_ti5", "frp", "daynight", "type"]
HEADERS = {"modis": MODIS_HEADER, "viirs": VIIRS_HEADER}
FILE_NAMES = {"modis": "modis_synth.csv", "snpp": "viirs_snpp_synth.csv", "noaa20": "viirs_noaa20_synth.csv"}
LINE_END = "\r\n"
COMPONENT_FORMAT = 50
FAMILY_CODES = {"modis": 1, "viirs": 2}


def _fmt(fmt: str, values: np.ndarray) -> np.ndarray:
    return np.char.mod(fmt, np.asarray(values, dtype=float))


def sort_detections(det: pd.DataFrame) -> pd.DataFrame:
    """FIRMS files are ordered by date and time; ties broken by satellite, latitude, longitude."""
    order = np.lexsort((det["lon"].to_numpy(), det["lat"].to_numpy(),
                        det["sensor"].to_numpy().astype(str), det["utc"].to_numpy()))
    return det.iloc[order].reset_index(drop=True)


def modis_confidence(frp: np.ndarray, noise: np.ndarray) -> np.ndarray:
    """Integer min(100, 20 + 35 log10(frp + 1) + noise), floored at 0."""
    conf = P.MODIS_CONF["base"] + P.MODIS_CONF["slope"] * np.log10(frp + 1.0) + noise
    return np.clip(np.round(conf), 0, 100).astype(int)


def viirs_confidence(frp: np.ndarray) -> np.ndarray:
    """l for the weakest 10 %, h for the strongest 15 %, n otherwise (by FRP within the file)."""
    out = np.full(frp.size, "n", dtype="<U1")
    if frp.size == 0:
        return out
    q_low = np.quantile(frp, P.VIIRS_CONF_SHARES["l"])
    q_high = np.quantile(frp, 1.0 - P.VIIRS_CONF_SHARES["h"])
    out[frp < q_low] = "l"
    out[frp >= q_high] = "h"
    return out


def format_rows(det: pd.DataFrame, family: str, seed: int) -> pd.DataFrame:
    """Turn a detections table (sensors.DETECTION_COLUMNS) into string columns in FIRMS order."""
    det = sort_detections(det)
    rng = np.random.default_rng([seed, COMPONENT_FORMAT, FAMILY_CODES[family]])
    n = len(det)
    utc = det["utc"].to_numpy().astype("datetime64[s]")
    utc_day = utc.astype("datetime64[D]")
    minute_of_day = ((utc - utc_day.astype("datetime64[s]")).astype(np.int64) // 60)
    acq_time = np.char.zfill((minute_of_day // 60 * 100 + minute_of_day % 60).astype(str), 4)
    frp = det["frp"].to_numpy(dtype=float)
    static = det["static"].to_numpy(dtype=bool)
    nrt = utc_day > np.datetime64(P.LAST_SP_DATE, "D")
    sat = np.array([P.SENSORS[s]["satellite"] for s in det["sensor"]], dtype=object)

    out = pd.DataFrame(index=range(n))
    if family == "modis":
        out["latitude"] = _fmt("%.4f", det["lat"])
        out["longitude"] = _fmt("%.4f", det["lon"])
        out["brightness"] = _fmt("%.1f", 300.0 + 8.0 * np.log10(frp + 1.0) + rng.normal(0.0, 2.0, n))
        out["scan"] = _fmt("%.1f", rng.uniform(1.0, 1.2, n))
        out["track"] = _fmt("%.1f", rng.uniform(1.0, 1.2, n))
        conf_str = modis_confidence(frp, rng.normal(0.0, P.MODIS_CONF["noise_sd"], n)).astype(str)
        t31 = _fmt("%.1f", 290.0 + rng.normal(0.0, 3.0, n))
        frp_str = _fmt("%.1f", frp)
        t_col, instrument = "bright_t31", "MODIS"
    else:
        out["latitude"] = _fmt("%.5f", det["lat"])
        out["longitude"] = _fmt("%.5f", det["lon"])
        out["bright_ti4"] = _fmt("%.2f", np.minimum(367.0, 310.0 + 12.0 * np.log10(frp + 1.0)
                                                    + rng.normal(0.0, 3.0, n)))
        out["scan"] = _fmt("%.2f", rng.uniform(0.39, 0.45, n))
        out["track"] = _fmt("%.2f", rng.uniform(0.39, 0.45, n))
        conf_str = viirs_confidence(frp)
        t31 = _fmt("%.2f", 285.0 + rng.normal(0.0, 4.0, n))
        frp_str = _fmt("%.2f", frp)
        t_col, instrument = "bright_ti5", "VIIRS"

    versions = P.VERSIONS[family]
    out["acq_date"] = np.datetime_as_string(utc_day, unit="D")
    out["acq_time"] = acq_time
    out["satellite"] = sat
    out["instrument"] = instrument
    out["confidence"] = conf_str
    out["version"] = np.where(nrt, versions["NRT"], versions["SP"])
    out[t_col] = t31
    out["frp"] = frp_str
    out["daynight"] = det["daynight"].to_numpy()
    out["type"] = np.where(nrt, "", np.where(static, "2", "0"))
    return out[HEADERS[family]]


def write_csv(rows: pd.DataFrame, path: Path) -> None:
    """Write string columns with CRLF line endings, UTF-8, no index."""
    path.parent.mkdir(parents=True, exist_ok=True)
    rows.to_csv(path, index=False, lineterminator=LINE_END, encoding="utf-8")
