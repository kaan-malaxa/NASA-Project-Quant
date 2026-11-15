"""US-only configuration; consumers must treat loaded science values as read-only."""

from dataclasses import dataclass
from functools import lru_cache
from types import MappingProxyType

from pipeline.common import paths


@lru_cache(maxsize=1)
def load_science():
    from pipeline.common.io import read_yaml

    values = read_yaml(paths.config_file("science.yaml"))
    return MappingProxyType(values)


@dataclass(frozen=True)
class Region:
    id: str
    name: str
    country: str
    bbox: list | None
    polygon: str | None
    fire_type: str
    story: str
    synthetic: bool
    firms_country_names: list


def load_regions() -> list[Region]:
    from pipeline.common.io import read_yaml

    regions = [Region(**entry) for entry in read_yaml(paths.config_file("regions.yaml"))["regions"]]
    if len(regions) != 1 or regions[0].country != "US" or regions[0].synthetic:
        raise ValueError("Only the configured, non-synthetic United States region is permitted")
    return regions


def get_region(region_id) -> Region:
    region = load_regions()[0]
    if region.id != region_id:
        raise ValueError(f"US-only pipeline: use --region {region.id}; rejected {region_id!r}")
    return region


def load_outages():
    from pipeline.common.io import read_yaml

    return read_yaml(paths.config_file("outages.yaml"))["outages"]


def region_centroid(region):
    if region.bbox is None:
        raise ValueError("The local US exports supply no country polygon or centroid; do not invent one")
    west, south, east, north = region.bbox
    return (west + east) / 2, (south + north) / 2
