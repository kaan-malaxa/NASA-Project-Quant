"""`python -m pipeline.export` (no flags): regions.json, methods.json, manifest.json (contracts 6.1, 6.13, 6.14).

Order of work:
1. copy each real region's calibration.json from data/harmonized/<region>/ after schema validation;
2. classify every region folder under web/public/data as real, sample-only or MIXED; refuse on MIXED
   before writing anything else; leave sample-only folders out of regions.json (with a warning);
3. write regions.json and methods.json; 4. write manifest.json last, over every file on disk.
Paths, config and I/O are passed in through `Inputs` (built from pipeline.common in __main__).
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
from collections.abc import Callable
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

import pandas as pd
import pyarrow.parquet as pq
import yaml

from pipeline.common import paths, provenance, publication
from pipeline.export.audit import write_audit
from pipeline.export.check import (
    has_sample_kind,
    load_json_strict,
    load_registry,
    region_file_name,
    schema_errors,
    validator_for,
)

METHODS_TEXT = Path(__file__).resolve().parent / "methods_text.yaml"
REGION_FILES = ["weekly", "monthly", "daily", "climatology", "season", "trend", "ruler", "nowcast", "hex",
                "calibration", "outline", "period_index", "spatial_index"]
OPTIONAL_FILES = ["cells_monthly", "downloads", "hotspots_recent"]
TOP_LEVEL = {"regions.json", "methods.json", "manifest.json", "numbers_audit.md"}
SENSOR_TEXT = {"aqua": "MODIS Aqua", "terra": "MODIS Terra", "snpp": "S-NPP VIIRS", "noaa20": "NOAA-20 VIIRS"}
PASS_TEXT = {"D": "daytime", "N": "night-time"}


class AssembleError(RuntimeError):
    """A condition under which export must not write anything."""


@dataclass
class Inputs:
    web_dir: Path
    regions: list[dict[str, Any]]          # id, name, country, bbox, centroid, fire_type, story, synthetic
    science: dict[str, Any]
    science_sha256: str
    harmonized_dir: Callable[[str], Path]
    eyesight_dir: Callable[[str], Path]
    grid_dir: Callable[[str], Path]
    raw_dir: Callable[[str], Path]
    clean_dir: Callable[[str], Path]
    read_parquet: Callable[[Path, str], pd.DataFrame]
    write_json: Callable[[Any, Path], None]
    header: dict[str, Any]
    methods_text: Path = METHODS_TEXT
    scope: list[str] | None = None


def _read_json(path: Path) -> Any:
    return load_json_strict(path)


# ------------------------------------------------------------------ sample / real classification
def file_origin(path: Path) -> str | None:
    """'sample', 'real', or None for files that carry no marks (CSV, unmarked GeoJSON)."""
    if path.suffix not in (".json", ".geojson"):
        return None
    doc = _read_json(path)
    if has_sample_kind(doc) or (isinstance(doc, dict) and doc.get("code_version") == "sample"):
        return "sample"
    if isinstance(doc, dict) and "code_version" in doc:
        return "real"
    return None


def classify_regions(inp: Inputs) -> dict[str, str]:
    """{folder: 'real' | 'sample' | 'empty'}; raises AssembleError if any folder mixes sample and real."""
    out, mixed = {}, []
    for folder in sorted(p for p in inp.web_dir.iterdir() if p.is_dir()):
        origins: dict[str, list[str]] = {"sample": [], "real": []}
        for f in sorted(file for file in folder.iterdir() if file.is_file()):
            if f.name.startswith("."):
                continue
            # calibration.json is about to be replaced by the harmonized copy
            if (f.name == "calibration.json" and (inp.scope is None or folder.name in inp.scope)
                and (inp.harmonized_dir(folder.name) / "calibration.json").is_file()):
                continue
            origin = file_origin(f)
            if origin:
                origins[origin].append(f.name)
        if origins["sample"] and origins["real"]:
            mixed.append(f"{folder.name}: sample {origins['sample']} with real {origins['real']}")
        out[folder.name] = "real" if origins["real"] else "sample" if origins["sample"] else "empty"
    if mixed:
        raise AssembleError("sample files are mixed with real ones; delete the sample files or regenerate "
                            "them with `python -m pipeline.stats`: " + " | ".join(mixed))
    return out


# ------------------------------------------------------------------ calibration copy and regions.json
def copy_calibration(inp: Inputs, region: str, registry: Any) -> None:
    src = inp.harmonized_dir(region) / "calibration.json"
    if not src.is_file():
        return
    errors = schema_errors(_read_json(src), validator_for("calibration", registry))
    if errors:
        raise AssembleError(f"{src} does not match contracts/calibration.schema.json: {'; '.join(errors)}")
    (inp.web_dir / region / "calibration.json").write_bytes(src.read_bytes())


def region_record(inp: Inputs, meta: dict[str, Any]) -> dict[str, Any]:
    rid = meta["id"]
    cells_path = inp.grid_dir(rid) / "region_cells.parquet"
    daily_path = inp.harmonized_dir(rid) / "daily.parquet"
    for p in (cells_path, daily_path):
        if not p.is_file():
            raise AssembleError(f"region {rid} has real web files but {p} is missing")
    cells = inp.read_parquet(cells_path, "region_cells")
    schema_meta = pq.read_schema(cells_path).metadata or {}
    membership = schema_meta.get(b"membership", b"").decode("utf-8")
    if membership not in ("polygon", "bbox"):
        raise AssembleError(f"{cells_path} has no file metadata 'membership' = polygon|bbox (contracts 5.5)")
    daily = inp.read_parquet(daily_path, "daily")
    last_day = pd.to_datetime(daily["local_day"]).max().date().isoformat()
    folder = inp.web_dir / rid

    def present(ids: list[str]) -> list[str]:
        return [f for f in ids if (folder / region_file_name(f)).is_file()]

    return {"id": rid, "name": meta["name"], "country": meta["country"], "bbox": list(meta["bbox"]),
            "centroid": list(meta["centroid"]), "fire_type": meta["fire_type"], "story": meta["story"],
            "n_cells_r6": int(cells["h3_r6"].nunique()), "membership": membership, "last_data_day": last_day,
            "synthetic": bool(meta["synthetic"]), "files": present(REGION_FILES),
            "optional_files": present(OPTIONAL_FILES)}


# ------------------------------------------------------------------ planted truth (V7)
_TOKEN = re.compile(r"([^.\[\]]+)|\[(\d+)\]")


def resolve(doc: Any, path: str) -> Any:
    """Follow a path like 'windows[1].peak_week' or 'k_annual.snpp.k'. Raises KeyError/IndexError."""
    node = doc
    for name, index in _TOKEN.findall(path):
        node = node[int(index)] if index else node[name]
    return node


def _planted_value(e: dict[str, Any], truth: dict[str, Any], inp: Inputs, count_res: int) -> float:
    q, src = e["quantity"], e["source_file"]
    locations = {"calibration.json": inp.harmonized_dir("synthland"), "curve.json": inp.eyesight_dir("synthland"),
                 "validation_t2.json": inp.eyesight_dir("synthland"), "trend.json": inp.web_dir / "synthland",
                 "season.json": inp.web_dir / "synthland", "coverage.parquet": inp.grid_dir("synthland"),
                 "celldays.parquet": inp.grid_dir("synthland")}
    path = locations[src] / src
    if not path.is_file():
        raise FileNotFoundError(path)
    if q == "k_month_snpp_max_abs_err":
        fitted = {row["month"]: row["k"] for row in _read_json(path)["k"]["snpp"]}
        return max(abs(fitted[t["month"]] - t["k"]) for t in e["truth_by_month"])
    if q == "reliability_err":
        rows = [r for r in _read_json(path)["validation"] if r["test"] == "reliability_err"]
        if not rows:
            raise KeyError("no reliability_err row in validation_t2.json")
        return float(rows[0]["value"])
    if q == "aqua_outage_days_missing":
        cov = inp.read_parquet(path, "coverage")
        aqua = cov[cov["sensor"] == "aqua"]
        uncovered = {d.isoformat() for d, c in zip(pd.to_datetime(aqua["local_day"]).dt.date, aqua["covered"]) if not c}
        return float(sum(d in uncovered for d in truth["planted"]["outage_days"]["aqua"]))
    if q == "static_rows_surviving":
        import h3

        cells = {h3.latlng_to_cell(p["lat"], p["lon"], count_res) for p in truth["planted"]["static_points"]}
        return float(inp.read_parquet(path, "celldays")["h3_r6"].isin(cells).sum())
    return float(resolve(_read_json(path), e["path"]))


def planted_truth(inp: Inputs) -> list[dict[str, Any]]:
    truth_path = inp.raw_dir("synthland") / "truth.json"
    if not truth_path.is_file():
        return []
    truth = _read_json(truth_path)
    rows = []
    for e in truth["expected"]:
        try:
            got: float | None = _planted_value(e, truth, inp, inp.science["grid"]["count_res"])
        except (FileNotFoundError, KeyError, IndexError, TypeError, ValueError):
            got = None
        ok = got is not None and abs(got - e["truth"]) <= e["tolerance"]
        rows.append({"quantity": e["quantity"], "truth": e["truth"], "recovered": got,
                     "tolerance": e["tolerance"], "pass": ok})
    return rows


# ------------------------------------------------------------------ methods.json
def methods_doc(inp: Inputs, region_ids: list[str]) -> dict[str, Any]:
    sci = inp.science
    validation, drift, eyesight, inputs, filters = [], [], [], [], []
    for rid in region_ids:
        t1 = inp.harmonized_dir(rid) / "validation_t1.json"
        if t1.is_file():
            doc = _read_json(t1)
            validation += doc.get("validation", [])
            drift += [{"region": rid, **row} for row in doc.get("drift", [])]
        t2 = inp.eyesight_dir(rid) / "validation_t2.json"
        if t2.is_file():
            validation += _read_json(t2).get("validation", [])
        curve = inp.eyesight_dir(rid) / "curve.json"
        eyesight.append({**_read_json(curve), "region": rid} if curve.is_file() else {"region": rid, "status": "absent"})
        manifest = inp.raw_dir(rid) / "MANIFEST.json"
        if manifest.is_file():
            inputs += [{"source": m["source"], "region": rid, "rows": m["rows"], "first_date": m["first_date"],
                        "last_date": m["last_date"], "downloaded": m["downloaded_at"], "via": m["via"]}
                       for m in _read_json(manifest)]
        flog = inp.clean_dir(rid) / "filter_log.json"
        if flog.is_file():
            filters += [{"region": rid, **row} for row in _read_json(flog)]
    text = yaml.safe_load(inp.methods_text.read_text(encoding="utf-8")) or {}
    sources = [s for s in text.get("sources") or [] if s.get("url") and s.get("checked")]
    reference = sci["reference"]
    return {**inp.header,
            "decisions": {"reference": f"{SENSOR_TEXT[reference['sensor']]}, {PASS_TEXT[reference['pass']]}",
                          "count_resolution": sci["grid"]["count_res"],
                          "aqua_trusted_through": sci["eras"]["aqua_trusted_through"],
                          "snpp_through": sci["eras"]["snpp_through"],
                          "baseline_years": sci["climatology"]["baseline_years"],
                          "science_yaml_sha256": inp.science_sha256,
                          "configuration_sha256": provenance.configuration_fingerprint()},
            "validation": validation, "drift": drift, "eyesight": eyesight, "planted_truth": planted_truth(inp),
            "inputs": inputs, "filters": filters, "sources": sources,
            "limitations": list(text.get("limitations") or []), "ai_use": text.get("ai_use") or ""}


# ------------------------------------------------------------------ manifest.json
def _kinds(node: Any, acc: set[str]) -> set[str]:
    if isinstance(node, dict):
        if isinstance(node.get("kind"), str):
            acc.add(node["kind"])
        for v in node.values():
            _kinds(v, acc)
    elif isinstance(node, list):
        for v in node:
            _kinds(v, acc)
    return acc


def manifest_doc(inp: Inputs) -> dict[str, Any]:
    files, contains_sample = [], False
    for path in sorted(p for p in inp.web_dir.rglob("*") if p.is_file() and not p.name.startswith(".")):
        rel = path.relative_to(inp.web_dir).as_posix()
        if rel == "manifest.json":
            continue
        data = path.read_bytes()
        kinds: list[str] = []
        if path.suffix in (".json", ".geojson"):
            doc = load_json_strict(path)
            kinds = sorted(_kinds(doc, set()))
            contains_sample |= "sample" in kinds or (isinstance(doc, dict) and doc.get("code_version") == "sample")
        files.append({"path": rel, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "kinds": kinds})
    return {**inp.header, "contains_sample": contains_sample, "files": files}


# ------------------------------------------------------------------ entry point
def _assemble(inp: Inputs) -> list[str]:
    """Write regions.json, methods.json, manifest.json. Returns warnings. Raises AssembleError."""
    inp.web_dir.mkdir(parents=True, exist_ok=True)
    registry = load_registry()
    known = {r["id"]: r for r in inp.regions}
    old_regions = _read_json(inp.web_dir / "regions.json") if (inp.web_dir / "regions.json").is_file() else None
    old_methods = _read_json(inp.web_dir / "methods.json") if (inp.web_dir / "methods.json").is_file() else None
    scope = inp.scope
    if scope is not None:
        for rid in scope:
            if rid not in known:
                raise AssembleError(f"Unknown export region: {rid}")
            provenance.verify_stage(rid, "stats")
            source = paths.stats_dir(rid)
            if not source.is_dir():
                raise AssembleError(f"Missing staged statistics for {rid}; run pipeline.stats --region {rid}")
            target = (inp.web_dir / rid).resolve()
            if not target.is_relative_to(inp.web_dir.resolve()):
                raise AssembleError("Region path escapes staged publication")
            if target.is_dir():
                shutil.rmtree(target)
            shutil.copytree(source, target)
    status = classify_regions(inp)                       # refuses on mixed folders before any write
    warnings = []
    real = [rid for rid in known if status.get(rid) == "real"]
    for folder, st in status.items():
        if st == "sample":
            warnings.append(f"web/public/data/{folder}/ holds only SAMPLE files: left out of regions.json; "
                            f"delete the folder or run the pipeline for it")
        elif folder not in known:
            warnings.append(f"web/public/data/{folder}/ is not a region in regions.yaml: left out of regions.json")
    if not real:
        raise AssembleError("no region folder holds real pipeline output; nothing to assemble")
    preserved = [rid for rid in real if scope is not None and rid not in scope]
    if preserved:
        if (old_methods is None or old_methods["decisions"]["science_yaml_sha256"] != inp.science_sha256
            or old_methods["decisions"].get("configuration_sha256") != provenance.configuration_fingerprint()):
            raise AssembleError("Preserved regions use incompatible science configuration; rebuild every published region")
        # The original publication is validated before any staged replacements are installed.
        if old_regions is None:
            raise AssembleError("Missing manifest for preserved regions; rebuild every published region")
    rebuilt = [rid for rid in real if rid not in preserved]
    for rid in rebuilt:
        copy_calibration(inp, rid, registry)
    previous = {r["id"]: r for r in old_regions["regions"]} if old_regions else {}
    records = [previous[rid] if rid in preserved and rid in previous else region_record(inp, known[rid]) for rid in real]
    regions = {**inp.header, "regions": records,
               "configuration": {"anomaly": inp.science["anomaly"], "timebins": inp.science["timebins"],
                                 "eras": inp.science["eras"], "baseline_years": inp.science["climatology"]["baseline_years"]}}
    methods = methods_doc(inp, rebuilt)
    if preserved:
        for key in ("validation", "drift", "eyesight", "inputs", "filters"):
            methods[key] += [row for row in old_methods[key] if row.get("region") in preserved]
        if "synthland" in preserved:
            methods["planted_truth"] = old_methods["planted_truth"]
    for name, doc in (("regions", regions), ("methods", methods)):
        errors = schema_errors(json.loads(json.dumps(doc)), validator_for(name, registry))
        if errors:
            raise AssembleError(f"{name}.json would not match its contract: {'; '.join(errors)}")
    inp.write_json(regions, inp.web_dir / "regions.json")
    inp.write_json(methods, inp.web_dir / "methods.json")
    write_audit(inp.web_dir)                             # before the manifest, so its hash is listed
    inp.write_json(manifest_doc(inp), inp.web_dir / "manifest.json")
    return warnings


def assemble(inp: Inputs) -> list[str]:
    """Stage and validate the complete proposed publication; manifest replacement commits it last."""
    from pipeline.export.check import run_check

    if inp.scope is not None and (inp.web_dir / "manifest.json").is_file():
        # Validate preserved assets against their original hashes, never against a regenerated manifest.
        errors = [result.line() for result in run_check(inp.web_dir) if not result.ok]
        if errors:
            raise AssembleError("Published assets failed validation; rebuild all regions: " + " | ".join(errors[:3]))
    with publication.proposal(inp.web_dir) as staged:
        warnings = _assemble(replace(inp, web_dir=staged))
        errors = [result.line() for result in run_check(staged) if not result.ok]
        if errors:
            raise AssembleError("Proposed publication failed validation: " + " | ".join(errors[:3]))
        publication.publish_tree(staged, inp.web_dir)
    return warnings
