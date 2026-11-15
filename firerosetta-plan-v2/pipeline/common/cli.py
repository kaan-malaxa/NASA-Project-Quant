"""The shared stage CLI defaults to the sole configured US region."""

import argparse

from pipeline.common.config import load_regions


def stage_parser(stage_name):
    parser = argparse.ArgumentParser(prog=f"python -m pipeline.{stage_name}")
    region = load_regions()[0]
    parser.add_argument("--region", choices=[region.id], default=region.id)
    parser.add_argument(
        "--data-root", default=None, help="Derived-output root; US CSV sources stay in workspace data/"
    )
    parser.add_argument("--pass", dest="pass_", choices=["D", "N"], default="D")
    parser.add_argument("--log-level", choices=["DEBUG", "INFO", "WARNING", "ERROR"], default="INFO")
    return parser
