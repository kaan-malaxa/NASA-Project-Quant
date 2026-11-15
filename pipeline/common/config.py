"""Read project configuration without modifying science decisions."""
from dataclasses import dataclass, field
from itertools import pairwise
from pathlib import Path

import yaml

from pipeline.common import paths


@dataclass(frozen=True)
class Region:
    id: str
    name: str
    country: str
    bbox: list[float]
    polygon: str | None
    fire_type: str
    story: str
    synthetic: bool
    firms_country_names: list[str] = field(default_factory=list)


def load_regions() -> list[Region]:
    """One real United States region, plus any simulated (planted-truth) regions."""
    with paths.config_file("regions.yaml").open(encoding="utf-8") as handle:
        regions = [Region(**row) for row in yaml.safe_load(handle)["regions"]]
    real = [region for region in regions if not region.synthetic]
    if len(real) != 1:
        raise ValueError("Configure exactly one real-data region: us")
    require_us_region(real[0])
    if len({region.id for region in regions}) != len(regions):
        raise ValueError("Region ids must be unique")
    return regions


def real_region() -> Region:
    """The single real-data region (contracts section 4.1)."""
    return next(region for region in load_regions() if not region.synthetic)


def require_us_region(region) -> None:
    """Real hotspot data may only come from the local United_States country CSVs."""
    if (
        region.id != "us" or region.country != "US" or region.synthetic
        or region.firms_country_names != ["United_States"]
    ):
        raise ValueError("Only the us region using local United_States CSVs is enabled")


def get_region(region_id) -> Region:
    for region in load_regions():
        if region.id == region_id:
            return region
    raise ValueError(f"Unknown region: {region_id}")


def load_science() -> dict:
    path = paths.config_file("science.yaml")
    if not path.is_file():
        raise FileNotFoundError(
            f"Missing science configuration: {path}. R3 must supply pipeline/config/science.yaml."
        )
    with path.open(encoding="utf-8") as handle:
        result = yaml.safe_load(handle)
    if not isinstance(result, dict):
        raise TypeError(f"Science configuration must be a mapping: {path}")
    return result


def region_centroid(region) -> tuple[float, float]:
    """Return polygon area centroid, or download-box centre if polygon is absent."""
    import json

    if isinstance(region, str):
        region = get_region(region)
    path = paths.PROJECT_ROOT / region.polygon if region.polygon else None
    if path and path.is_file():
        with Path(path).open(encoding="utf-8") as handle:
            geo = json.load(handle)
        if geo["type"] == "FeatureCollection":
            geometries = [feature["geometry"] for feature in geo["features"]]
        elif geo["type"] == "Feature":
            geometries = [geo["geometry"]]
        else:
            geometries = [geo]
        area = cx = cy = 0.0
        for geometry in geometries:
            if geometry["type"] not in {"Polygon", "MultiPolygon"}:
                raise ValueError("Region geometry must be Polygon or MultiPolygon")
            polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
            for polygon in polygons:
                for index, ring in enumerate(polygon):
                    cross = [(a[0] * b[1] - b[0] * a[1]) for a, b in pairwise(ring)]
                    signed = sum(cross) / 2
                    if signed == 0:
                        continue
                    weight = abs(signed) * (1 if index == 0 else -1)
                    cx += weight * sum((a[0] + b[0]) * c for a, b, c in zip(ring, ring[1:], cross)) / (6 * signed)
                    cy += weight * sum((a[1] + b[1]) * c for a, b, c in zip(ring, ring[1:], cross)) / (6 * signed)
                    area += weight
        if area <= 0:
            raise ValueError("Region polygon has no positive area")
        return cx / area, cy / area
    west, south, east, north = region.bbox
    return (west + east) / 2, (south + north) / 2
