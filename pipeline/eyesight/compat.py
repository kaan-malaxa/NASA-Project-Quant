"""Thin adapter over ``pipeline.common`` (owned by R2, contracts section 10) for the eyesight stage.

Stages do not import each other, so this is separate from pipeline/synth/compat.py. Calls go to
``pipeline.common`` when it is importable; until R2's scaffold and R3's science.yaml land, a fallback with the
same behaviour (and the contract section 4.2 values) is used. Delete the fallbacks once common exists.
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
import time
from pathlib import Path

import numpy as np
import pandas as pd

try:  # pragma: no cover - depends on R2's scaffold
    from pipeline.common import cli as _cli
    from pipeline.common import config as _config
    from pipeline.common import io as _io
    from pipeline.common import log as _log
    from pipeline.common import paths as _paths

    HAVE_COMMON = True
except ImportError:
    HAVE_COMMON = False

# Temporary copy of contracts section 4.2 (keys the eyesight stage reads).
_FALLBACK_SCIENCE = {
    "seed": 7,
    "reference": {"sensor": "aqua", "pass": "D"},
    "eras": {"record_start": "2003-01-01", "aqua_trusted_through": "2022-12-31", "snpp_through": "2025-12-31",
             "snpp_first_day": "2012-01-20"},
    "tier2": {"fit": ["2013-01-01", "2022-12-31"], "frp_floor_mw": 0.1, "bootstrap_b": 200,
              "max_band_at_10mw": 0.30, "max_reliability_err": 0.05, "max_wape_ratio_vs_t1": 1.10},
}
_FALLBACK_LOGGERS: set[str] = set()


def science() -> tuple[dict, bool]:
    """(science config, True if it came from science.yaml)."""
    if HAVE_COMMON:
        return _config.load_science(), True
    path = Path("pipeline") / "config" / "science.yaml"
    if path.exists():
        import yaml

        with path.open(encoding="utf-8") as fh:
            return yaml.safe_load(fh), True
    return _FALLBACK_SCIENCE, False


# ------------------------------------------------------------------ paths (contracts section 5)
def set_data_root(data_root: str | Path | None) -> None:
    if data_root is not None:
        os.environ["FIREROSETTA_DATA_ROOT"] = str(data_root)


def _root() -> Path:
    return Path(os.environ.get("FIREROSETTA_DATA_ROOT", "data"))


def raw_dir(region: str) -> Path:
    return _paths.raw_dir(region) if HAVE_COMMON else _root() / "raw" / region


def grid_dir(region: str) -> Path:
    return _paths.grid_dir(region) if HAVE_COMMON else _root() / "grid" / region


def eyesight_dir(region: str) -> Path:
    return _paths.eyesight_dir(region) if HAVE_COMMON else _root() / "eyesight" / region


def celldays_path(region: str) -> Path:
    return _paths.celldays(region) if HAVE_COMMON else grid_dir(region) / "celldays.parquet"


def coverage_path(region: str) -> Path:
    return _paths.coverage(region) if HAVE_COMMON else grid_dir(region) / "coverage.parquet"


def harmonized_dir(region: str) -> Path:
    return _paths.harmonized_dir(region) if HAVE_COMMON else _root() / "harmonized" / region


def harmonized_daily_path(region: str) -> Path:
    return harmonized_dir(region) / "daily.parquet"  # contracts 5.8


def calibration_path(region: str) -> Path:
    return harmonized_dir(region) / "calibration.json"  # contracts 5.10


def daily_t2_path(region: str) -> Path:
    return eyesight_dir(region) / "daily_t2.parquet"  # contracts 5.13


def validation_t1_path(region: str) -> Path:
    return harmonized_dir(region) / "validation_t1.json"  # contracts 5.11


def validation_t2_path(region: str) -> Path:
    return eyesight_dir(region) / "validation_t2.json"  # contracts 5.14


# ------------------------------------------------------------------ time bins (SD-08)
def aggregate_weekly(daily: pd.DataFrame, value_cols) -> pd.DataFrame:
    """Weekly values per SD-08 via pipeline.common.timebins.aggregate. Input: one row per local_day, value columns
    null where the day is not covered. Fallback (until common exists): week = min(52, (doy-1)//7 + 1); value =
    sum over covered days * 7 / covered days; missing when fewer than 5 covered days."""
    if HAVE_COMMON:  # pragma: no cover
        from pipeline.common import timebins as _tb

        return _tb.aggregate(daily, "week", value_cols=tuple(value_cols))
    d = daily.copy()
    ts = pd.to_datetime(d["local_day"])
    d["year"] = ts.dt.year
    d["week"] = ((ts.dt.day_of_year - 1) // 7 + 1).clip(upper=52)
    cols = list(value_cols)
    covered = d[cols[0]].notna()
    g = d.assign(_cov=covered).groupby(["year", "week"])
    out = g[cols].sum(min_count=1)
    out["n_covered"] = g["_cov"].sum()
    out["n_days"] = g.size()
    scale = 7.0 / out["n_covered"].where(out["n_covered"] > 0)
    for c in cols:
        out[c] = out[c] * scale
    out["missing"] = out["n_covered"] < 5
    out.loc[out["missing"], cols] = np.nan
    return out.reset_index()


# ------------------------------------------------------------------ file IO
def read_json(path: Path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def read_parquet(path: Path, schema_name: str) -> pd.DataFrame:
    if HAVE_COMMON:
        return _io.read_parquet(path, schema_name)
    import duckdb

    with duckdb.connect() as con:
        return con.execute("SELECT * FROM read_parquet(?)", [str(path)]).df()


def write_parquet(df: pd.DataFrame, path: Path, schema_name: str) -> None:
    if HAVE_COMMON:
        _io.write_parquet(df, path, schema_name)
        return
    import duckdb

    path.parent.mkdir(parents=True, exist_ok=True)
    with duckdb.connect() as con:
        con.register("df", df)
        con.execute(f"COPY (SELECT * FROM df) TO '{path.as_posix()}' (FORMAT parquet, COMPRESSION zstd)")


def _round3(obj):
    if isinstance(obj, float):
        if not math.isfinite(obj):
            raise ValueError("NaN or infinite value in JSON output")
        return round(obj, 3)
    if isinstance(obj, dict):
        return {k: _round3(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_round3(v) for v in obj]
    return obj


def write_json(obj, path: Path) -> None:
    if HAVE_COMMON:
        _io.write_json(obj, path)
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(_round3(obj), sort_keys=True, ensure_ascii=False, allow_nan=False, indent=1)
    path.write_text(text + "\n", encoding="utf-8", newline="\n")


# ------------------------------------------------------------------ CLI and logging
def stage_parser(stage: str) -> argparse.ArgumentParser:
    if HAVE_COMMON:
        return _cli.stage_parser(stage)
    p = argparse.ArgumentParser(prog=f"python -m pipeline.{stage}")
    p.add_argument("--region", required=True)
    p.add_argument("--data-root", default=None)
    p.add_argument("--pass", dest="pass_", default="D", choices=["D", "N"])
    p.add_argument("--log-level", default="INFO")
    return p


def get_logger(stage: str) -> logging.Logger:
    if HAVE_COMMON:
        return _log.get_logger(stage)
    logger = logging.getLogger(f"pipeline.{stage}")
    if stage not in _FALLBACK_LOGGERS:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        _FALLBACK_LOGGERS.add(stage)
    return logger


def finish(stage: str, region: str, rows: int, t0: float) -> None:
    if HAVE_COMMON:
        _log.finish(stage, region, rows, t0)
        return
    print(f"OK {stage} {region} rows={rows} seconds={time.time() - t0:.1f}")
