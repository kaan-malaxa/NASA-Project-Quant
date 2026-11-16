"""`python -m pipeline.export.claim_check --region R [--region R2 ...]`: <region>/claim_check.json (SD-20).

The file holds what the browser Claim Checker needs and nothing it would have to invent:
- `config`: the SD-20 constants copied from science.yaml (pipeline.common.claim_check.export_config);
- `templates` / `notes`: the fixed sentences (pipeline.common.claim_check);
- `annual`: the published trend.json annual rows (harmonized and naive per year), unchanged;
- `examples`: example claims and their reference verdicts (SD-20 example chips);
- `replicates`: R3's calibration replicates (annual_bootstrap.parquet, SD-06/SD-14), only for the years whose
  totals differ between replicates. Every other year must equal trend.json in every replicate; this is checked.

Called by assemble for every rebuilt region that has replicates. Run on its own, it adds the file to an
existing publication: it lists `claim_check` in regions.json, then rewrites numbers_audit.md and manifest.json
(the manifest last), and validates the proposed publication before installing it.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path
from typing import Any

import pandas as pd

from pipeline.common.claim_check import NOTES, TEMPLATES, example_claims, export_config

REPLICATE_SOURCE = "annual_bootstrap.parquet (R3 calibration replicates, SD-06)"


class ClaimCheckError(RuntimeError):
    """The inputs disagree; nothing is written."""


def _r3(x: float) -> float:
    return round(float(x), 3)


def varying_replicates(trend: dict[str, Any], bootstrap: pd.DataFrame) -> dict[str, Any]:
    """{source, n, years, values}: replicate totals for the years that differ between replicates.

    Raises ClaimCheckError when a constant year disagrees with trend.json (the files are from different runs).
    """
    y0, y1 = trend["years"]
    published = {int(row["year"]): row["harmonized"] for row in trend["annual"]}
    frame = bootstrap[(bootstrap["year"] >= y0) & (bootstrap["year"] <= y1)]
    table = frame.pivot(index="replicate", columns="year", values="harmonized").sort_index()
    years, columns = [], []
    for year in sorted(int(y) for y in table.columns):
        values = [None if pd.isna(v) else _r3(v) for v in table[year].tolist()]
        present = [v for v in values if v is not None]
        expected = published.get(year)
        if not present:
            if expected is not None:
                raise ClaimCheckError(f"{year}: trend.json has {expected} but every replicate is missing")
            continue
        if len(present) != len(values):
            raise ClaimCheckError(f"{year}: some replicates are missing and others are not")
        if expected is None:
            raise ClaimCheckError(f"{year}: trend.json is missing but the replicates have values")
        if min(present) == max(present):
            if present[0] != _r3(expected):
                raise ClaimCheckError(f"{year}: replicates give {present[0]}, trend.json gives {expected}")
            continue
        years.append(year)
        columns.append(values)
    n = len(table.index)
    return {"source": REPLICATE_SOURCE, "n": n if years else 0, "years": years,
            "values": [[col[r] for col in columns] for r in range(n)] if years else []}


def build_doc(trend: dict[str, Any], bootstrap: pd.DataFrame, science: dict[str, Any], header: dict[str, Any],
              region: str) -> dict[str, Any]:
    config = export_config(science)
    if list(trend["years"]) != config["record_years"]:
        raise ClaimCheckError(f"trend.json covers {trend['years']}, science.yaml trend.years is "
                              f"{config['record_years']}")
    annual = [{k: row[k] for k in ("year", "harmonized", "lo", "hi", "kind", "naive_count", "naive_source")}
              for row in trend["annual"]]
    for row in annual:
        for key in ("harmonized", "lo", "hi", "naive_count"):
            if row[key] is not None and not math.isfinite(row[key]):
                raise ClaimCheckError(f"{row['year']}: non-finite {key}")
    doc = {**header, "region": region, "config": config, "templates": dict(TEMPLATES), "notes": dict(NOTES),
           "naive_unit": "hotspots", "annual": annual, "replicates": varying_replicates(trend, bootstrap)}
    doc["examples"] = example_claims(json.loads(json.dumps(doc)))  # computed on the values as published
    return doc


def write_region(web_dir: Path, region: str, bootstrap_path: Path, science: dict[str, Any],
                 header: dict[str, Any], read_parquet, write_json, read_json) -> bool:
    """Write web_dir/<region>/claim_check.json. False (nothing written) when the region has no replicates."""
    trend_path = web_dir / region / "trend.json"
    if not bootstrap_path.is_file() or not trend_path.is_file():
        return False
    doc = build_doc(read_json(trend_path), read_parquet(bootstrap_path, "annual_bootstrap"), science, header, region)
    write_json(doc, web_dir / region / "claim_check.json")
    return True


def list_in_regions(regions_doc: dict[str, Any], region_ids: list[str], optional_order: list[str]) -> None:
    """Add claim_check to optional_files of these regions, keeping the assemble order."""
    for record in regions_doc["regions"]:
        if record["id"] in region_ids and "claim_check" not in record["optional_files"]:
            wanted = set(record["optional_files"]) | {"claim_check"}
            known = [f for f in optional_order if f in wanted]
            record["optional_files"] = known + sorted(wanted - set(known))


def main(argv: list[str] | None = None) -> int:
    from pipeline.common import config, io, paths, publication
    from pipeline.export.__main__ import generated_at
    from pipeline.export.assemble import OPTIONAL_FILES, manifest_doc
    from pipeline.export.audit import write_audit
    from pipeline.export.check import run_check

    parser = argparse.ArgumentParser(prog="python -m pipeline.export.claim_check")
    parser.add_argument("--region", action="append", required=True, help="region id; repeat for several")
    args = parser.parse_args(argv)
    t0 = time.monotonic()
    science = config.load_science()
    header = {"schema_version": "1.0", "generated_at": generated_at(), "code_version": io.code_version()}
    web_dir = paths.web_data_dir()
    regions_path = web_dir / "regions.json"
    if not regions_path.is_file():
        print(f"FAIL export.claim_check: {regions_path} does not exist; run `python -m pipeline.export` first")
        return 1
    published = {r["id"] for r in io.read_json(regions_path)["regions"]}
    unknown = [r for r in args.region if r not in published]
    if unknown:
        print(f"FAIL export.claim_check: not in regions.json: {', '.join(unknown)}")
        return 1
    try:
        with publication.proposal(web_dir) as staged:
            written = [rid for rid in args.region
                       if write_region(staged, rid, paths.annual_bootstrap(rid), science, header,
                                       io.read_parquet, io.write_json, io.read_json)]
            missing = sorted(set(args.region) - set(written))
            if missing:
                raise ClaimCheckError(f"no trend.json or annual_bootstrap.parquet for {', '.join(missing)}")
            regions_doc = io.read_json(staged / "regions.json")
            list_in_regions(regions_doc, written, OPTIONAL_FILES)
            io.write_json(regions_doc, staged / "regions.json")
            write_audit(staged)

            class _Inp:  # manifest_doc reads only these two attributes
                pass
            inp = _Inp()
            inp.web_dir, inp.header = staged, header
            io.write_json(manifest_doc(inp), staged / "manifest.json")
            errors = [result.line() for result in run_check(staged) if not result.ok]
            if errors:
                raise ClaimCheckError("proposed publication failed validation: " + " | ".join(errors[:3]))
            publication.publish_tree(staged, web_dir)
    except (ClaimCheckError, OSError, ValueError, KeyError) as error:
        print(f"FAIL export.claim_check: {error}")
        return 1
    print(f"OK export.claim_check {','.join(written)} rows={len(written)} seconds={time.monotonic() - t0:.1f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
