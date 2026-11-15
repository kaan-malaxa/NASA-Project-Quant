"""Validate every file under web/public/data against contracts/*.schema.json (contracts section 6).

Used by `python -m pipeline.export --check`. Prints one line per file ("OK <path>" or
"FAIL <path>: <reason>") and returns a non-zero exit code if any file fails.
"""

from __future__ import annotations

import csv
import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_DIR = REPO_ROOT / "contracts"

# Contracts 6.12: exact CSV headers.
CSV_HEADERS: dict[str, list[str]] = {
    "cells_monthly.csv": ["h3_r5", "ym", "aqua", "viirs"],
    "hotspots_recent.csv": [
        "latitude", "longitude", "acq_date", "acq_time", "satellite",
        "confidence", "frp", "daynight", "local_day", "h3_r6",
    ],
}
TOP_LEVEL_SCHEMAS = {"regions.json": "regions", "methods.json": "methods", "manifest.json": "manifest"}
REGION_SCHEMAS = {
    "weekly", "monthly", "daily", "climatology", "season", "trend", "ruler",
    "nowcast", "hex", "calibration", "downloads",
}
# Files that live in web/public/data but have no schema and need no check beyond existing.
NO_SCHEMA_FILES = {"numbers_audit.md"}
NON_FINITE_TEXT = {"nan", "+nan", "-nan", "inf", "+inf", "-inf", "infinity", "+infinity", "-infinity"}
MAX_ERRORS_SHOWN = 3


def default_data_dir() -> Path:
    """web/public/data, from pipeline.common.paths once R2 provides it."""
    try:
        from pipeline.common.paths import web_data_dir  # type: ignore[import-not-found]
    except ImportError:
        return REPO_ROOT / "web" / "public" / "data"
    return web_data_dir()


def region_file_name(file_id: str) -> str:
    """Map an entry of regions.json "files"/"optional_files" to its file name."""
    if file_id == "outline":
        return "outline.geojson"
    if file_id in ("cells_monthly", "hotspots_recent"):
        return f"{file_id}.csv"
    return f"{file_id}.json"


# ------------------------------------------------------------------ schemas
def load_registry(schema_dir: Path = SCHEMA_DIR) -> Registry:
    resources = []
    for path in sorted(schema_dir.glob("*.schema.json")):
        contents = json.loads(path.read_text(encoding="utf-8"))
        resources.append((path.name, Resource.from_contents(contents, default_specification=DRAFT202012)))
    return Registry().with_resources(resources)


def validator_for(name: str, registry: Registry, schema_dir: Path = SCHEMA_DIR) -> Draft202012Validator:
    schema = json.loads((schema_dir / f"{name}.schema.json").read_text(encoding="utf-8"))
    return Draft202012Validator(schema, registry=registry)


def schema_errors(instance: Any, validator: Draft202012Validator) -> list[str]:
    errors = sorted(validator.iter_errors(instance), key=lambda e: list(e.absolute_path))
    out = []
    for err in errors[:MAX_ERRORS_SHOWN]:
        where = "/".join(str(p) for p in err.absolute_path) or "(root)"
        msg = err.message if len(err.message) <= 160 else err.message[:157] + "..."
        out.append(f"{where}: {msg}")
    if len(errors) > MAX_ERRORS_SHOWN:
        out.append(f"... and {len(errors) - MAX_ERRORS_SHOWN} more schema errors")
    return out


# ------------------------------------------------------------------ readers
def _reject_constant(name: str) -> Any:
    raise ValueError(f"non-finite number {name} is not allowed")


def load_json_strict(path: Path) -> Any:
    """Parse JSON, rejecting NaN, Infinity and -Infinity (Python's json accepts them by default)."""

    def parse_float(text: str) -> float:
        value = float(text)
        if not math.isfinite(value):
            raise ValueError(f"number {text} overflows to infinity")
        return value

    return json.loads(
        path.read_text(encoding="utf-8"),
        parse_constant=_reject_constant,
        parse_float=parse_float,
    )


def has_sample_kind(obj: Any) -> bool:
    """True if any object anywhere in the document has "kind": "sample"."""
    if isinstance(obj, dict):
        if obj.get("kind") == "sample":
            return True
        return any(has_sample_kind(v) for v in obj.values())
    if isinstance(obj, list):
        return any(has_sample_kind(v) for v in obj)
    return False


def check_csv(path: Path, expected_header: list[str]) -> list[str]:
    with path.open(encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if header != expected_header:
            return [f"header {header} does not match contract {expected_header}"]
        for line_no, row in enumerate(reader, start=2):
            if len(row) != len(expected_header):
                return [f"line {line_no}: {len(row)} fields, expected {len(expected_header)}"]
            for col, cell in zip(expected_header, row):
                if cell.strip().lower() in NON_FINITE_TEXT:
                    return [f"line {line_no}, column {col}: non-finite value {cell!r}"]
    return []


def check_outline(doc: Any) -> list[str]:
    if not isinstance(doc, dict) or doc.get("type") != "FeatureCollection":
        return ["outline must be a GeoJSON FeatureCollection"]
    features = doc.get("features")
    if not isinstance(features, list) or len(features) != 1:
        return ["outline must contain exactly one feature"]
    return []


# ------------------------------------------------------------------ main check
@dataclass
class FileResult:
    path: str  # relative to the data dir, with forward slashes
    errors: list[str] = field(default_factory=list)
    has_sample: bool = False

    @property
    def ok(self) -> bool:
        return not self.errors

    def line(self) -> str:
        return f"OK   {self.path}" if self.ok else f"FAIL {self.path}: {'; '.join(self.errors)}"


def _check_one(path: Path, rel: str, registry: Registry, schema_dir: Path) -> tuple[FileResult, Any]:
    result = FileResult(rel)
    name = path.name
    parts = rel.split("/")

    if name in NO_SCHEMA_FILES and len(parts) == 1:
        return result, None
    if name in CSV_HEADERS and len(parts) == 2:
        result.errors += check_csv(path, CSV_HEADERS[name])
        return result, None

    if len(parts) == 1 and name in TOP_LEVEL_SCHEMAS:
        schema_name = TOP_LEVEL_SCHEMAS[name]
    elif len(parts) == 2 and path.suffix == ".json" and path.stem in REGION_SCHEMAS:
        schema_name = path.stem
    elif len(parts) == 2 and name == "outline.geojson":
        schema_name = None
    else:
        result.errors.append("unexpected file: no contract covers this path")
        return result, None

    try:
        doc = load_json_strict(path)
    except (ValueError, UnicodeDecodeError) as exc:
        result.errors.append(f"not valid JSON: {exc}")
        return result, None

    if schema_name is None:
        result.errors += check_outline(doc)
    else:
        result.errors += schema_errors(doc, validator_for(schema_name, registry, schema_dir))
    result.has_sample = has_sample_kind(doc)
    return result, doc


def run_check(data_dir: Path, schema_dir: Path = SCHEMA_DIR) -> list[FileResult]:
    """Check every file under data_dir. Returns one result per file, sorted by path."""
    if not data_dir.is_dir():
        return [FileResult(str(data_dir), [f"data folder {data_dir} does not exist"])]

    registry = load_registry(schema_dir)
    results: dict[str, FileResult] = {}
    docs: dict[str, Any] = {}
    for path in sorted(p for p in data_dir.rglob("*") if p.is_file()):
        rel = path.relative_to(data_dir).as_posix()
        if path.name.startswith("."):
            continue  # .gitkeep and editor files
        results[rel], docs[rel] = _check_one(path, rel, registry, schema_dir)

    # regions.json: every listed file exists for every region.
    if "regions.json" not in results:
        results["regions.json"] = FileResult("regions.json", ["missing: the website cannot start without it"])
    elif results["regions.json"].ok:
        for region in docs["regions.json"]["regions"]:
            listed = region["files"] + region["optional_files"]
            for file_id in listed:
                if not (data_dir / region["id"] / region_file_name(file_id)).is_file():
                    results["regions.json"].errors.append(
                        f"region {region['id']} lists {file_id!r} but "
                        f"{region['id']}/{region_file_name(file_id)} does not exist"
                    )

    # kind "sample" anywhere implies manifest.contains_sample is true.
    manifest = docs.get("manifest.json")
    contains_sample = isinstance(manifest, dict) and manifest.get("contains_sample") is True
    for res in results.values():
        if res.has_sample and not contains_sample:
            res.errors.append('has rows with kind "sample" but manifest.json contains_sample is not true')

    return [results[k] for k in sorted(results)]


def report(results: list[FileResult]) -> int:
    """Print one line per file; return the process exit code."""
    for res in results:
        print(res.line())
    failed = sum(not r.ok for r in results)
    if failed:
        print(f"FAIL export --check: {failed} of {len(results)} files failed")
        return 1
    return 0
