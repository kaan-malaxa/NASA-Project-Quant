"""Ingest command entry point."""
import sys
import time

import duckdb

from pipeline.common import cli, log
from pipeline.ingest import clean, grid


def main(argv=None):
    parser = cli.stage_parser("ingest")
    parser.add_argument("--steps", default="clean,grid")
    args = parser.parse_args(argv)
    t0 = time.perf_counter()
    try:
        steps = args.steps.split(",")
        if steps not in [["clean"], ["grid"], ["clean", "grid"]]:
            raise ValueError("--steps must be clean, grid, or clean,grid")
        rows = 0
        for step in steps:
            rows = (clean.run if step == "clean" else grid.run)(args.region or "us")
        log.finish("ingest", args.region or "us", rows, t0)
        return 0
    except (OSError, ValueError, KeyError, duckdb.Error) as error:
        print(f"FAIL ingest: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
