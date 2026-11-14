"""Simulated sensors: detection laws, pixels, pass times, coverage gaps, static sources (R4 section 9.2)."""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import planted as P

SENSOR_CODES = {"snpp": 1, "noaa20": 2, "aqua": 3, "terra": 4, "aqua_ref": 5}
PASS_CODES = {"D": 0, "N": 1}
COMPONENT_FIRES = 10
COMPONENT_STATIC = 20
M_PER_DEG_LAT = 111_320.0

DETECTION_COLUMNS = ["sensor", "utc", "local_day", "lat", "lon", "frp", "daynight", "static", "source_id"]


def sigmoid(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-z))


def _years_since(days: np.ndarray, ref: str) -> np.ndarray:
    return np.maximum((days - np.datetime64(ref, "D")).astype(float) / P.DAYS_PER_YEAR, 0.0)


def eyesight_prob(sensor: str, frp: np.ndarray, days: np.ndarray) -> np.ndarray:
    """Chance of detection given the sensor is looking (no ceiling)."""
    x = np.log10(frp)
    if sensor in ("snpp", "noaa20"):
        law = P.VIIRS_LAW
        return law["scale"] * sigmoid(law["a"] + law["b"] * x)
    if sensor in ("aqua", "aqua_ref"):
        a = P.AQUA_CURVE["a"]
        if sensor == "aqua":
            a = a - P.AQUA_A_DROP_PER_YEAR * _years_since(days, P.AQUA_DRIFT_FROM)
        return sigmoid(a + P.AQUA_CURVE["b"] * x)
    if sensor == "terra":
        return sigmoid(P.TERRA_CURVE["a"] + P.TERRA_CURVE["b"] * x)
    raise ValueError(f"unknown sensor {sensor!r}")


def in_view_prob(sensor: str) -> float:
    return {"aqua": P.AQUA_CURVE["c"], "aqua_ref": P.AQUA_CURVE["c"], "terra": P.TERRA_CURVE["c"]}.get(sensor, 1.0)


def local_pass_minutes(sensor: str, days: np.ndarray, pass_: str) -> np.ndarray:
    base = np.full(days.shape, float(P.SENSORS[sensor]["local_min"]))
    if sensor == "aqua":
        base += P.AQUA_TIME_DRIFT_MIN_PER_YEAR * _years_since(days, P.AQUA_DRIFT_FROM)
    if pass_ == "N":
        base += P.NIGHT_OFFSET_MIN
    return base


def covered_mask(sensor: str, dates: np.ndarray) -> np.ndarray:
    """True where the planted sensor is up and not in a planted outage."""
    spec = P.SENSORS[sensor]
    ok = (dates >= np.datetime64(spec["first"], "D")) & (dates <= np.datetime64(spec["last"], "D"))
    ok &= dates <= np.datetime64(P.WORLD_END, "D")
    for o in P.OUTAGES:
        if o["sensor"] == sensor:
            ok &= ~((dates >= np.datetime64(o["start"], "D")) & (dates <= np.datetime64(o["end"], "D")))
    return ok


def _jitter(rng: np.random.Generator, lat: np.ndarray, lon: np.ndarray, radius_m: float):
    """Uniform jitter inside a disc of the given radius."""
    r = radius_m * np.sqrt(rng.random(lat.size))
    theta = rng.uniform(0.0, 2.0 * np.pi, lat.size)
    dlat = r * np.cos(theta) / M_PER_DEG_LAT
    dlon = r * np.sin(theta) / (M_PER_DEG_LAT * np.cos(np.radians(lat)))
    return lat + dlat, lon + dlon


def _assemble(sensor, rng, days, lat, lon, frp, pass_, static, source_id) -> pd.DataFrame:
    """Jitter, timestamp (local solar -> UTC, SD-03 inverse), and keep only covered days."""
    spec = P.SENSORS[sensor]
    lat, lon = _jitter(rng, lat, lon, spec["jitter_m"])
    jit = spec["time_jitter_min"]
    minutes = local_pass_minutes(sensor, days, pass_) + rng.uniform(-jit, jit, days.size)
    local = days.astype("datetime64[s]") + np.round(minutes * 60.0).astype("timedelta64[s]")
    utc = local - np.round(lon / 15.0 * 3600.0).astype("timedelta64[s]")
    local_day = local.astype("datetime64[D]")
    keep = covered_mask(sensor, utc.astype("datetime64[D]")) & covered_mask(sensor, local_day)
    return pd.DataFrame({
        "sensor": sensor, "utc": utc[keep], "local_day": local_day[keep], "lat": lat[keep], "lon": lon[keep],
        "frp": frp[keep], "daynight": pass_, "static": static, "source_id": source_id[keep],
    })[DETECTION_COLUMNS]


def observe_fires(fires: pd.DataFrame, sensor: str, pass_: str, seed: int) -> pd.DataFrame:
    """Detections of the world's fires by one sensor on one pass."""
    rng = np.random.default_rng([seed, COMPONENT_FIRES, SENSOR_CODES[sensor], PASS_CODES[pass_]])
    sel = fires if pass_ == "D" else fires[fires["night"].to_numpy()]
    days = sel["day"].to_numpy().astype("datetime64[D]")
    f = sel["frp"].to_numpy() * (1.0 if pass_ == "D" else P.NIGHT_FRP_FACTOR)
    fire_id = sel["fire_id"].to_numpy()
    lat0, lon0 = sel["lat"].to_numpy(), sel["lon"].to_numpy()

    looking = rng.random(f.size) < in_view_prob(sensor)  # one draw per fire-day (MODIS ceiling)
    seen = rng.random(f.size) < eyesight_prob(sensor, f, days)
    hit = looking & seen

    if P.SENSORS[sensor]["family"] == "viirs":
        npix = 1 + rng.poisson(P.VIIRS_PIXELS_PER_SQRT_MW * np.sqrt(f[hit]))
        idx = np.repeat(np.flatnonzero(hit), npix)
        frp_obs = np.repeat(f[hit] / npix, npix)  # FRP split evenly across pixels
    else:
        idx = np.flatnonzero(hit)
        frp_obs = f[idx] * np.exp(P.MODIS_FRP_NOISE_SIGMA_LN * rng.standard_normal(idx.size))

    # Pass time is drawn per pixel; the spread (minutes) is far below a day, so a fire's pixels stay together.
    return _assemble(sensor, rng, days[idx], lat0[idx], lon0[idx], frp_obs, pass_, False, fire_id[idx])


def observe_static(points: pd.DataFrame, sensor: str, seed: int,
                   start: str = P.WORLD_START, end: str = P.WORLD_END) -> pd.DataFrame:
    """Daytime detections of the static heat sources: every up sensor, every day, probability 0.97."""
    rng = np.random.default_rng([seed, COMPONENT_STATIC, SENSOR_CODES[sensor]])
    all_days = np.arange(np.datetime64(start, "D"), np.datetime64(end, "D") + np.timedelta64(1, "D"))
    n_pts = len(points)
    days = np.repeat(all_days, n_pts)
    sid = np.tile(points["static_id"].to_numpy(), all_days.size)
    lat = np.tile(points["lat"].to_numpy(), all_days.size)
    lon = np.tile(points["lon"].to_numpy(), all_days.size)
    hit = rng.random(days.size) < P.STATIC_DETECT_PROB
    lo, hi = P.STATIC_FRP_RANGE
    frp = rng.uniform(lo, hi, int(hit.sum()))
    return _assemble(sensor, rng, days[hit], lat[hit], lon[hit], frp, "D", True, sid[hit])


def observe_all(fires: pd.DataFrame, points: pd.DataFrame, sensor: str, seed: int,
                start: str = P.WORLD_START, end: str = P.WORLD_END) -> pd.DataFrame:
    parts = [observe_fires(fires, sensor, "D", seed), observe_fires(fires, sensor, "N", seed),
             observe_static(points, sensor, seed, start, end)]
    return pd.concat(parts, ignore_index=True)
