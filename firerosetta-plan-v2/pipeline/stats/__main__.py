"""`python -m pipeline.stats --region R` (contracts section 3). Owner R1.

Writes weekly, monthly, daily, climatology (B1), trend, ruler (B2) and season (B3) JSON. Paths, config, Parquet/JSON
I/O, the CLI parser and the final log line all come from pipeline.common (R2, contracts section 10).
"""

from __future__ import annotations

import os
import sys
import time
from datetime import UTC, datetime


def generated_at() -> str:
    """UTC now, or SOURCE_DATE_EPOCH when set (for byte-identical rebuilds)."""
    epoch = os.environ.get("SOURCE_DATE_EPOCH")
    now = datetime.fromtimestamp(int(epoch), UTC) if epoch else datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%SZ")


def main(argv: list[str] | None = None) -> int:
    from pipeline.common import cli, config, io, log, paths

    from pipeline.stats.calendar import build_calendar_files
    from pipeline.stats.season import build_season
    from pipeline.stats.trend import build_trend_files

    args = cli.stage_parser("stats").parse_args(argv)
    t0 = time.monotonic()
    region = args.region
    hdir = paths.harmonized_dir(region)
    inputs = {"daily": hdir / "daily.parquet", "annual_bootstrap": hdir / "annual_bootstrap.parquet",
              "naive_annual": hdir / "naive_annual.parquet"}
    absent = [str(p) for p in inputs.values() if not p.is_file()]
    if absent:
        print(f"FAIL stats {region}: missing {', '.join(absent)} (run harmonize first)")
        return 1
    tables = {name: io.read_parquet(path, name) for name, path in inputs.items()}
    science = config.load_science()
    header = {"schema_version": "1.0", "generated_at": generated_at(), "code_version": io.code_version()}
    docs = build_calendar_files(tables["daily"], region, science, header)
    docs |= build_trend_files(tables["daily"], tables["annual_bootstrap"], tables["naive_annual"], region,
                              config.get_region(region).name, science, header)
    docs["season"] = build_season(docs["climatology"], tables["daily"], region, science, header)
    daily = tables["daily"]
    out = paths.web_data_dir(region)
    out.mkdir(parents=True, exist_ok=True)
    for name, doc in docs.items():
        io.write_json(doc, out / f"{name}.json")
    log.finish("stats", region, len(daily), t0)
    return 0


if __name__ == "__main__":
    sys.exit(main())
