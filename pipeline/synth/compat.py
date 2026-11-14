"""Thin adapter over ``pipeline.common`` (owned by R2, contracts section 10).

Every call goes to ``pipeline.common`` when it is importable. Until R2's scaffold lands, a minimal local
fallback with the same behaviour is used and a warning is logged. Delete the fallbacks once common exists.
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
import subprocess
import time
from datetime import date
from pathlib import Path

from . import planted as P

try:  # pragma: no cover - depends on R2's scaffold
    from pipeline.common import cli as _cli
    from pipeline.common import config as _config
    from pipeline.common import io as _io
    from pipeline.common import log as _log
    from pipeline.common import paths as _paths
    from pipeline.common import timebins as _timebins

    HAVE_COMMON = True
except ImportError:
    HAVE_COMMON = False

_FALLBACK_LOGGERS: set[str] = set()


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


def stage_parser(stage: str) -> argparse.ArgumentParser:
    if HAVE_COMMON:
        return _cli.stage_parser(stage)
    p = argparse.ArgumentParser(prog=f"python -m pipeline.{stage}")
    p.add_argument("--region", required=True)
    p.add_argument("--data-root", default=None)
    p.add_argument("--pass", dest="pass_", default="D", choices=["D", "N"])
    p.add_argument("--log-level", default="INFO")
    return p


def set_data_root(data_root: str | Path | None) -> None:
    """Contracts section 2: FIREROSETTA_DATA_ROOT overrides the default ``data/`` folder."""
    if data_root is not None:
        os.environ["FIREROSETTA_DATA_ROOT"] = str(data_root)


def raw_dir(region: str) -> Path:
    if HAVE_COMMON:
        return _paths.raw_dir(region)
    root = Path(os.environ.get("FIREROSETTA_DATA_ROOT", "data"))
    return root / "raw" / region


def load_science() -> dict | None:
    if HAVE_COMMON:
        return _config.load_science()
    path = Path("pipeline") / "config" / "science.yaml"
    if not path.exists():
        return None
    import yaml  # listed in the project's tools via config loading

    with path.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)


# Temporary copy of the keys the simulator's truth code needs, from contracts section 4.2. Used only when
# science.yaml is not in the repo yet; science.yaml always wins once it exists.
_FALLBACK_SCIENCE = {
    "seed": 7,
    "grid": {"count_res": 6},
    "filters": {"modis_min_confidence": 30, "viirs_keep": ["n", "h"]},
    "eras": {"aqua_trusted_through": "2022-12-31"},
    "tier1": {"n0": 50, "snpp_fit": ["2013-01-01", "2022-12-31"], "n20_min_fit_years": 3},
    "tier2": {"fit": ["2013-01-01", "2022-12-31"], "frp_floor_mw": 0.1},
    "trend": {"years": [2003, 2025]},
}


def science() -> tuple[dict, bool]:
    """(science config, True if it came from science.yaml)."""
    loaded = load_science()
    if loaded is not None:
        return loaded, True
    return _FALLBACK_SCIENCE, False


def region_bbox(region: str) -> tuple[tuple[float, float, float, float], bool]:
    """Return ((W, S, E, N), synthetic_flag)."""
    if HAVE_COMMON:
        r = _config.get_region(region)
        return tuple(float(v) for v in r.bbox), bool(r.synthetic)
    if region not in P.FALLBACK_BBOX:
        raise ValueError(f"unknown synthetic region {region!r} (regions.yaml not available)")
    return P.FALLBACK_BBOX[region], True


def week_of_year(d: date) -> int:
    if HAVE_COMMON:
        return _timebins.week_of_year(d)
    doy = d.timetuple().tm_yday
    return min(52, (doy - 1) // 7 + 1)


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


def code_version() -> str:
    if HAVE_COMMON:
        return _io.code_version()
    try:
        out = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=True)
        return out.stdout.strip() or "unknown"
    except (OSError, subprocess.CalledProcessError):
        return "unknown"
