"""Validate every file under web/public/data against contracts/*.schema.json (contracts section 6).

Used by `python -m pipeline.export --check`. Prints one line per file ("OK <path>" or
"FAIL <path>: <reason>") and returns a non-zero exit code if any file fails.
"""

from __future__ import annotations

import csv
import hashlib
import json
import os
from concurrent.futures import ProcessPoolExecutor
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
TOP_LEVEL_SCHEMAS = {"regions.json": "regions", "methods.json": "methods", "manifest.json": "manifest",
                     "world.json": "world"}
REGION_SCHEMAS = {
    "weekly", "monthly", "daily", "climatology", "season", "trend", "ruler",
    "nowcast", "hex", "calibration", "downloads", "period_index", "spatial_index", "claim_check",
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
    if validator.schema.get("title") == "spatial":
        from pipeline.export.spatial_check import errors
        return errors(instance, validator, MAX_ERRORS_SHOWN)
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
def load_json_strict(path: Path) -> Any:
    """Shared strict parsing rejects duplicate keys and all non-finite values."""
    from pipeline.common.io import read_json
    return read_json(path)


def semantic_errors(doc):
    errors = []

    def visit(node):
        if isinstance(node, dict):
            if "lo" in node and "hi" in node and not isinstance(node["lo"], list):
                lo, hi = node["lo"], node["hi"]
                if (lo is None) != (hi is None) or (lo is not None and lo > hi):
                    errors.append("uncertainty bounds must be both null or finite and ordered")
            if "kind" in node and "value" in node and not isinstance(node["value"], list):
                if node["kind"] == "missing" and node["value"] is not None:
                    errors.append("missing kind has a non-null value")
                if node["value"] is None and node["kind"] not in ("missing", "sample"):
                    errors.append("null value must carry missing kind")
            for key, value in node.items():
                if node is doc and key in ("monthly", "weekly") and "monthly_bins" in node:
                    continue  # numeric tuples are checked below; there are no nested kind objects
                visit(value)
        elif isinstance(node, list):
            for value in node:
                visit(value)

    visit(doc)
    if not isinstance(doc, dict):
        return errors
    for key in ("monthly", "weekly"):
        if isinstance(doc.get(key), list) and doc.get("schema_version") == "2.0":
            seen = set()
            bins = {(row["series"], row["month" if key == "monthly" else "week"]): row
                    for row in doc[key + "_bins"]}
            if len(bins) != len(doc[key + "_bins"]):
                errors.append("duplicate spatial bin")
            for row in doc[key]:
                if len(row) not in (4, 6):
                    errors.append("spatial rows need value or value/lo/hi")
                    continue
                cell, slot, series, value = row[:4]
                identity = (cell, slot, series)
                if identity in seen:
                    errors.append("duplicate spatial contribution")
                seen.add(identity)
                if not 0 <= cell < len(doc["cells"]) or not 0 <= series < len(doc["series"]):
                    errors.append("spatial index outside cells or series")
                if (series, slot) not in bins or bins[series, slot]["value"] is None:
                    errors.append("spatial contribution has no covered bin")
                if len(row) == 6 and row[4] > row[5]:
                    errors.append("spatial bounds are inverted")
    rows = doc.get("rows", [])
    if rows and isinstance(rows[0], dict):
        keys = [(row.get("series"), row.get("year"), row.get("week", row.get("month"))) for row in rows]
        if len(keys) != len(set(keys)):
            errors.append("duplicate series/year/period key")
    if "n_days" in doc and "series" in doc:
        n = doc["n_days"]
        from datetime import date
        start = date.fromisoformat(doc["start"])
        for name, series in doc["series"].items():
            for key in ("value", "lo", "hi"):
                if key in series and len(series[key]) != n:
                    errors.append(f"daily {name}.{key} length is not n_days")
            marked = [None] * n
            for run in doc["kind_runs"]:
                if run["series"] != name:
                    continue
                first = (date.fromisoformat(run["from"]) - start).days
                last = (date.fromisoformat(run["to"]) - start).days
                if first < 0 or last >= n or last < first:
                    errors.append("daily kind run outside array")
                    continue
                for index in range(first, last + 1):
                    if marked[index] is not None:
                        errors.append("overlapping daily kind runs")
                    marked[index] = run["kind"]
            if any(kind is None for kind in marked):
                errors.append(f"daily kind runs do not cover {name}")
            if len(series["value"]) == n:
                for i, value in enumerate(series["value"]):
                    if marked[i] == "missing" and value is not None:
                        errors.append("daily missing run contains a value")
                    if "lo" in series and "hi" in series and len(series["lo"]) == len(series["hi"]) == n:
                        lo, hi = series["lo"][i], series["hi"][i]
                        if value is None and (lo is not None or hi is not None):
                            errors.append("missing daily value has non-null bounds")
                        if lo is not None and hi is not None and lo > hi:
                            errors.append("daily bounds are inverted")
    return list(dict.fromkeys(errors))[:MAX_ERRORS_SHOWN]


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
        schema_name = "outline"
    elif len(parts) == 3 and parts[1] in ("periods", "spatial") and path.suffix == ".json":
        schema_name = "period" if parts[1] == "periods" else "spatial"
    else:
        result.errors.append("unexpected file: no contract covers this path")
        return result, None

    try:
        doc = load_json_strict(path)
    except (ValueError, UnicodeDecodeError, OSError, EOFError) as exc:
        result.errors.append(f"not valid JSON: {exc}")
        return result, None

    if schema_name is None:
        result.errors += check_outline(doc)
    else:
        result.errors += schema_errors(doc, validator_for(schema_name, registry, schema_dir))
    result.has_sample = has_sample_kind(doc)
    if not result.errors:
        try:
            result.errors += semantic_errors(doc)
        except (ValueError, TypeError, KeyError, IndexError) as error:
            result.errors.append(f"invalid semantic data: {error}")
    return result, doc


_WORKER: dict[str, Any] = {}


def _cross_file_doc(rel: str) -> bool:
    """Only these parsed documents are needed after the per-file pass; the rest are dropped to bound memory."""
    return rel in ("regions.json", "manifest.json") or rel.endswith(("period_index.json", "spatial_index.json"))


def _init_worker(schema_dir: Path) -> None:
    _WORKER["registry"], _WORKER["schema_dir"] = load_registry(schema_dir), schema_dir


def _check_task(item: tuple[str, str]) -> tuple[FileResult, Any]:
    path, rel = item
    result, doc = _check_one(Path(path), rel, _WORKER["registry"], _WORKER["schema_dir"])
    return result, doc if _cross_file_doc(rel) else None


def check_workers() -> int:
    """Parallel per-file validation for large publications (PROMETHEUS_TORCH_CHECK_WORKERS overrides)."""
    return max(1, int(os.environ.get("PROMETHEUS_TORCH_CHECK_WORKERS", min(16, os.cpu_count() or 1))))


def run_check(data_dir: Path, schema_dir: Path = SCHEMA_DIR) -> list[FileResult]:
    """Check every file under data_dir. Returns one result per file, sorted by path."""
    if not data_dir.is_dir():
        return [FileResult(str(data_dir), [f"data folder {data_dir} does not exist"])]

    results: dict[str, FileResult] = {}
    docs: dict[str, Any] = {}
    items = [(str(path), path.relative_to(data_dir).as_posix())
             for path in sorted(p for p in data_dir.rglob("*") if p.is_file())
             if not path.name.startswith(".")]  # .gitkeep and editor files
    workers = check_workers()
    if workers > 1 and len(items) > 400:
        with ProcessPoolExecutor(max_workers=workers, initializer=_init_worker, initargs=(schema_dir,)) as pool:
            checked = list(pool.map(_check_task, items, chunksize=16))
    else:
        _init_worker(schema_dir)
        checked = [_check_task(item) for item in items]
    for (_, rel), (result, doc) in zip(items, checked):
        results[rel] = result
        if doc is not None:
            docs[rel] = doc

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
    if not isinstance(manifest, dict):
        results.setdefault("manifest.json", FileResult("manifest.json")).errors.append("publication manifest is missing")
    elif results["manifest.json"].ok:
        entries = manifest.get("files", [])
        listed = [entry["path"] for entry in entries]
        if len(listed) != len(set(listed)):
            results["manifest.json"].errors.append("duplicate manifest path")
        actual = set(results) - {"manifest.json"}
        if actual != set(listed):
            results["manifest.json"].errors.append("manifest paths do not match the published files")
        for entry in entries:
            file = (data_dir / entry["path"]).resolve()
            if not file.is_relative_to(data_dir.resolve()) or not file.is_file():
                results["manifest.json"].errors.append(f"missing or unsafe referenced file: {entry['path']}")
                continue
            data = file.read_bytes()
            if len(data) != entry["bytes"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
                results["manifest.json"].errors.append(f"hash or byte count mismatch: {entry['path']}")
    for relative, doc in docs.items():
        if not isinstance(doc, dict) or not results[relative].ok or not relative.endswith(("period_index.json", "spatial_index.json")):
            continue
        for entry in doc.get("periods", doc.get("years", [])):
            file = (data_dir / Path(relative).parent / entry["path"]).resolve()
            if not file.is_relative_to((data_dir / Path(relative).parent).resolve()) or not file.is_file():
                results[relative].errors.append(f"missing or unsafe index reference {entry['path']}")
            elif len(file.read_bytes()) != entry["bytes"] or hashlib.sha256(file.read_bytes()).hexdigest() != entry["sha256"]:
                results[relative].errors.append(f"index hash or byte count mismatch: {entry['path']}")
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
