"""`python -m pipeline.stats --region R` (contracts section 3). Owner R1.

Writes weekly, monthly, daily, climatology (B1), trend, ruler (B2), season (B3), nowcast (C1) JSON and
hex.json, outline.geojson, cells_monthly.csv (D1).
Paths, config, Parquet/JSON I/O, the CLI parser and the final log line all come from pipeline.common
(R2, contracts section 10).
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import UTC, datetime
from pathlib import Path


def generated_at() -> str:
    """UTC now, or SOURCE_DATE_EPOCH when set (for byte-identical rebuilds)."""
    epoch = os.environ.get("SOURCE_DATE_EPOCH")
    now = datetime.fromtimestamp(int(epoch), UTC) if epoch else datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%SZ")


def main(argv: list[str] | None = None) -> int:
    import pandas as pd
    from pipeline.common import cli, config, io, log, paths

    from pipeline.stats.calendar import build_calendar_files
    from pipeline.stats.nowcast import build_nowcast
    from pipeline.stats.season import build_season
    from pipeline.stats.spatial import (
        cells_monthly_csv,
        cells_monthly_rows,
        hex_json,
        outline_geojson,
    )
    from pipeline.stats.trend import build_trend_files

    args = cli.stage_parser("stats").parse_args(argv)
    t0 = time.monotonic()
    region = args.region
    hdir = paths.harmonized_dir(region)
    inputs = {"daily": hdir / "daily.parquet", "annual_bootstrap": hdir / "annual_bootstrap.parquet",
              "naive_annual": hdir / "naive_annual.parquet"}
    calibration_path = hdir / "calibration.json"
    gdir = paths.grid_dir(region)
    celldays_path = gdir / "celldays.parquet"
    absent = [str(p) for p in [*inputs.values(), calibration_path, celldays_path] if not p.is_file()]
    if absent:
        print(f"FAIL stats {region}: missing {', '.join(absent)} (run ingest and harmonize first)")
        return 1
    tables = {name: io.read_parquet(path, name) for name, path in inputs.items()}
    calibration = json.loads(calibration_path.read_text(encoding="utf-8"))
    celldays = io.read_parquet(celldays_path, "celldays")
    nrt_path, coverage_path = gdir / "celldays_nrt.parquet", gdir / "coverage.parquet"
    # no NRT file yet -> an empty table, which gives status "unavailable"
    nrt = io.read_parquet(nrt_path, "celldays_nrt") if nrt_path.is_file() else pd.DataFrame(
        columns=["sensor", "local_day", "daynight", "fetched_at"])
    coverage = io.read_parquet(coverage_path, "coverage") if coverage_path.is_file() else None
    science = config.load_science()
    meta = config.get_region(region)
    header = {"schema_version": "1.0", "generated_at": generated_at(), "code_version": io.code_version()}
    docs = build_calendar_files(tables["daily"], region, science, header)
    docs |= build_trend_files(tables["daily"], tables["annual_bootstrap"], tables["naive_annual"], region,
                              meta.name, science, header)
    docs["season"] = build_season(docs["climatology"], tables["daily"], region, science, header)
    docs["nowcast"] = build_nowcast(nrt, calibration, tables["daily"], coverage, region, meta.name,
                                    config.region_centroid(region)[0], meta.bbox[0], science, header)
    docs["hex"] = hex_json(celldays, docs["season"]["critical_weeks"], region, science, header)
    polygon = None
    if meta.polygon:                                      # path relative to the repo root (contracts 4.1)
        polygon_path = Path(__file__).resolve().parents[2] / meta.polygon
        if not polygon_path.is_file():
            print(f"FAIL stats {region}: polygon {polygon_path} named in regions.yaml does not exist")
            return 1
        polygon = json.loads(polygon_path.read_text(encoding="utf-8"))
    outline = outline_geojson({"id": region, "name": meta.name, "bbox": meta.bbox}, polygon)
    daily = tables["daily"]
    out = paths.web_data_dir(region)
    out.mkdir(parents=True, exist_ok=True)
    for name, doc in docs.items():
        io.write_json(doc, out / f"{name}.json")
    io.write_json(outline, out / "outline.geojson")
    (out / "cells_monthly.csv").write_text(cells_monthly_csv(cells_monthly_rows(celldays, science)),
                                           encoding="utf-8", newline="")
    log.finish("stats", region, len(daily), t0)
    return 0


if __name__ == "__main__":
    sys.exit(main())
