"""Run independent stages in contract order using the current interpreter."""
import importlib.util
import subprocess
import sys
import time

from pipeline.common import cli, config, log

STAGES = ("synth", "ingest", "harmonize", "eyesight", "stats", "export")


def _run_stage(stage, region, args):
    module = f"pipeline.{stage}"
    spec = importlib.util.find_spec(module)
    if spec is None or (
        getattr(spec, "submodule_search_locations", None) is not None
        and importlib.util.find_spec(f"{module}.__main__") is None
    ):
        print(f"SKIP {stage}: not implemented yet", flush=True)
        return 0
    command = [
        sys.executable, "-m", module, "--data-root", str(args.data_root),
        "--pass", getattr(args, "pass"), "--log-level", args.log_level,
    ]
    if stage != "export":
        command.extend(["--region", region.id])
    if stage == "synth":
        command.extend(["--size", args.synth_size])
    result = subprocess.run(command, check=False)
    if result.returncode:
        print(f"FAIL {stage} {region.id}: exit {result.returncode}", file=sys.stderr, flush=True)
    return result.returncode


def main(argv=None):
    t0 = time.perf_counter()
    parser = cli.stage_parser("run")
    parser.add_argument("--all-regions", action="store_true")
    parser.add_argument("--from", dest="from_stage", choices=STAGES)
    parser.add_argument("--to", dest="to_stage", choices=STAGES)
    # The planted-truth test (V7) is defined on the full simulated world; tiny is for quick smoke runs.
    parser.add_argument("--synth-size", choices=("tiny", "full"), default="full")
    args = parser.parse_args(argv)
    if bool(args.region) == args.all_regions:
        parser.error("choose exactly one of --region or --all-regions")
    first = STAGES.index(args.from_stage) if args.from_stage else 0
    last = STAGES.index(args.to_stage) if args.to_stage else len(STAGES) - 1
    if first > last:
        parser.error("--from must not follow --to")
    try:
        regions = (
            [region for region in config.load_regions() if not region.synthetic]
            if args.all_regions else [config.get_region(args.region)]
        )
        selected = STAGES[first:last + 1]
        for region in regions:
            for stage in selected:
                if stage == "export" or (stage == "synth" and not region.synthetic):
                    continue
                status = _run_stage(stage, region, args)
                if status:
                    return status
        if "export" in selected:
            status = _run_stage("export", regions[-1], args)
            if status:
                return status
    except (OSError, ValueError) as error:
        print(f"FAIL run: {error}", file=sys.stderr)
        return 1
    log.finish("run", args.region or "all", 0, t0)
    return 0


if __name__ == "__main__":
    sys.exit(main())
