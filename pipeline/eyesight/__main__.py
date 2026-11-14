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
    if not compat.HAVE_COMMON:
        log.warning("pipeline.common not found; using pipeline/eyesight/compat.py fallbacks")
    compat.set_data_root(getattr(args, "data_root", None))
    pass_ = getattr(args, "pass_", None) or getattr(args, "pass", "D")

    t0 = time.time()
    try:
        entry, diag = run(args.region, pass_, log)
    except FileNotFoundError as exc:
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
    compat.finish(STAGE, args.region, entry["n_celldays"], t0)
    return 0


if __name__ == "__main__":
    sys.exit(main())
