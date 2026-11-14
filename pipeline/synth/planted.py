"""Planted parameters of the synthland simulator (plan/roles/R4_tier2_eyesight.md, section 9).

These are the simulator's hidden "right answers", not pipeline science constants. The pipeline stages must
recover them from the CSVs, so no module outside ``pipeline.synth`` may import this file.
"""

from __future__ import annotations

# 9.1 World
WORLD_START = "2003-01-01"
WORLD_END = "2026-11-13"
DAYS_PER_YEAR = 365.25

SEASON_PEAK_WEEKS = (44, 18)
SEASON_WEIGHTS = (0.70, 0.30)
SEASON_SIGMA_WEEKS = (2.5, 2.0)
SEASON_FLOOR_FRAC_OF_PEAK = 0.02

TREND_PER_YEAR = 0.015  # trend(year) = 1 + 0.015 * (year - 2003)
TREND_BASE_YEAR = 2003

BASE_FIRES_AT_PEAK = {"tiny": 25.0, "full": 120.0}

FRP_MEDIAN_MW = 8.0
FRP_SIGMA_LN = 1.2
NIGHT_SHARE = 0.20
NIGHT_FRP_FACTOR = 0.4

# 9.2 Sensors. Local solar times are minutes after local midnight.
VIIRS_LAW = {"scale": 0.97, "a": 2.5, "b": 3.0}
VIIRS_PIXELS_PER_SQRT_MW = 0.6

AQUA_CURVE = {"a": -2.0, "b": 2.2, "c": 0.88}
AQUA_DRIFT_FROM = "2023-01-01"
AQUA_A_DROP_PER_YEAR = 0.25
AQUA_TIME_DRIFT_MIN_PER_YEAR = 25.0

TERRA_CURVE = {"a": -2.6, "b": 2.2, "c": 0.88}

MODIS_FRP_NOISE_SIGMA_LN = 0.3

SENSORS = {
    "snpp": {"family": "viirs", "satellite": "N", "first": "2012-01-20", "last": "2026-07-09",
             "local_min": 13 * 60 + 30, "time_jitter_min": 20, "jitter_m": 400.0},
    "noaa20": {"family": "viirs", "satellite": "N20", "first": "2018-01-01", "last": WORLD_END,
               "local_min": 12 * 60 + 40, "time_jitter_min": 20, "jitter_m": 400.0},
    "aqua": {"family": "modis", "satellite": "Aqua", "first": "2003-01-01", "last": "2026-08-26",
             "local_min": 13 * 60 + 35, "time_jitter_min": 15, "jitter_m": 700.0},
    "terra": {"family": "modis", "satellite": "Terra", "first": "2003-01-01", "last": WORLD_END,
              "local_min": 10 * 60 + 30, "time_jitter_min": 15, "jitter_m": 700.0},
    # Reference Aqua for truth only: undrifted, no outage, never written to a CSV. It defines the "true
    # Aqua-scale" counts for 2023-2025, when the real (simulated) Aqua is drifting.
    "aqua_ref": {"family": "modis", "satellite": "Aqua", "first": "2003-01-01", "last": WORLD_END,
                 "local_min": 13 * 60 + 35, "time_jitter_min": 15, "jitter_m": 700.0},
}
NIGHT_OFFSET_MIN = 12 * 60

OUTAGES = [{"sensor": "aqua", "start": "2020-08-16", "end": "2020-09-02"}]

# Static sources
N_STATIC = 5
STATIC_DETECT_PROB = 0.97
STATIC_FRP_RANGE = (15.0, 40.0)
STATIC_INSET_DEG = 0.1

# Confidence
MODIS_CONF = {"base": 20.0, "slope": 35.0, "noise_sd": 5.0}
VIIRS_CONF_SHARES = {"l": 0.10, "n": 0.75, "h": 0.15}

# Standard vs near-real-time
LAST_SP_DATE = "2026-06-30"
VERSIONS = {"modis": {"SP": "6.1", "NRT": "6.1NRT"}, "viirs": {"SP": "2", "NRT": "2.0NRT"}}

NOAA20_FIRST_FULL_YEAR = 2018
EXPECTED_NOAA20_METHOD = "direct"

# Fallbacks used only while pipeline/common and the config files are not in the repo yet.
FALLBACK_SEED = 7
FALLBACK_BBOX = {"synthland": (10.0, 10.0, 12.0, 12.0)}  # SD-19
