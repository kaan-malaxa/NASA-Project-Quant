"""Temporary stand-in for pipeline/config/science.yaml (R3) and regions.yaml (R2).

Used ONLY by `--sample`, and only while pipeline.common.config does not exist yet. The values
below are a verbatim copy of contracts section 4.2 (science.yaml) and 4.1 (regions.yaml).
Delete this module once pipeline.common.config lands; nothing else may import it.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

SCIENCE_4_2: dict[str, Any] = {
    "seed": 7,
    "reference": {"sensor": "aqua", "pass": "D"},
    "filters": {"modis_min_confidence": 30, "viirs_keep": ["n", "h"]},
    "grid": {"count_res": 6, "map_res": 5, "mask_res": 8},
    "eras": {
        "record_start": "2003-01-01", "aqua_trusted_through": "2022-12-31",
        "snpp_through": "2025-12-31", "snpp_first_day": "2012-01-20",
    },
    "tier1": {
        "n0": 50, "bootstrap_b": 500, "snpp_fit": ["2013-01-01", "2022-12-31"],
        "n20_min_fit_years": 3, "monthly": True,
    },
    "timebins": {"week_min_covered_days": 5, "month_min_covered_frac": 0.8, "year_min_covered_frac": 0.9},
    "static_mask": {"min_static_detections": 3, "dilate_rings": 1},
    "climatology": {"baseline_years": [2003, 2025], "smooth_weeks": 3},
    "anomaly": {"low_activity_threshold": 5, "extreme_pct": 95, "above_pct": 75, "below_pct": 25},
    "season": {
        "critical_share": 0.8, "max_windows": 2, "min_window_share": 0.15,
        "extend_weeks": 4, "min_year_celldays": 20,
    },
    "trend": {"years": [2003, 2025], "bootstrap_b": 1000, "artifact_gap_points": 10},
    "tier2": {
        "fit": ["2013-01-01", "2022-12-31"], "frp_floor_mw": 0.1, "bootstrap_b": 200,
        "max_band_at_10mw": 0.30, "max_reliability_err": 0.05, "max_wape_ratio_vs_t1": 1.10,
    },
}

REGIONS_4_1: list[dict[str, Any]] = [
    {"id": "punjab", "name": "Punjab and Haryana, India", "country": "IN",
     "bbox": [73.8, 27.6, 77.6, 32.6], "fire_type": "Crop residue burning",
     "story": "Farmers burn crop residue every April–May and October–November; the smoke reaches Delhi.",
     "synthetic": False},
    {"id": "bc", "name": "British Columbia, Canada", "country": "CA",
     "bbox": [-139.1, 48.2, -114.0, 60.1], "fire_type": "Forest wildfire",
     "story": "Summer wildfire, including the record 2023 season.", "synthetic": False},
    {"id": "litoral", "name": "Santa Fe and Entre Ríos, Argentina", "country": "AR",
     "bbox": [-63.0, -34.5, -57.7, -27.9], "fire_type": "Wetland and pasture burning",
     "story": "Paraná Delta wetland fires and pasture burning; a crisis in 2020–2022.", "synthetic": False},
    {"id": "synthland", "name": "Synthland (planted-truth test)", "country": "ZZ",
     "bbox": [10.0, 10.0, 12.0, 12.0], "fire_type": "Simulated",
     "story": "A simulated region where the right answer is known.", "synthetic": True},
]


def load_science() -> tuple[dict[str, Any], str]:
    """(science config, sha256 of its source). Prefers pipeline.common.config when it exists."""
    try:
        from pipeline.common.config import load_science as real  # type: ignore[import-not-found]
    except ImportError:
        text = json.dumps(SCIENCE_4_2, sort_keys=True).encode("utf-8")
        return SCIENCE_4_2, hashlib.sha256(text).hexdigest()
    path = Path(__file__).resolve().parents[1] / "config" / "science.yaml"
    return real(), hashlib.sha256(path.read_bytes()).hexdigest()


def load_regions() -> list[dict[str, Any]]:
    """Region records as dicts. Prefers pipeline.common.config when it exists."""
    try:
        from pipeline.common.config import load_regions as real  # type: ignore[import-not-found]
    except ImportError:
        return [dict(r) for r in REGIONS_4_1]
    keys = ("id", "name", "country", "bbox", "fire_type", "story", "synthetic")
    return [{k: getattr(r, k) for k in keys} for r in real()]
