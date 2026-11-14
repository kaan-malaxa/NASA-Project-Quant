"""Ingest command entry point."""
import sys
import time

import duckdb

from pipeline.common import cli, log
from pipeline.ingest import clean


def main(argv=None):
    parser = cli.stage_parser("ingest")
    parser.add_argument("--steps", default="clean")
    args = parser.parse_args(argv)
    t0 = time.perf_counter()
    try:
        if args.steps != "clean":
            raise ValueError("Only --steps clean is implemented; grid is pending")
        rows = clean.run(args.region or "us")
        log.finish("ingest", args.region or "us", rows, t0)
        return 0
    except (OSError, ValueError, KeyError, duckdb.Error) as error:
        print(f"FAIL ingest: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
