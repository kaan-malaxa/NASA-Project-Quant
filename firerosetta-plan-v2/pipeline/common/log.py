import logging
from time import perf_counter


def get_logger(stage):
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    return logging.getLogger(stage)


def finish(stage, region, rows, t0):
    print(f"OK {stage} {region} rows={rows} seconds={perf_counter() - t0:.3f}")
