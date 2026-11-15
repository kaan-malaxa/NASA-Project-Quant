"""Fixed inputs for the `--sample` site. Nothing else may import this module.

SCIENCE_4_2 is a copy of contracts section 4.2 and is used only if pipeline.common.config cannot be
imported; science.yaml wins whenever it exists. REGIONS_4_1 holds the sample site's own region records.
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
    {"id": "us", "name": "United States", "country": "US",
     "bbox": [-124.8, 24.4, -66.9, 49.4], "fire_type": "Wildfire, prescribed and agricultural burning",
     "story": "Summer and autumn wildfire in the West; prescribed and agricultural burning in the Southeast "
              "and the Great Plains, mostly in spring.",
     "synthetic": False},
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
    """Region records for the SAMPLE site, as dicts.

    Always the fixed records above, never regions.yaml: the sample generator places its made-up cells
    inside this lower-48 box, and the real `us` region's box spans the antimeridian (Alaska's Aleutians),
    which no simple box sampler can fill. Sample output is marked kind "sample" throughout.
    """
    return [dict(r) for r in REGIONS_4_1]
