"""Fixed inputs for the `--sample` site. Nothing else may import this module.

SCIENCE_4_2 is a copy of contracts section 4.2 and is used only if pipeline.common.config cannot be
imported; science.yaml wins whenever it exists. REGIONS_4_1 holds the sample site's own region records.
"""

from __future__ import annotations

from typing import Any

from pipeline.common import config, io, paths

SCIENCE_4_2 = config.load_science()  # compatibility name; no duplicated constants

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


def load_science():
    return config.load_science(), io.sha256(paths.config_file("science.yaml"))


def load_regions() -> list[dict[str, Any]]:
    """Region records for the SAMPLE site, as dicts.

    Always the fixed records above, never regions.yaml: the sample generator places its made-up cells
    inside this lower-48 box, and the real `us` region's box spans the antimeridian (Alaska's Aleutians),
    which no simple box sampler can fill. Sample output is marked kind "sample" throughout.
    """
    return [dict(r) for r in REGIONS_4_1]
