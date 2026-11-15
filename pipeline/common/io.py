"""Contract section 5 schemas and deterministic file IO."""
import hashlib
import json
import math
import subprocess
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from pipeline.common import paths


def _schema(spec):
    types = {
        "str": pa.string(), "f64": pa.float64(), "f32": pa.float32(), "i8": pa.int8(),
        "i32": pa.int32(), "i64": pa.int64(), "date": pa.date32(),
        "ts": pa.timestamp("ns"), "bool": pa.bool_(),
    }
    return pa.schema([
        pa.field(name, types[dtype.rstrip("?")], nullable=dtype.endswith("?"))
        for name, dtype in (entry.split(":") for entry in spec.split())
    ])


SCHEMAS = {
    "heldout_weekly_t1": _schema("year:i32 week:i32 observed:f64? tier1:f64? excluded_year:i32"),
    "heldout_weekly_t2": _schema("year:i32 week:i32 aqua_obs:f64? pred_aqua:f64? excluded_year:i32"),
    "detections": _schema(
        "latitude:f64 longitude:f64 acq_datetime_utc:ts local_day:date daynight:str frp:f32 "
        "confidence_raw:str scan:f32 track:f32 sensor:str product:str type:i8? "
        "h3_r6:str h3_r5:str h3_r8:str in_region:bool"
    ),
    "celldays": _schema(
        "sensor:str local_day:date daynight:str h3_r6:str h3_r5:str n_det:i32 frp_sum:f32 frp_max:f32"
    ),
    "coverage": _schema("sensor:str local_day:date covered:bool reason:str"),
    "hotspot_counts_daily": _schema("sensor:str local_day:date n_det_all:i32"),
    "region_cells": _schema("h3_r6:str h3_r5:str lat:f64 lon:f64"),
    "static_mask": _schema("h3_r8:str"),
    "celldays_nrt": _schema(
        "sensor:str local_day:date daynight:str h3_r6:str h3_r5:str n_det:i32 frp_sum:f32 frp_max:f32 fetched_at:ts"
    ),
    "daily": _schema(
        "local_day:date series:str value:f64? lo:f64? hi:f64? kind:str source:str covered:bool"
    ),
    # A year below the coverage threshold has no total: null, never zero (science rule 3).
    "annual_bootstrap": _schema("replicate:i32 year:i32 harmonized:f64?"),
    "naive_annual": _schema(
        # A year the sensor did not cover has no count: null, never zero (science rule 3).
        "year:i32 modis_count:f64? snpp_count:f64? modis_covered_frac:f64 snpp_covered_frac:f64"
    ),
    "daily_t2": _schema(
        "local_day:date series:str value:f64? lo:f64? hi:f64? kind:str source:str covered:bool"
    ),
    "raw_daily_counts": _schema("sensor:str utc_date:date n_raw_rows:i64"),
    "static_candidates": _schema("h3_r8:str n_static:i32"),
}


def _check(table, schema_name):
    schema = SCHEMAS[schema_name]
    if table.column_names != schema.names:
        raise ValueError(f"{schema_name}: expected columns {schema.names}, got {table.column_names}")
    for field in schema:
        column = table[field.name]
        if column.type != field.type:
            raise ValueError(f"{schema_name}.{field.name}: expected {field.type}, got {column.type}")
        if not field.nullable and column.null_count:
            raise ValueError(f"{schema_name}.{field.name}: nulls are not allowed")
    enums = {
        "sensor": {"aqua", "terra", "snpp", "noaa20", "noaa21"},
        "daynight": {"D", "N"}, "product": {"SP", "NRT"},
        "kind": {"observed", "harmonized", "estimated", "missing", "sample"},
        "reason": {"ok", "before_start", "after_end", "outage_list", "no_raw_rows"},
    }
    for name, allowed in enums.items():
        if name in table.column_names and not set(table[name].to_pylist()) <= allowed:
            raise ValueError(f"{schema_name}.{name}: unknown enum value")
    if schema_name == "region_cells":
        membership = (table.schema.metadata or {}).get(b"membership")
        if membership not in {b"polygon", b"bbox"}:
            raise ValueError("region_cells requires membership metadata: polygon or bbox")
    return schema


def write_parquet(df, path, schema_name: str) -> None:
    table = pa.Table.from_pandas(df, preserve_index=False)
    schema = SCHEMAS[schema_name]
    # Pandas may represent str as large_string and nullable integers as all-null
    # floats. Normalize those representations before validating the file schema.
    for field in schema:
        if field.name not in table.column_names:
            continue
        column = table[field.name]
        if (
            (pa.types.is_string(field.type) and pa.types.is_large_string(column.type))
            or (field.nullable and column.null_count == len(column))
            # Same-kind numeric widths (pandas defaults to int64/float64): a checked cast, which
            # raises on overflow instead of silently changing a value.
            or (pa.types.is_integer(field.type) and pa.types.is_integer(column.type))
            or (pa.types.is_floating(field.type)
                and (pa.types.is_floating(column.type) or pa.types.is_integer(column.type)))
        ):
            table = table.set_column(table.column_names.index(field.name), field, column.cast(field.type))
    metadata = dict(table.schema.metadata or {})
    if schema_name == "region_cells" and "membership" in df.attrs:
        metadata[b"membership"] = df.attrs["membership"].encode("utf-8")
    table = table.replace_schema_metadata(metadata)
    schema = _check(table, schema_name)
    table = table.cast(schema.with_metadata(metadata))
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, path, compression="zstd")


def read_parquet(path, schema_name: str) -> pd.DataFrame:
    table = pq.read_table(path)
    _check(table, schema_name)
    frame = table.to_pandas(types_mapper=pd.ArrowDtype)
    membership = (table.schema.metadata or {}).get(b"membership")
    if membership:
        frame.attrs["membership"] = membership.decode("utf-8")
    return frame


def _rounded(obj):
    if isinstance(obj, float):
        if not math.isfinite(obj):
            raise ValueError("JSON does not permit NaN or infinity")
        return round(obj, 3)
    if isinstance(obj, dict):
        return {key: _rounded(value) for key, value in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_rounded(value) for value in obj]
    return obj


def write_json(obj, path, *, compact=False) -> None:
    # Serialize completely before touching the destination.
    text = json.dumps(_rounded(obj), sort_keys=True, ensure_ascii=False, allow_nan=False,
                      indent=None if compact else 2, separators=(",", ":") if compact else None) + "\n"
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)


def sha256(path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_json(path):
    def unique_object(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"duplicate JSON key {key!r}")
            result[key] = value
        return result

    def finite(text):
        value = float(text)
        if not math.isfinite(value):
            raise ValueError(f"non-finite number {text} is not allowed")
        return value

    with Path(path).open(encoding="utf-8") as handle:
        return json.load(handle, object_pairs_hook=unique_object, parse_float=finite, parse_constant=finite)


def write_figure(figure, path) -> None:
    """Write a matplotlib figure as PNG; a failed render leaves the previous file in place."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    staging = path.with_name(path.name + ".part")
    try:
        figure.savefig(staging, format="png")
        staging.replace(path)
    finally:
        staging.unlink(missing_ok=True)


def code_version() -> str:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], cwd=paths.PROJECT_ROOT,
            capture_output=True, text=True, encoding="utf-8", check=True,
        )
        return result.stdout.strip() or "unknown"
    except (OSError, subprocess.CalledProcessError):
        return "unknown"
