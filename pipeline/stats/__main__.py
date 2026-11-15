"""`python -m pipeline.stats --region R` (contracts section 3). Owner R1.

Writes weekly, monthly, daily, climatology (B1), trend, ruler (B2), season (B3), nowcast (C1) JSON and
hex.json, outline.geojson, cells_monthly.csv (D1).
Paths, config, Parquet/JSON I/O, the CLI parser and the final log line all come from pipeline.common
(R2, contracts section 10).
"""

from __future__ import annotations

import json
import os
import shutil
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

    from pipeline.common import cli, config, io, log, paths, provenance
    from pipeline.stats.calendar import build_calendar_files
    from pipeline.stats.nowcast import build_nowcast
    from pipeline.stats.periods import write_periods
    from pipeline.stats.season import build_season
    from pipeline.stats.spatial import (
        cells_monthly_csv,
        cells_monthly_rows,
        hex_json,
        outline_geojson,
        yearly_contributions,
    )
    from pipeline.stats.trend import build_trend_files

    args = cli.stage_parser("stats").parse_args(argv)
    t0 = time.perf_counter()          # log.finish measures with perf_counter
    region = args.region
    provenance.verify_stage(region, "harmonize")
    inputs = {"daily": paths.daily(region), "annual_bootstrap": paths.annual_bootstrap(region),
              "naive_annual": paths.naive_annual(region)}
    calibration_path, celldays_path = paths.calibration(region), paths.celldays(region)
    absent = [str(p) for p in [*inputs.values(), calibration_path, celldays_path] if not p.is_file()]
    if absent:
        print(f"FAIL stats {region}: missing {', '.join(absent)} (run ingest and harmonize first)")
        return 1
    tables = {name: io.read_parquet(path, name) for name, path in inputs.items()}
    calibration = json.loads(calibration_path.read_text(encoding="utf-8"))
    celldays = io.read_parquet(celldays_path, "celldays")
    nrt_path, coverage_path = paths.celldays_nrt(region), paths.coverage(region)
    recent = any(file.is_file() for file in (nrt_path, paths.nrt_coverage(region), paths.staged_hotspots_recent(region)))
    if recent:
        provenance.verify_stage(region, "nowcast")
    # no NRT file yet -> an empty table, which gives status "unavailable"
    nrt = io.read_parquet(nrt_path, "celldays_nrt") if nrt_path.is_file() else pd.DataFrame(
        columns=["sensor", "local_day", "daynight", "fetched_at"])
    coverage = io.read_parquet(coverage_path, "coverage") if coverage_path.is_file() else None
    # SD-17: Tier 2 inputs are optional; only a validated curve switches the viirs_equiv lens to them
    curve_path, t2_path = paths.curve(region), paths.daily_t2(region)
    curve = json.loads(curve_path.read_text(encoding="utf-8")) if curve_path.is_file() else None
    if curve is not None:
        provenance.verify_stage(region, "eyesight")
    daily_t2 = io.read_parquet(t2_path, "daily_t2") if t2_path.is_file() else None
    science = config.load_science()
    meta = config.get_region(region)
    header = {"schema_version": "1.0", "generated_at": generated_at(), "code_version": io.code_version()}
    docs = build_calendar_files(tables["daily"], region, science, header, curve=curve, daily_t2=daily_t2)
    # The trend verdict always uses Tier 1 (SD-17): build_trend_files never sees daily_t2.
    docs |= build_trend_files(tables["daily"], tables["annual_bootstrap"], tables["naive_annual"], region,
                              meta.name, science, header)
    docs["season"] = build_season(docs["climatology"], tables["daily"], region, science, header)
    docs["nowcast"] = build_nowcast(nrt, calibration, tables["daily"], coverage, region, meta.name,
                                    config.region_centroid(region)[0], meta.bbox[0], science, header,
                                    metadata=io.read_json(paths.nrt_coverage(region))
                                    if paths.nrt_coverage(region).is_file() else None)
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
    out = paths.stats_dir(region)
    out.mkdir(parents=True, exist_ok=True)
    for name in ("periods", "spatial"):
        generated = (out / name).resolve()
        if not generated.is_relative_to(out.resolve()):
            raise ValueError("Generated path is outside the statistics directory")
        if generated.is_dir():
            shutil.rmtree(generated)
    for name, doc in docs.items():
        io.write_json(doc, out / f"{name}.json")
    io.write_json(outline, out / "outline.geojson")
    (out / "cells_monthly.csv").write_text(cells_monthly_csv(cells_monthly_rows(celldays, science)),
                                           encoding="utf-8", newline="")
    recent_csv = out / "hotspots_recent.csv"
    if recent:
        shutil.copyfile(paths.staged_hotspots_recent(region), recent_csv)
    else:
        recent_csv.unlink(missing_ok=True)
    spatial_daily = tables["daily"]
    if curve is not None and curve.get("status") == "validated":
        translated = daily_t2.loc[daily_t2.series.eq("viirs_equiv_t2")].copy()
        translated["series"] = "viirs_equiv_t1"
        spatial_daily = pd.concat([spatial_daily.loc[~spatial_daily.series.eq("viirs_equiv_t1")], translated],
                                  ignore_index=True)
    for year, shard in yearly_contributions(celldays, spatial_daily, region, science, header, docs).items():
        io.write_json(shard, out / "spatial" / f"{year}.json", compact=True)
    spatial_files = sorted((out / "spatial").glob("*.json"))
    io.write_json({**header, "schema_version": "2.0", "region": region,
                   "membership": outline["features"][0]["properties"]["membership"],
                   "science_yaml_sha256": io.sha256(paths.config_file("science.yaml")),
                   "calibration_scope": "whole region",
                   "coverage_note": "Daily source selection and regional coverage scaling; missing bins remain null.",
                   "years": [{"year": int(file.stem), "path": f"spatial/{file.name}",
                              "sha256": io.sha256(file), "bytes": file.stat().st_size} for file in spatial_files]},
                  out / "spatial_index.json")
    io.write_json(write_periods(out, tables["daily"], tables["annual_bootstrap"], tables["naive_annual"], docs,
                                region, meta.name, science, header), out / "period_index.json")
    recent_inputs = [file for file in (nrt_path, paths.nrt_coverage(region), paths.staged_hotspots_recent(region)) if file.is_file()]
    provenance.record_stage(region, "stats", recent_inputs, sorted(file for file in out.rglob("*") if file.is_file()),
                            upstream=(("eyesight",) if curve is not None else ("harmonize",)) + (("nowcast",) if recent else ()))
    log.finish("stats", region, len(daily), t0)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError) as error:
        print(f"FAIL stats: {' '.join(str(error).split())}", file=sys.stderr)
        sys.exit(1)
