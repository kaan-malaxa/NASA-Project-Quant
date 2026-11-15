"""All project and intermediate file locations."""
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def data_root() -> Path:
    return Path(os.environ.get("PROMETHEUS_TORCH_DATA_ROOT", PROJECT_ROOT / "data")).expanduser().resolve()


def source_data_root() -> Path:
    """The sole hotspot input directory; output overrides cannot change it."""
    return (PROJECT_ROOT / "data").resolve()


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
    base = Path(os.environ.get("PROMETHEUS_TORCH_WEB_DATA_DIR", PROJECT_ROOT / "web" / "public" / "data")).resolve()
    return base if region is None else base / region


def stage_provenance(region, stage) -> Path:
    return data_root() / "provenance" / region / f"{stage}.json"


def stats_dir(region) -> Path:
    return data_root() / "stats" / region


def nrt_coverage(region) -> Path:
    return grid_dir(region) / "nrt_coverage.json"


def local_nrt_coverage(region) -> Path:
    return raw_dir(region) / "nrt_input_coverage.json"


def heldout_predictions(region, stage) -> Path:
    return (harmonized_dir(region) if stage == "harmonize" else eyesight_dir(region)) / "heldout_weekly.parquet"


def config_file(name: str) -> Path:
    return PROJECT_ROOT / "pipeline" / "config" / name


def env_file() -> Path:
    return PROJECT_ROOT / ".env"


def tmp_dir() -> Path:
    return data_root() / "tmp"


def exports_dir() -> Path:
    return data_root() / "exports"


def hotspot_archive(region, sensor, year) -> Path:
    return exports_dir() / f"hotspots_{region}_{sensor}_{year}.csv.gz"


def raw_csv(region, prefix, via, year) -> Path:
    return raw_dir(region) / f"{prefix}_{via}_{year}.csv"


def region_polygon(region) -> Path:
    return config_file("regions") / f"{region}.geojson"


def natural_earth_source() -> Path:
    return tmp_dir() / "ne_10m_admin_1_states_provinces.geojson"


def country_csv_candidates(product, year, country) -> list[Path]:
    if country != "United_States":
        raise ValueError("Only existing United_States country CSVs are allowed")
    folders = {
        "modis": "MODIS_data", "viirs-snpp": "VIIRS-SNPP_data", "viirs-jpss1": "VIIRS-JPSS_data",
    }
    filename = f"{product}_{year}_{country}.csv"
    return [source_data_root() / folders[product] / filename]


def source_country_files() -> list[tuple[str, Path]]:
    result = []
    for product, folder in (
        ("modis", "MODIS_data"), ("viirs-snpp", "VIIRS-SNPP_data"), ("viirs-jpss1", "VIIRS-JPSS_data"),
    ):
        for path in sorted((source_data_root() / folder).glob(f"{product}_????_United_States.csv")):
            if not path.resolve().is_relative_to(source_data_root()):
                raise ValueError("US source file resolves outside the designated source directory")
            if path.name.split("_")[1].isdigit():
                result.append((product, path))
    return result


def profile_report(region) -> Path:
    return PROJECT_ROOT / "docs" / f"profile_{region}.md"


def detections(region, sensor) -> Path:
    return clean_dir(region) / f"detections_{sensor}.parquet"


def celldays(region) -> Path:
    return grid_dir(region) / "celldays.parquet"


def repro_inputs(region, project_root=None, derived_root=None) -> tuple[Path, Path]:
    root = Path(project_root).expanduser().resolve() if project_root is not None else PROJECT_ROOT
    derived = (
        Path(derived_root).expanduser().resolve() if derived_root is not None
        else data_root() if project_root is None else root / "data"
    )
    return root / "web" / "public" / "data", derived / "grid" / region / "celldays.parquet"


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


def hotspots_recent(region) -> Path:
    return web_data_dir(region) / "hotspots_recent.csv"


def staged_hotspots_recent(region) -> Path:
    return grid_dir(region) / "hotspots_recent.csv"


def nrt_snapshot(region, utc_date) -> Path:
    return raw_dir(region) / f"nrt_viirs_noaa20_{utc_date}.csv"


def local_nrt_inputs(region) -> list[Path]:
    result = set()
    for root, recursive in ((source_data_root(), True), (raw_dir(region), False)):
        files = root.rglob("nrt_viirs_noaa20_*.csv") if recursive else root.glob("nrt_viirs_noaa20_*.csv")
        for path in files:
            if not path.resolve().is_relative_to(root.resolve()):
                raise ValueError("NRT source resolves outside its allowed local directory")
            result.add(path.resolve())
    return sorted(result)


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
