"""The simulated world: fires per day with the planted seasonality and trend (R4 section 9.1)."""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import planted as P

COMPONENT_WORLD = 0
COMPONENT_STATIC = 1


def day_range(start: str, end: str) -> np.ndarray:
    return np.arange(np.datetime64(start, "D"), np.datetime64(end, "D") + np.timedelta64(1, "D"))


def day_of_year(days: np.ndarray) -> np.ndarray:
    return (days - days.astype("datetime64[Y]")).astype(np.int64) + 1


def year_of(days: np.ndarray) -> np.ndarray:
    return days.astype("datetime64[Y]").astype(np.int64) + 1970


def _bumps(doy: np.ndarray) -> np.ndarray:
    """Circular Gaussian bumps in week space. Week k (timebins rule) spans continuous position [k-1, k)."""
    period = P.DAYS_PER_YEAR / 7.0
    wpos = (np.asarray(doy, dtype=float) - 0.5) / 7.0
    out = np.zeros_like(wpos)
    for peak, weight, sigma in zip(P.SEASON_PEAK_WEEKS, P.SEASON_WEIGHTS, P.SEASON_SIGMA_WEEKS):
        d = (wpos - (peak - 0.5) + period / 2.0) % period - period / 2.0
        out += weight * np.exp(-0.5 * (d / sigma) ** 2)
    return out


def season(doy: np.ndarray) -> np.ndarray:
    """Seasonal shape, normalised so its maximum (the main peak) is 1."""
    peak = _bumps(np.arange(1, 367)).max()
    floor = P.SEASON_FLOOR_FRAC_OF_PEAK * peak
    return (_bumps(doy) + floor) / (peak + floor)


def trend(year: np.ndarray) -> np.ndarray:
    return 1.0 + P.TREND_PER_YEAR * (np.asarray(year, dtype=float) - P.TREND_BASE_YEAR)


def expected_fires_per_day(days: np.ndarray, size: str) -> np.ndarray:
    return P.BASE_FIRES_AT_PEAK[size] * season(day_of_year(days)) * trend(year_of(days))


def simulate_fires(seed: int, size: str, bbox: tuple[float, float, float, float],
                   start: str = P.WORLD_START, end: str = P.WORLD_END) -> pd.DataFrame:
    """One row per fire: fire_id, day (local), lat, lon, frp (MW, afternoon), night (also burns at night)."""
    rng = np.random.default_rng([seed, COMPONENT_WORLD])
    days = day_range(start, end)
    n_per_day = rng.poisson(expected_fires_per_day(days, size))
    day = np.repeat(days, n_per_day)
    n = day.size
    west, south, east, north = bbox
    lon = rng.uniform(west, east, n)
    lat = rng.uniform(south, north, n)
    frp = P.FRP_MEDIAN_MW * np.exp(P.FRP_SIGMA_LN * rng.standard_normal(n))
    night = rng.random(n) < P.NIGHT_SHARE
    return pd.DataFrame({"fire_id": np.arange(n, dtype=np.int64), "day": day, "lat": lat, "lon": lon,
                         "frp": frp, "night": night})


def static_points(seed: int, bbox: tuple[float, float, float, float]) -> pd.DataFrame:
    """The fixed static heat sources: static_id, lat, lon."""
    rng = np.random.default_rng([seed, COMPONENT_STATIC])
    west, south, east, north = bbox
    inset = P.STATIC_INSET_DEG
    lon = rng.uniform(west + inset, east - inset, P.N_STATIC)
    lat = rng.uniform(south + inset, north - inset, P.N_STATIC)
    return pd.DataFrame({"static_id": np.arange(P.N_STATIC, dtype=np.int64), "lat": lat, "lon": lon})
