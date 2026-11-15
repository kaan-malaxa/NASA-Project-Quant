"""Run the implemented, local US-only stages without importing stages together."""

import importlib.util
import subprocess
import sys

from pipeline.common.cli import stage_parser


def main(argv=None):
    parser = stage_parser("run")
    stages = ["ingest", "harmonize"]
    parser.add_argument("--from", dest="first", choices=stages, default=stages[0])
    parser.add_argument("--to", dest="last", choices=stages, default=stages[-1])
    args = parser.parse_args(argv)
    if stages.index(args.first) > stages.index(args.last):
        parser.error("--from must precede --to")
    for stage in stages[stages.index(args.first) : stages.index(args.last) + 1]:
        if importlib.util.find_spec(f"pipeline.{stage}.__main__") is None:
            raise RuntimeError(f"Required US stage is unavailable: {stage}")
        command = [
            sys.executable,
            "-m",
            f"pipeline.{stage}",
            "--region",
            args.region,
            "--pass",
            args.pass_,
            "--log-level",
            args.log_level,
        ]
        if args.data_root:
            command += ["--data-root", args.data_root]
        result = subprocess.run(command, check=False)
        if result.returncode:
            return result.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
