"""All project and intermediate file locations."""
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def data_root() -> Path:
    return Path(os.environ.get("FIREROSETTA_DATA_ROOT", PROJECT_ROOT / "data")).expanduser().resolve()


def raw_dir(region) -> Path:
    return data_root() / "raw" / region


def clean_dir(region) -> Path:
    return data_root() / "clean" / region


def grid_dir(region) -> Path:
    return data_root() / "grid" / region


def harmonized_dir(region) -> Path:
    return data_root() / "harmonized" / region


def eyesight_dir(region) -> Path:
    return data_root() / "eyesight" / region


def web_data_dir(region: str | None = None) -> Path:
    base = PROJECT_ROOT / "web" / "public" / "data"
    return base if region is None else base / region


def config_file(name: str) -> Path:
    return PROJECT_ROOT / "pipeline" / "config" / name


def env_file() -> Path:
    return PROJECT_ROOT / ".env"


def tmp_dir() -> Path:
    return data_root() / "tmp"


def raw_csv(region, prefix, via, year) -> Path:
    return raw_dir(region) / f"{prefix}_{via}_{year}.csv"


def region_polygon(region) -> Path:
    return config_file("regions") / f"{region}.geojson"


def natural_earth_source() -> Path:
    return tmp_dir() / "ne_10m_admin_1_states_provinces.geojson"


def country_csv_candidates(product, year, country) -> list[Path]:
    folders = {
        "modis": "MODIS_data", "viirs-snpp": "VIIRS-SNPP_data", "viirs-jpss1": "VIIRS-JPSS_data",
    }
    filename = f"{product}_{year}_{country}.csv"
    roots = dict.fromkeys((data_root(), PROJECT_ROOT.parent / "data"))
    return [root / folders[product] / filename for root in roots]


def detections(region, sensor) -> Path:
    return clean_dir(region) / f"detections_{sensor}.parquet"


def celldays(region) -> Path:
    return grid_dir(region) / "celldays.parquet"


def coverage(region) -> Path:
    return grid_dir(region) / "coverage.parquet"


def hotspot_counts_daily(region) -> Path:
    return grid_dir(region) / "hotspot_counts_daily.parquet"


def region_cells(region) -> Path:
    return grid_dir(region) / "region_cells.parquet"


def static_mask(region) -> Path:
    return grid_dir(region) / "static_mask.parquet"


def celldays_nrt(region) -> Path:
    return grid_dir(region) / "celldays_nrt.parquet"


def daily(region) -> Path:
    return harmonized_dir(region) / "daily.parquet"


def annual_bootstrap(region) -> Path:
    return harmonized_dir(region) / "annual_bootstrap.parquet"


def calibration(region) -> Path:
    return harmonized_dir(region) / "calibration.json"


def validation_t1(region) -> Path:
    return harmonized_dir(region) / "validation_t1.json"


def naive_annual(region) -> Path:
    return harmonized_dir(region) / "naive_annual.parquet"


def curve(region) -> Path:
    return eyesight_dir(region) / "curve.json"


def daily_t2(region) -> Path:
    return eyesight_dir(region) / "daily_t2.parquet"


def validation_t2(region) -> Path:
    return eyesight_dir(region) / "validation_t2.json"


def manifest(region) -> Path:
    return raw_dir(region) / "MANIFEST.json"


def truth(region="synthland") -> Path:
    return raw_dir(region) / "truth.json"


def filter_log(region) -> Path:
    return clean_dir(region) / "filter_log.json"


def raw_daily_counts(region) -> Path:
    return clean_dir(region) / "raw_daily_counts.parquet"


def static_candidates(region) -> Path:
    return clean_dir(region) / "static_candidates.parquet"


def harmonized_figures_dir(region) -> Path:
    return harmonized_dir(region) / "figures"


def eyesight_figures_dir(region) -> Path:
    return eyesight_dir(region) / "figures"
