"""`python -m pipeline.stats --region R` (contracts section 3). Owner R1.

B1 writes weekly.json, monthly.json, daily.json and climatology.json. Paths, config, Parquet/JSON
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

    args = cli.stage_parser("stats").parse_args(argv)
    t0 = time.monotonic()
    region = args.region
    daily_path = paths.harmonized_dir(region) / "daily.parquet"
    if not daily_path.is_file():
        print(f"FAIL stats {region}: {daily_path} does not exist (run harmonize first)")
        return 1
    daily = io.read_parquet(daily_path, "daily")
    header = {"schema_version": "1.0", "generated_at": generated_at(), "code_version": io.code_version()}
    docs = build_calendar_files(daily, region, config.load_science(), header)
    out = paths.web_data_dir(region)
    out.mkdir(parents=True, exist_ok=True)
    for name, doc in docs.items():
        io.write_json(doc, out / f"{name}.json")
    log.finish("stats", region, len(daily), t0)
    return 0


if __name__ == "__main__":
    sys.exit(main())
