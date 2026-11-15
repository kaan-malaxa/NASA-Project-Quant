"""Region membership, sensor-specific cell-days and coverage (SD-04/08/18)."""
import h3
import pandas as pd
import yaml

from pipeline.common import config, io, paths, provenance
from pipeline.ingest import clean, coverage, static_mask


def build_region_cells(region, science):
    cells = sorted(clean.region_cells(region, science))
    rows = []
    for cell in cells:
        lat, lon = h3.cell_to_latlng(cell)
        rows.append({
            "h3_r6": cell, "h3_r5": h3.cell_to_parent(cell, science["grid"]["map_res"]),
            "lat": lat, "lon": lon,
        })
    frame = clean.typed(pd.DataFrame(rows), "region_cells")
    polygon = paths.PROJECT_ROOT / region.polygon if region.polygon else None
    frame.attrs["membership"] = "polygon" if polygon and polygon.is_file() else "bbox"
    return frame


def world_reference(region_id, region):
    """SD-08 rule 3 for a FIRMS world country: zero raw rows means no data only when the sensor has
    zero rows across every country. Returns ([reference file], last UTC day of the staged record);
    the record runs to the end of the staged years, so a country's quiet final weeks stay real zeros."""
    if region.source != "firms_world":
        return [], None
    reference = paths.world_daily_counts()
    if not reference.is_file():
        raise ValueError(f"Missing {reference}; run python -m pipeline.ingest.world_data counts")
    years = [int(entry["file"].rsplit("_", 1)[1][:4]) for entry in io.read_json(paths.manifest(region_id))
             if entry.get("via") == "country"]
    if not years:
        raise ValueError(f"No staged country inputs for {region_id}")
    counts = io.read_parquet(reference, "raw_daily_counts")
    dates = pd.to_datetime(counts.utc_date).dt.date
    within = dates[dates.map(lambda day: day.year <= max(years))]
    return [reference], (within.max() if len(within) else None)


def aggregate_detections(frames):
    columns = ["sensor", "local_day", "daynight", "h3_r6", "h3_r5", "frp"]
    active = [frame.loc[frame.in_region, columns] for frame in frames.values() if len(frame)]
    if not active:
        return clean.typed(pd.DataFrame(), "celldays"), clean.typed(pd.DataFrame(), "hotspot_counts_daily")
    detections = pd.concat(active, ignore_index=True)
    keys = ["sensor", "local_day", "daynight", "h3_r6", "h3_r5"]
    cells = detections.groupby(keys, as_index=False).agg(
        n_det=("sensor", "size"), frp_sum=("frp", "sum"), frp_max=("frp", "max"),
    ).sort_values(keys)
    counts = detections.groupby(["sensor", "local_day"], as_index=False).agg(n_det_all=("sensor", "size"))
    return clean.typed(cells, "celldays"), clean.typed(counts, "hotspot_counts_daily")


def run(region_id):
    provenance.verify_stage(region_id, "clean")
    region = config.get_region(region_id)
    science = config.load_science()
    raw = io.read_parquet(paths.raw_daily_counts(region_id), "raw_daily_counts")
    reference_inputs, record_end = world_reference(region_id, region)
    if reference_inputs:
        raw = io.read_parquet(reference_inputs[0], "raw_daily_counts")
    with paths.config_file("outages.yaml").open(encoding="utf-8") as handle:
        outages = yaml.safe_load(handle)["outages"]
    members = build_region_cells(region, science)
    frames = static_mask.run(region_id, science)
    cells, counts = aggregate_detections(frames)
    days = [pd.to_datetime(frame.local_day).max().date() for frame in frames.values() if len(frame)]
    if record_end is not None:
        days.append(record_end)
    if days:
        last_day = max(days)
    elif len(raw):
        last_day = pd.to_datetime(raw.utc_date).max().date()
    else:
        raise ValueError("Cannot establish a coverage end date: no detections or raw counts")
    covered = coverage.build_coverage(raw, last_day, science, outages)
    io.write_parquet(members, paths.region_cells(region_id), "region_cells")
    io.write_parquet(cells, paths.celldays(region_id), "celldays")
    io.write_parquet(counts, paths.hotspot_counts_daily(region_id), "hotspot_counts_daily")
    io.write_parquet(covered, paths.coverage(region_id), "coverage")
    # Static masking rewrites the cleaned detections; attest those final cleaned bytes too.
    clean.record_clean(region_id)
    provenance.record_stage(region_id, "grid", reference_inputs,
                            [paths.region_cells(region_id), paths.celldays(region_id),
                             paths.hotspot_counts_daily(region_id), paths.coverage(region_id),
                             paths.static_mask(region_id)], upstream=("clean",))
    return len(cells)
