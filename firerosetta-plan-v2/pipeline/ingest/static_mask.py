"""SD-18 static-source masking; explicit type-zero observations remain intact."""
import json

import h3
import pandas as pd

from pipeline.common import io, paths
from pipeline.ingest.clean import SENSORS, typed


def build_mask(candidates, science):
    totals = candidates.groupby("h3_r8").n_static.sum()
    seeds = totals[totals >= science["static_mask"]["min_static_detections"]].index
    cells = set()
    for seed in seeds:
        cells.update(h3.grid_disk(seed, science["static_mask"]["dilate_rings"]))
    return typed(pd.DataFrame({"h3_r8": sorted(cells)}), "static_mask")


def apply_mask(detections, mask):
    return detections.loc[~(detections["type"].isna() & detections.h3_r8.isin(mask))].copy()


def run(region, science):
    candidates = io.read_parquet(paths.static_candidates(region), "static_candidates")
    mask = build_mask(candidates, science)
    frames = {sensor: io.read_parquet(paths.detections(region, sensor), "detections") for sensor in SENSORS}
    path = paths.filter_log(region)
    logs = json.loads(path.read_text(encoding="utf-8"))
    updates = {}
    for sensor, frame in frames.items():
        filtered = apply_mask(frame, set(mask.h3_r8))
        dropped = len(frame) - len(filtered)
        previous = next((row for row in logs if row["sensor"] == sensor and row["step"] == "static_mask"), None)
        if previous is None:
            logs.append({
                "sensor": sensor, "step": "static_mask", "rows_in": len(frame), "rows_dropped": dropped,
            })
        elif dropped:
            previous["rows_dropped"] += dropped
        updates[sensor] = filtered
    io.write_parquet(mask, paths.static_mask(region), "static_mask")
    for sensor, frame in updates.items():
        io.write_parquet(frame, paths.detections(region, sensor), "detections")
    io.write_json(logs, path)
    return updates
