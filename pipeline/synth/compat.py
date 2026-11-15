"""Simulator adapter delegating exclusively to the common library."""
import os

from pipeline.common import cli, config, io, log, paths, timebins

HAVE_COMMON = True
get_logger = log.get_logger
finish = log.finish
stage_parser = cli.stage_parser
raw_dir = paths.raw_dir
load_science = config.load_science
week_of_year = timebins.week_of_year
write_json = io.write_json
code_version = io.code_version


def set_data_root(data_root):
    if data_root is not None:
        os.environ["PROMETHEUS_TORCH_DATA_ROOT"] = str(data_root)


def science():
    return load_science(), True


def region_bbox(region):
    meta = config.get_region(region)
    return tuple(meta.bbox), meta.synthetic
