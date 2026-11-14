"""UTC logging and the stage completion line."""
import logging
import sys
import time


def get_logger(stage: str) -> logging.Logger:
    logger = logging.getLogger(f"pipeline.{stage}")
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stderr)
        formatter = logging.Formatter("%(asctime)sZ %(name)s %(levelname)s %(message)s")
        formatter.converter = time.gmtime
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.propagate = False
    return logger


def finish(stage: str, region: str, rows: int, t0: float) -> None:
    print(f"OK {stage} {region} rows={rows} seconds={time.perf_counter() - t0:.3f}", flush=True)
