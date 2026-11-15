"""python -m pipeline.synth --region synthland [--seed 7] [--size tiny|full]"""

from __future__ import annotations

import hashlib
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

from . import compat
from . import planted as P
from .sensors import observe_all
from .truth import build_truth
from .world import simulate_fires, static_points
from .write_firms import FILE_NAMES, format_rows, sort_detections, write_csv

STAGE = "synth"


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def run(region: str, seed: int, size: str, out_dir: Path) -> dict:
    """Simulate and write the three FIRMS CSVs, truth.json and MANIFEST.json. Returns row counts."""
    bbox, synthetic = compat.region_bbox(region)
    if not synthetic:
        raise ValueError(f"region {region!r} is not synthetic; the simulator only writes synthetic regions")

    fires = simulate_fires(seed, size, bbox)
    points = static_points(seed, bbox)
    det = {s: observe_all(fires, points, s, seed) for s in ("aqua", "terra", "snpp", "noaa20")}

    # Sort once here so the internal detections stay aligned row by row with the written CSV rows
    # (format_rows sorts again; the sort is stable, so that is a no-op).
    sorted_det = {
        "modis": sort_detections(pd.concat([det["aqua"], det["terra"]], ignore_index=True)),
        "snpp": sort_detections(det["snpp"]),
        "noaa20": sort_detections(det["noaa20"]),
    }
    families = {"modis": "modis", "snpp": "viirs", "noaa20": "viirs"}
    tables = {k: format_rows(d, families[k], seed) for k, d in sorted_det.items()}
    counts = {"modis_rows": len(tables["modis"]), "viirs_snpp_rows": len(tables["snpp"]),
              "viirs_noaa20_rows": len(tables["noaa20"])}

    out_dir.mkdir(parents=True, exist_ok=True)
    now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    manifest = []
    for key, rows in tables.items():
        path = out_dir / FILE_NAMES[key]
        write_csv(rows, path)
        manifest.append({"file": path.name, "source": f"synth:{key}", "via": "synth", "downloaded_at": now,
                         "rows": len(rows), "sha256": _sha256(path),
                         "first_date": rows["acq_date"].min() if len(rows) else None,
                         "last_date": rows["acq_date"].max() if len(rows) else None})

    written = {k: (sorted_det[k], tables[k]) for k in tables}
    compat.write_json(build_truth(seed, size, bbox, fires, points, written, counts), out_dir / "truth.json")
    compat.write_json(manifest, out_dir / "MANIFEST.json")
    return counts


def main(argv: list[str] | None = None) -> int:
    parser = compat.stage_parser(STAGE)
    science = compat.load_science()
    default_seed = int(science["seed"]) if science and "seed" in science else P.FALLBACK_SEED
    parser.add_argument("--seed", type=int, default=default_seed)
    parser.add_argument("--size", choices=sorted(P.BASE_FIRES_AT_PEAK), default="tiny")
    args = parser.parse_args(argv)

    log = compat.get_logger(STAGE)
    log.setLevel(getattr(args, "log_level", "INFO").upper())
    if science is None:
        log.warning("science.yaml not found; seed defaults to %d", P.FALLBACK_SEED)

    compat.set_data_root(getattr(args, "data_root", None))
    t0 = time.perf_counter()  # the clock pipeline.common.log.finish subtracts from
    try:
        counts = run(args.region, args.seed, args.size, compat.raw_dir(args.region))
    except ValueError as exc:
        print(f"synth failed: {exc}", file=sys.stderr)
        return 2
    log.info("seed=%d size=%s %s", args.seed, args.size, counts)
    compat.finish(STAGE, args.region, sum(counts.values()), t0)
    return 0


if __name__ == "__main__":
    sys.exit(main())
