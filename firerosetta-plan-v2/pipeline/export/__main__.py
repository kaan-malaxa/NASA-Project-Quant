"""`python -m pipeline.export [--sample] [--check]` (contracts section 3)."""

from __future__ import annotations

import argparse
import sys
import time

from pipeline.export.check import default_data_dir, report, run_check


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m pipeline.export")
    parser.add_argument("--sample", action="store_true", help="write the SAMPLE site into web/public/data")
    parser.add_argument("--check", action="store_true", help="validate web/public/data against contracts/")
    args = parser.parse_args(argv)

    t0 = time.monotonic()
    if args.sample:
        from pipeline.export.sample import write_sample

        written = write_sample(default_data_dir())
        print(f"OK export sample rows={len(written)} seconds={time.monotonic() - t0:.1f}")
        if not args.check:
            return 0
    elif not args.check:
        print("FAIL export: assembling real data is not implemented yet (R1 prompt C2)")
        return 2

    results = run_check(default_data_dir())
    code = report(results)
    if code == 0:
        print(f"OK export all rows={len(results)} seconds={time.monotonic() - t0:.1f}")
    return code


if __name__ == "__main__":
    sys.exit(main())
