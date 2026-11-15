"""Canonical local US sources; output-root overrides never redirect raw inputs."""

import os
from pathlib import Path


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def source_root() -> Path:
    return project_root().parent / "data"


def data_root() -> Path:
    value = os.environ.get("FIREROSETTA_DATA_ROOT")
    return Path(value).expanduser().resolve() if value else source_root()


def config_file(name: str) -> Path:
    if name not in ("science.yaml", "regions.yaml", "outages.yaml"):
        raise ValueError(f"Unknown config: {name}")
    return project_root() / "pipeline" / "config" / name


def _region_dir(stage: str, region: str) -> Path:
    from pipeline.common.config import get_region

    get_region(region)
    return data_root() / stage / region


def raw_dir(region):
    return _region_dir("raw", region)


def clean_dir(region):
    return _region_dir("clean", region)


def grid_dir(region):
    return _region_dir("grid", region)


def harmonized_dir(region):
    return _region_dir("harmonized", region)


def eyesight_dir(region):
    return _region_dir("eyesight", region)


def web_data_dir(region=None):
    if region is not None:
        from pipeline.common.config import get_region

        get_region(region)
    base = project_root() / "web" / "public" / "data"
    return base / region if region else base


def detections(region, sensor):
    if sensor not in ("aqua", "terra", "snpp", "noaa20"):
        raise ValueError(f"Unknown sensor: {sensor}")
    return clean_dir(region) / f"detections_{sensor}.parquet"


def celldays(region):
    return grid_dir(region) / "celldays.parquet"


def coverage(region):
    return grid_dir(region) / "coverage.parquet"


def provenance(region):
    return grid_dir(region) / "input_provenance.json"


def temporary_dir() -> Path:
    return data_root() / "tmp"


def source_files() -> dict[str, list[Path]]:
    """Resolve only the three observed US country-export filename families."""
    import re

    families = {
        "modis": ("MODIS_data", "modis"),
        "snpp": ("VIIRS-SNPP_data", "viirs-snpp"),
        "noaa20": ("VIIRS-JPSS_data", "viirs-jpss1"),
    }
    root = source_root().resolve()
    result = {}
    for family, (folder, prefix) in families.items():
        pattern = re.compile(rf"{re.escape(prefix)}_\d{{4}}_United_States\.csv")
        files = sorted(path for path in (root / folder).glob("*.csv") if pattern.fullmatch(path.name))
        if not files:
            raise FileNotFoundError(f"No local US {family} CSVs in {root / folder}")
        for path in files:
            if not path.resolve().is_relative_to(root):
                raise ValueError(f"US source escapes workspace data/: {path}")
            if path.resolve() != path.absolute():
                raise ValueError(f"US source files must not alias other files through symlinks: {path}")
        result[family] = files
    return result
