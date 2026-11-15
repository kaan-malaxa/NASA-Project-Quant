"""The common argument parser, including data-root application."""
import argparse
import logging
import os

from pipeline.common import paths


class _StageParser(argparse.ArgumentParser):
    def parse_args(self, args=None, namespace=None):
        result = super().parse_args(args, namespace)
        os.environ["PROMETHEUS_TORCH_DATA_ROOT"] = str(result.data_root)
        if result.web_output_dir:
            os.environ["PROMETHEUS_TORCH_WEB_DATA_DIR"] = str(result.web_output_dir)
        logging.getLogger().setLevel(result.log_level)
        return result


def stage_parser(stage_name):
    parser = _StageParser(prog=f"python -m pipeline.{stage_name}")
    parser.add_argument("--region")
    parser.add_argument("--data-root", type=paths.Path, default=paths.data_root())
    parser.add_argument("--web-output-dir", type=paths.Path, default=None)
    parser.add_argument("--pass", choices=("D", "N"), default="D")
    parser.add_argument("--log-level", choices=("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"), default="INFO")
    return parser
