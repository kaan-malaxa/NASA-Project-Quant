"""`python -m pipeline.export [--sample] [--check]` (contracts section 3).

No flag: assemble regions.json, methods.json and manifest.json from real pipeline output.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from datetime import UTC, datetime

from pipeline.export.check import REPO_ROOT, default_data_dir, report, run_check


def generated_at() -> str:
    """UTC now, or SOURCE_DATE_EPOCH when set (for byte-identical rebuilds)."""
    epoch = os.environ.get("SOURCE_DATE_EPOCH")
    now = datetime.fromtimestamp(int(epoch), UTC) if epoch else datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%SZ")


def run_assemble(t0: float) -> int:
    from pipeline.common import config, io, paths
    from pipeline.export.assemble import AssembleError, Inputs, assemble

    regions = []
    for r in config.load_regions():
        regions.append({"id": r.id, "name": r.name, "country": r.country, "bbox": list(r.bbox),
                        "centroid": list(config.region_centroid(r.id)), "fire_type": r.fire_type,
                        "story": r.story, "synthetic": r.synthetic})
    science_yaml = REPO_ROOT / "pipeline" / "config" / "science.yaml"
    inp = Inputs(
        web_dir=paths.web_data_dir(), regions=regions, science=config.load_science(),
        science_sha256=hashlib.sha256(science_yaml.read_bytes()).hexdigest(),
        harmonized_dir=paths.harmonized_dir, eyesight_dir=paths.eyesight_dir, grid_dir=paths.grid_dir,
        raw_dir=paths.raw_dir, clean_dir=paths.clean_dir, read_parquet=io.read_parquet, write_json=io.write_json,
        header={"schema_version": "1.0", "generated_at": generated_at(), "code_version": io.code_version()})
    try:
        warnings = assemble(inp)
    except AssembleError as exc:
        print(f"FAIL export: {exc}")
        return 1
    for w in warnings:
        print(f"WARN export: {w}")
    written = json.loads((inp.web_dir / "regions.json").read_text(encoding="utf-8"))["regions"]
    print(f"OK export all rows={len(written)} seconds={time.monotonic() - t0:.1f}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m pipeline.export")
    parser.add_argument("--sample", action="store_true", help="write the SAMPLE site into web/public/data")
    parser.add_argument("--check", action="store_true", help="validate web/public/data against contracts/")
    args = parser.parse_args(argv)

    t0 = time.monotonic()
    if args.sample:
        from pipeline.export.sample import write_sample

        written = write_sample(default_data_dir())
        print(f"OK export sample rows={len(written)} seconds={time.monotonic() - t0:.1f}")
        if not args.check:
            return 0
    elif not args.check:
        return run_assemble(t0)

    results = run_check(default_data_dir())
    code = report(results)
    if code == 0:
        print(f"OK export all rows={len(results)} seconds={time.monotonic() - t0:.1f}")
    return code


if __name__ == "__main__":
    sys.exit(main())
