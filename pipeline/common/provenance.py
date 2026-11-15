"""Mandatory fingerprints for file handoffs between independent stages."""
import hashlib
import json
from pathlib import Path

from pipeline.common import config, io, paths


def configuration_inputs(region):
    meta = config.get_region(region)
    catalog = paths.world_regions_config() if meta.source == "firms_world" else paths.config_file("regions.yaml")
    files = [paths.config_file("science.yaml"), paths.config_file("outages.yaml"), catalog]
    if meta.polygon:
        files.append(paths.PROJECT_ROOT / meta.polygon)
    return files


def configuration_fingerprint():
    """Shared science/outage/core-region configuration. World regions are attested per stage instead,
    so adding or regenerating world countries never invalidates an existing publication."""
    files = {file for region in config.load_core_regions() for file in configuration_inputs(region.id)}
    facts = {file.relative_to(paths.PROJECT_ROOT).as_posix(): io.sha256(file) for file in sorted(files)}
    return hashlib.sha256(json.dumps(facts, sort_keys=True).encode("utf-8")).hexdigest()


def raw_inputs(region):
    """Original source bytes and staged bytes, never a silently refreshed cache."""
    manifest = paths.manifest(region)
    entries = io.read_json(manifest)
    meta = config.get_region(region)
    files = [manifest] if meta.synthetic else []
    if not entries:
        raise ValueError(f"Empty raw manifest for {region}; rerun ingest")
    for entry in entries:
        if meta.synthetic and entry.get("via") != "synth":
            raise ValueError("Simulated inputs require simulator provenance")
        if not meta.synthetic and entry.get("via") not in ("country", "local"):
            raise ValueError("Real inputs require a verified local source")
        if not meta.synthetic and entry.get("via") == "local" and not (
            entry.get("source") == "VIIRS_NOAA20_NRT" and entry.get("file", "").startswith("nrt_viirs_noaa20_")
        ):
            raise ValueError("Local provenance is reserved for verified NOAA-20 recent inputs")
        name = entry["file"]
        if Path(name).name != name:
            raise ValueError("Raw manifest contains a path outside its region")
        if not meta.synthetic and entry.get("via") == "local":
            continue  # recent inputs have their own attestation; they do not change historical cleaning
        staged = paths.raw_dir(region) / name
        if not staged.is_file() or io.sha256(staged) != entry["sha256"]:
            raise ValueError(f"Raw provenance mismatch: {staged}; rerun ingest")
        files.append(staged)
        if not meta.synthetic and entry.get("via") == "country":
            source = (paths.source_data_root() / entry["source"]).resolve()
            if not source.is_relative_to(paths.source_data_root()) or not source.is_file():
                raise ValueError("Raw source is missing or outside the supplied source directory")
            files.append(source)
    return files


def _fingerprints(files):
    return {str(Path(file).resolve()): io.sha256(file) for file in sorted(set(map(Path, files)))}


def _manifest_entries(region, recent=False):
    entries = io.read_json(paths.manifest(region))
    return sorted((row for row in entries if (row.get("via") == "local") == recent), key=lambda row: row["file"])


def record_stage(region, stage, inputs, outputs, upstream=()):
    """Record only after every output has been written successfully."""
    doc = {"version": 1, "region": region, "stage": stage, "upstream": list(upstream),
           "inputs": _fingerprints([*configuration_inputs(region), *inputs]),
           "outputs": _fingerprints(outputs)}
    if stage == "nowcast" or (stage == "clean" and not config.get_region(region).synthetic):
        doc["manifest_entries"] = _manifest_entries(region, recent=stage == "nowcast")
    io.write_json(doc, paths.stage_provenance(region, stage))


def verify_stage(region, stage):
    """Reject missing attestations, changed configuration, inputs, or derived outputs."""
    stamp = paths.stage_provenance(region, stage)
    if not stamp.is_file():
        raise ValueError(f"Missing {stage} provenance for {region}; rerun pipeline.run --region {region}")
    doc = io.read_json(stamp)
    if doc.get("version") != 1 or doc.get("region") != region or doc.get("stage") != stage:
        raise ValueError(f"Invalid provenance: {stamp}")
    expected_config = {str(file.resolve()) for file in configuration_inputs(region)}
    if not expected_config <= doc["inputs"].keys():
        raise ValueError(f"Incomplete configuration provenance: {stamp}; rerun ingest")
    if "manifest_entries" in doc and doc["manifest_entries"] != _manifest_entries(region, recent=stage == "nowcast"):
        raise ValueError(f"Stale {stage} manifest entries for {region}; rerun that stage")
    for group in ("inputs", "outputs"):
        for name, expected in doc[group].items():
            file = Path(name)
            if not file.is_file() or io.sha256(file) != expected:
                raise ValueError(f"Stale {stage} {group}: {file}; rerun pipeline.run --region {region}")
    for upstream in doc["upstream"]:
        verify_stage(region, upstream)
    return doc
