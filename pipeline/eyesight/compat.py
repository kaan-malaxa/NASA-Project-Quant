"""Names used by the eyesight stage, delegated exclusively to the common library."""
import os

from pipeline.common import cli, config, io, log, paths, timebins

HAVE_COMMON = True
raw_dir = paths.raw_dir
grid_dir = paths.grid_dir
eyesight_dir = paths.eyesight_dir
harmonized_dir = paths.harmonized_dir
celldays_path = paths.celldays
coverage_path = paths.coverage
harmonized_daily_path = paths.daily
calibration_path = paths.calibration
daily_t2_path = paths.daily_t2
validation_t1_path = paths.validation_t1
validation_t2_path = paths.validation_t2
read_json = io.read_json
read_parquet = io.read_parquet
write_json = io.write_json
write_parquet = io.write_parquet
stage_parser = cli.stage_parser
get_logger = log.get_logger
finish = log.finish


def science():
    return config.load_science(), True


def set_data_root(data_root):
    if data_root is not None:
        os.environ["FIREROSETTA_DATA_ROOT"] = str(data_root)


def aggregate_weekly(daily, value_cols):
    return timebins.aggregate(daily, "week", value_cols=tuple(value_cols))
