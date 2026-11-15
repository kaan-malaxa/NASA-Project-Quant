"""Shared UTF-8 IO, typed Parquet, and US input provenance verification."""

import hashlib
import json
import math
import os
import subprocess
import tempfile
from contextlib import contextmanager
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import yaml

from pipeline.common import paths

SCHEMAS = {
    "celldays": pa.schema(
        [
            ("sensor", pa.string()),
            ("local_day", pa.date32()),
            ("daynight", pa.string()),
            ("h3_r6", pa.string()),
            ("h3_r5", pa.string()),
            ("n_det", pa.int32()),
            ("frp_sum", pa.float32()),
            ("frp_max", pa.float32()),
        ]
    ),
    "coverage": pa.schema(
        [
            ("sensor", pa.string()),
            ("local_day", pa.date32()),
            ("covered", pa.bool_()),
            ("reason", pa.string()),
        ]
    ),
    "hotspot_counts_daily": pa.schema(
        [("sensor", pa.string()), ("local_day", pa.date32()), ("n_det_all", pa.int32())]
    ),
    "daily": pa.schema(
        [
            ("local_day", pa.date32()),
            ("series", pa.string()),
            ("value", pa.float64()),
            ("lo", pa.float64()),
            ("hi", pa.float64()),
            ("kind", pa.string()),
            ("source", pa.string()),
            ("covered", pa.bool_()),
        ]
    ),
    "annual_bootstrap": pa.schema(
        [("replicate", pa.int32()), ("year", pa.int32()), ("harmonized", pa.float64())]
    ),
    "naive_annual": pa.schema(
        [
            ("year", pa.int32()),
            ("modis_count", pa.float64()),
            ("snpp_count", pa.float64()),
            ("modis_covered_frac", pa.float64()),
            ("snpp_covered_frac", pa.float64()),
        ]
    ),
    "raw_daily_counts": pa.schema(
        [("sensor", pa.string()), ("utc_date", pa.date32()), ("n_raw_rows", pa.int64())]
    ),
    "static_mask": pa.schema([("h3_r8", pa.string())]),
}


def read_yaml(path):
    with Path(path).open(encoding="utf-8") as stream:
        return yaml.safe_load(stream)


def read_json(path):
    with Path(path).open(encoding="utf-8") as stream:
        return json.load(stream)


def _rounded(value):
    if isinstance(value, dict):
        return {str(key): _rounded(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_rounded(item) for item in value]
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("JSON numbers must be finite; use null for missing")
        return round(value, 3)
    return value


def write_json(obj, path):
    path = Path(path)
    content = json.dumps(_rounded(obj), sort_keys=True, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(content)
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def write_parquet(df, path, schema_name):
    path = Path(path)
    schema = SCHEMAS[schema_name]
    if set(df.columns) != set(schema.names):
        raise ValueError(f"{schema_name} columns must be {schema.names}, got {list(df.columns)}")
    table = pa.Table.from_pandas(df[schema.names], schema=schema, preserve_index=False, safe=True)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
    try:
        pq.write_table(table, temporary, compression="zstd")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def read_parquet(path, schema_name):
    table = pq.read_table(path)
    expected = SCHEMAS[schema_name]
    if not table.schema.equals(expected, check_metadata=False):
        raise ValueError(f"{path}: schema does not match {schema_name}")
    return table.to_pandas()


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def source_inventory():
    root = paths.source_root().resolve()
    return [
        {"file": path.relative_to(root).as_posix(), "sha256": sha256(path), "bytes": path.stat().st_size}
        for files in paths.source_files().values()
        for path in files
    ]


def verify_us_inputs(region):
    from pipeline.common.config import get_region

    get_region(region)
    record = read_json(paths.provenance(region))
    if record["region"] != region or record["source_files"] != source_inventory():
        raise ValueError("US source inventory changed or provenance is not US; rerun US ingestion")
    for name in ("science.yaml", "outages.yaml"):
        if record["config_sha256"][name] != sha256(paths.config_file(name)):
            raise ValueError(f"{name} changed; rerun US ingestion")
    required = {
        paths.celldays(region),
        paths.coverage(region),
        paths.grid_dir(region) / "hotspot_counts_daily.parquet",
    }
    attested = {paths.data_root() / output["file"] for output in record["outputs"]}
    if not required.issubset(attested):
        raise ValueError("US provenance does not attest every harmonization input")
    for output in record["outputs"]:
        path = paths.data_root() / output["file"]
        if not path.resolve().is_relative_to(paths.data_root().resolve()) or sha256(path) != output["sha256"]:
            raise ValueError("US derived input changed or escaped its root; rerun US ingestion")


def code_version():
    result = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=paths.project_root(),
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout.strip() if result.returncode == 0 else "unknown"


@contextmanager
def us_database():
    """A bounded, disposable local DuckDB workspace; never downloads data."""
    import duckdb

    directory = paths.temporary_dir()
    directory.mkdir(parents=True, exist_ok=True)
    handle, name = tempfile.mkstemp(suffix=".duckdb", dir=directory)
    os.close(handle)
    path = Path(name)
    path.unlink()
    connection = duckdb.connect(str(path))
    try:
        connection.execute("SET memory_limit='4GB'")
        yield connection
    finally:
        connection.close()
        path.unlink(missing_ok=True)
        path.with_suffix(".duckdb.wal").unlink(missing_ok=True)


def register_us_csvs(connection):
    """Only allow-listed, locally resolved US exports enter the SQL stage."""
    for family, files in paths.source_files().items():
        instrument = "modis" if family == "modis" else "viirs"
        relation = connection.read_csv(
            [path.resolve().as_posix() for path in files], all_varchar=True, union_by_name=True, filename=True
        )
        relation.project(f"*, '{instrument}' AS family, '{family}' AS file_family").create_view(
            f"raw_{family}"
        )
    connection.execute(
        "CREATE VIEW us_csvs AS SELECT * FROM raw_modis UNION ALL BY NAME SELECT * FROM raw_snpp UNION ALL BY NAME SELECT * FROM raw_noaa20"
    )
