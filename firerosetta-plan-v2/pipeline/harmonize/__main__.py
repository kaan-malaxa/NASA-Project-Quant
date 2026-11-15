"""Harmonization stage; shared modules own configuration, paths, IO and logging."""

import os
import sys
from datetime import datetime, timezone
from time import perf_counter
from types import SimpleNamespace


def _common():
    # Lazy loading lets the pure series functions be tested before R2's scaffold
    # arrives, while the actual command still requires the real shared modules.
    from pipeline.common import cli, config, io, log, paths, timebins

    return SimpleNamespace(cli=cli, config=config, io=io, log=log, paths=paths, timebins=timebins)


def run_region(region: str, pass_: str | None = None, *, shared=None):
    """Read contracted inputs, build results, validate, and write via common IO.

    Return the result with both NOAA-20 fits retained for later validation.
    The optional shared argument permits IO spies in unit tests, never a
    fallback implementation of common in production.
    """
    from pipeline.harmonize.bootstrap import (
        annual_bootstrap,
        bootstrap_k,
        complete_year_limit,
        with_intervals,
    )
    from pipeline.harmonize.calibrate import daily_counts
    from pipeline.harmonize.naive import naive_annual
    from pipeline.harmonize.series import SENSORS, build_daily_series, build_outputs

    shared = _common() if shared is None else shared
    science = shared.config.load_science()
    if science["scope"]["country"] != "US" or region != science["scope"]["region_id"]:
        raise ValueError("US-only pipeline: select the configured United States region")
    shared.config.get_region(region)
    shared.io.verify_us_inputs(region)
    cells = shared.io.read_parquet(shared.paths.celldays(region), schema_name="celldays")
    coverage = shared.io.read_parquet(shared.paths.coverage(region), schema_name="coverage")
    result = build_outputs(cells, coverage, science, region, pass_)
    counts = {
        sensor: daily_counts(cells, coverage, sensor, pass_ or science["reference"]["pass"])
        for sensor in SENSORS
    }
    result.bootstrap = bootstrap_k(counts, science, result.fits)
    result.calibration = with_intervals(
        result.calibration, result.bootstrap, science["tier1"]["interval_percentiles"]
    )
    result.daily = build_daily_series(counts, coverage, science, result.calibration)
    last_year = complete_year_limit(
        max(coverage["local_day"]),
        datetime.now(timezone.utc).date(),  # noqa: UP017 -- also tested on Python 3.10
    )
    result.annual_bootstrap = annual_bootstrap(
        result.daily,
        result.bootstrap,
        science,
        last_year,
        aggregate=shared.timebins.aggregate,
    )
    hotspots = shared.io.read_parquet(
        shared.paths.grid_dir(region).joinpath("hotspot_counts_daily.parquet"),
        schema_name="hotspot_counts_daily",
    )
    result.naive_annual = naive_annual(
        hotspots, coverage, science, last_year, aggregate=shared.timebins.aggregate
    )

    # The repository root is anchored by the contracted web/public/data path;
    # data paths themselves always come from the common path helpers.
    schema_path = shared.paths.web_data_dir().parents[2].joinpath("contracts", "calibration.schema.json")
    if schema_path.exists():
        from jsonschema import validate

        read_json = getattr(shared.io, "read_json", None)
        if read_json is None:
            raise RuntimeError(
                "Calibration schema exists but common.io.read_json is unavailable; "
                "R2 must supply shared JSON reading before outputs can be validated"
            )
        validate(instance=result.calibration, schema=read_json(schema_path))

    output = shared.paths.harmonized_dir(region)
    shared.io.write_parquet(result.daily, output.joinpath("daily.parquet"), schema_name="daily")
    shared.io.write_json(result.calibration, output.joinpath("calibration.json"))
    shared.io.write_parquet(
        result.annual_bootstrap,
        output.joinpath("annual_bootstrap.parquet"),
        schema_name="annual_bootstrap",
    )
    shared.io.write_parquet(
        result.naive_annual,
        output.joinpath("naive_annual.parquet"),
        schema_name="naive_annual",
    )
    return result


def _print_summary(result):
    for sensor in ("snpp", "noaa20"):
        annual = result.calibration["k_annual"][sensor]["k"]
        monthly = [row["k"] for row in result.calibration["k"][sensor]]
        print(f"{sensor} k_annual={annual} k_monthly={monthly}")
    print(f"noaa20_method={result.calibration['noaa20_method']}")
    missing = result.daily["series"].eq("harmonized") & result.daily["kind"].eq("missing")
    print(f"harmonized missing_days={int(missing.sum())}")


def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    previous_root = os.environ.get("FIREROSETTA_DATA_ROOT")
    changed_root = False
    try:
        shared = _common()
        args = shared.cli.stage_parser("harmonize").parse_args(argv)
        # Preserve the environment override when the default flag was not given.
        if any(arg == "--data-root" or arg.startswith("--data-root=") for arg in argv):
            os.environ["FIREROSETTA_DATA_ROOT"] = str(args.data_root)
            changed_root = True
        logger = shared.log.get_logger("harmonize")
        logger.setLevel(args.log_level.upper())
        pass_ = getattr(args, "pass_", getattr(args, "pass", None))
        t0 = perf_counter()
        result = run_region(args.region, pass_, shared=shared)
        _print_summary(result)
        shared.log.finish("harmonize", args.region, len(result.daily), t0)
        return 0
    except Exception as exc:  # noqa: BLE001 -- stage contract requires one-line failures
        reason = " ".join(str(exc).split())
        print(f"ERROR harmonize: {reason}", file=sys.stderr)
        return 1
    finally:
        if changed_root:
            if previous_root is None:
                os.environ.pop("FIREROSETTA_DATA_ROOT", None)
            else:
                os.environ["FIREROSETTA_DATA_ROOT"] = previous_root


if __name__ == "__main__":
    raise SystemExit(main())
