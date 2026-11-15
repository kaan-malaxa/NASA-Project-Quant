"""python -m pipeline.eyesight --region R"""

from __future__ import annotations

import sys
import time

from . import compat
from .stage import run

STAGE = "eyesight"


def main(argv: list[str] | None = None) -> int:
    args = compat.stage_parser(STAGE).parse_args(argv)
    log = compat.get_logger(STAGE)
    log.setLevel(str(getattr(args, "log_level", "INFO")).upper())
    compat.set_data_root(getattr(args, "data_root", None))
    pass_ = getattr(args, "pass_", None) or getattr(args, "pass", "D")

    t0 = time.perf_counter()  # the clock pipeline.common.log.finish subtracts from
    try:
        entry, diag = run(args.region, pass_, log)
    except (OSError, ValueError) as exc:
        print(f"eyesight failed: {exc}", file=sys.stderr)
        return 2

    if entry["status"] != "absent":
        p = entry["params"]
        log.info("a = %.3f (%.3f to %.3f)", p["a"], p["a_lo"], p["a_hi"])
        log.info("b = %.3f (%.3f to %.3f)", p["b"], p["b_lo"], p["b_hi"])
        log.info("c = %.3f (%.3f to %.3f)", p["c"], p["c_lo"], p["c_hi"])
        log.info("g = %.3f (Aqua cell-days %d / also seen by S-NPP %d)", diag["g"], diag["aqua_celldays_total"],
                 diag["aqua_celldays_matched"])
        log.info("n_celldays = %d; reliability_err = %.4f; band width at 10 MW = %.3f; bootstrap converged %s",
                 entry["n_celldays"], diag["reliability_err"], diag["band_width_at_10mw"],
                 diag["bootstrap_converged"])
        for r in diag["by_year"]:
            log.info("year %d fit: a=%.3f b=%.3f c=%.3f n=%d converged=%s", r["year"], r["a"], r["b"], r["c"],
                     r["n"], r["converged"])
        log.info("seconds: match %.1f, fit %.1f, bootstrap (B=%d) %.1f", diag["seconds_match"], diag["seconds_fit"],
                 diag["bootstrap_b"], diag["seconds_bootstrap"])
        log.info("Alaska/Hawaii rows in matched table: %s", diag["outside_conus_rows"])
        for r in diag["k_t2"].itertuples():
            log.info("k_T2 month %2d = %.3f (%.3f to %.3f, %d years)", r.month, r.k_t2, r.k_lo, r.k_hi, r.n_years)
        d = diag["daily_t2"]
        for name, grp in d.groupby("series"):
            log.info("daily_t2 %s: %d days, kinds %s, forward %.1f s", name, len(grp),
                     grp["kind"].value_counts().to_dict(), diag.get("seconds_forward", 0.0))
    if "sd17" in diag:
        for r in diag["validation_rows"]:
            v = "null" if r["value"] is None else f"{r['value']:.4f}"
            log.info("validation %s (%s) = %s, n=%d", r["test"], r["method"], v, r["n"])
        for c in diag["sd17"]:
            log.info("SD-17 %s: %s (%s)", "PASS" if c["passed"] else "FAIL", c["condition"], c["detail"])
        log.info("status = %s", entry["status"])
    compat.finish(STAGE, args.region, entry["n_celldays"], t0)
    return 0


if __name__ == "__main__":
    sys.exit(main())
