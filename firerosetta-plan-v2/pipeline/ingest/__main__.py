import os
import sys
from time import perf_counter

from pipeline.common import cli, log
from pipeline.ingest.us import ingest_us


def main(argv=None):
    args = cli.stage_parser("ingest").parse_args(argv)
    if args.data_root:
        os.environ["FIREROSETTA_DATA_ROOT"] = args.data_root
    try:
        t0 = perf_counter()
        rows = ingest_us(args.region)
        log.finish("ingest", args.region, rows, t0)
        return 0
    except Exception as exc:
        print(f"ERROR ingest: {' '.join(str(exc).split())}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
