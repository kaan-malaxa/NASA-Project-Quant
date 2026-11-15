"""SD-02 cleaning of verified staged CSVs, with SD-03 dates and contracted IO."""
import csv
import json
from pathlib import Path
from tempfile import TemporaryDirectory

import duckdb
import h3
import numpy as np
import pandas as pd
import pyarrow as pa

from pipeline.common import config, io, paths, provenance, sensors, timebins
from pipeline.ingest import download

SENSORS = ("aqua", "terra", "snpp", "noaa20")


def file_family(path):
    name = Path(path).name
    for prefix, family in (
        ("nrt_viirs_noaa20_", "viirs"), ("viirs_noaa20_", "viirs"),
        ("viirs_snpp_", "viirs"), ("modis_", "modis"),
    ):
        if name.startswith(prefix):
            return family
    raise ValueError(f"Unknown raw filename prefix: {name}")


def typed(frame, name):
    schema = io.SCHEMAS[name]
    if frame.empty:
        return pa.Table.from_batches([], schema=schema).to_pandas(types_mapper=pd.ArrowDtype)
    return pa.Table.from_pandas(frame[schema.names], schema=schema, preserve_index=False).to_pandas(
        types_mapper=pd.ArrowDtype,
    )


def region_cells(region, science):
    resolution = science["grid"]["count_res"]
    path = paths.PROJECT_ROOT / region.polygon if region.polygon else None
    if path and path.is_file():
        with path.open(encoding="utf-8") as handle:
            geo = json.load(handle)
        features = geo["features"] if geo["type"] == "FeatureCollection" else [geo]
        return set().union(*(
            set(h3.geo_to_cells(feature.get("geometry", feature), resolution)) for feature in features
        ))
    west, south, east, north = region.bbox
    geometry = {"type": "Polygon", "coordinates": [[
        [west, south], [east, south], [east, north], [west, north], [west, south],
    ]]}
    return set(h3.geo_to_cells(geometry, resolution))


def normalise(frame, family, nrt_prefix):
    required = {
        "latitude", "longitude", "acq_date", "acq_time", "satellite", "instrument",
        "version", "confidence", "daynight", "frp", "scan", "track",
    }
    missing = sorted(required - set(frame))
    if missing:
        raise ValueError("Missing CSV columns: " + ", ".join(missing))
    result = frame.copy()
    aliases = {value: sensors.normalise_sensor(value, family) for value in frame.satellite.unique()}
    result["sensor"] = frame.satellite.map(aliases)
    instruments = set(frame.instrument.dropna().str.upper())
    if not frame.empty and instruments != {family.upper()}:
        raise ValueError(f"Unexpected instrument values: {sorted(instruments)}")
    for column in ("latitude", "longitude", "frp", "scan", "track"):
        result[column] = pd.to_numeric(frame[column], errors="coerce")
    result["utc_date"] = pd.to_datetime(frame.acq_date, format="%Y-%m-%d", errors="coerce").dt.date
    times = frame.acq_time.fillna("").str.zfill(4)
    result["acq_datetime_utc"] = pd.to_datetime(
        frame.acq_date + " " + times.where(times.str.fullmatch(r"\d{4}")),
        format="%Y-%m-%d %H%M", errors="coerce",
    )
    raw_type = frame["type"] if "type" in frame else pd.Series(None, index=frame.index, dtype=object)
    result["type"] = pd.to_numeric(raw_type, errors="raise").astype("Int8")
    result["product"] = np.where(
        nrt_prefix | frame.version.fillna("").str.contains("NRT", case=False) | raw_type.isna(), "NRT", "SP",
    )
    result["confidence_raw"] = frame.confidence
    if family == "viirs":
        result["quality"] = frame.confidence.map(sensors.normalise_viirs_confidence)
    else:
        result["quality"] = pd.to_numeric(frame.confidence, errors="raise").astype(str)
    result["daynight"] = frame.daynight.str.upper()
    if not set(result.daynight) <= {"D", "N"}:
        raise ValueError("Unknown daynight value")
    # MODIS and VIIRS have different brightness columns. Only normalized shared
    # fields enter the temporary dataset so all input files have one schema.
    return result[[
        "latitude", "longitude", "acq_datetime_utc", "utc_date", "daynight", "frp",
        "confidence_raw", "scan", "track", "sensor", "product", "type", "quality",
    ]]


def clean_files(inputs, region, science, *, publish=True):
    """Explicit inputs/config support isolated fabricated tests; CLI verifies US provenance."""
    cells = region_cells(region, science)
    logs, raw_counts, spool = [], [], []
    outputs = {}
    candidates = []
    paths.tmp_dir().mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=paths.tmp_dir(), prefix="clean-") as temporary, duckdb.connect() as connection:
        connection.execute("SET memory_limit = '4GB'")
        connection.execute("SET temp_directory = ?", [str(paths.tmp_dir())])
        for index, path in enumerate(sorted(map(Path, inputs))):
            with path.open(encoding="utf-8-sig", newline="") as handle:
                header = next(csv.reader(handle))
            if len(header) != len(set(header)):
                raise ValueError(f"Duplicate CSV column in {path.name}")
            frame = connection.read_csv(str(path), header=True, all_varchar=True).df()
            if frame.empty:
                continue
            frame = normalise(frame, file_family(path), path.name.startswith("nrt_"))
            counts = frame.dropna(subset=["utc_date"]).groupby(["sensor", "utc_date"]).size()
            raw_counts.append(counts.rename("n_raw_rows").reset_index())
            target = Path(temporary) / f"normalised-{index}.parquet"
            frame.to_parquet(target, index=False, compression="zstd")
            spool.append(str(target))
        for sensor in (*SENSORS, "noaa21"):
            if not spool:
                frame = pd.DataFrame()
            else:
                frame = connection.read_parquet(spool).filter(f"sensor = '{sensor}'").df()
            def retain(mask, step, sensor=sensor):
                nonlocal frame
                count = len(frame)
                frame = frame.loc[mask].copy()
                logs.append({"sensor": sensor, "step": step, "rows_in": count, "rows_dropped": count - len(frame)})
            if sensor == "noaa21":
                if not frame.empty:
                    retain(pd.Series(False, index=frame.index), "excluded_sensor")
                continue
            if frame.empty:
                outputs[sensor] = typed(frame, "detections")
                continue
            retain(
                frame.latitude.between(-90, 90) & frame.longitude.between(-180, 180)
                & frame.acq_datetime_utc.notna(), "valid_coordinates_date",
            )
            retain(~frame.duplicated(["sensor", "latitude", "longitude", "acq_datetime_utc"]), "duplicates")
            west, south, east, north = region.bbox
            retain(frame.longitude.between(west, east) & frame.latitude.between(south, north), "bbox")
            static = frame.loc[frame["type"].isin([1, 2, 3]) & frame["product"].eq("SP")]
            if not static.empty:
                candidates.extend(
                    h3.latlng_to_cell(lat, lon, science["grid"]["mask_res"])
                    for lat, lon in zip(static.latitude, static.longitude)
                )
            retain(frame["type"].isna() | frame["type"].eq(0), "type")
            if sensor in {"aqua", "terra"}:
                quality = pd.to_numeric(frame.quality) >= science["filters"]["modis_min_confidence"]
            else:
                quality = frame.quality.isin(science["filters"]["viirs_keep"])
            retain(quality, "confidence")
            if not np.isfinite(frame[["frp", "scan", "track"]].to_numpy(dtype=float)).all():
                raise ValueError("Retained row has invalid frp, scan or track; contract requires finite values")
            frame["local_day"] = timebins.local_day(frame.acq_datetime_utc, frame.longitude)
            for column, resolution in (
                ("h3_r6", science["grid"]["count_res"]), ("h3_r8", science["grid"]["mask_res"]),
            ):
                frame[column] = [
                    h3.latlng_to_cell(lat, lon, resolution) for lat, lon in zip(frame.latitude, frame.longitude)
                ]
            # The map cell is the parent of the counting cell, never the point's own coarse cell: H3
            # hexagons do not nest exactly, so a point near an edge can sit in a coarse cell that is not
            # its fine cell's parent. That would split one cell-day into two rows and count it twice.
            parents = {
                cell: h3.cell_to_parent(cell, science["grid"]["map_res"]) for cell in frame.h3_r6.unique()
            }
            frame["h3_r5"] = frame.h3_r6.map(parents)
            frame["in_region"] = frame.h3_r6.isin(cells)
            outputs[sensor] = typed(frame.sort_values(["acq_datetime_utc", "latitude", "longitude"]), "detections")
        counts = (
            pd.concat(raw_counts).groupby(["sensor", "utc_date"], as_index=False).n_raw_rows.sum()
            if raw_counts else pd.DataFrame()
        )
        static = (
            pd.Series(candidates, dtype=str).value_counts().rename_axis("h3_r8").reset_index(name="n_static")
            if candidates else pd.DataFrame()
        )
        if not publish:
            return outputs
        # Publish only after all inputs have passed validation.
        for sensor, frame in outputs.items():
            io.write_parquet(frame, paths.detections(region.id, sensor), "detections")
        io.write_parquet(typed(counts, "raw_daily_counts"), paths.raw_daily_counts(region.id), "raw_daily_counts")
        io.write_parquet(typed(static, "static_candidates"), paths.static_candidates(region.id), "static_candidates")
        io.write_json(logs, paths.filter_log(region.id))
    return sum(len(frame) for frame in outputs.values())


def synthetic_inputs(region_id, manifest_path):
    """Raw files of a simulated region: exactly what its simulator listed in MANIFEST.json."""
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Run pipeline.synth --region {region_id} first: {manifest_path} is missing")
    inputs = []
    for entry in json.loads(manifest_path.read_text(encoding="utf-8")):
        name = entry["file"]
        if entry.get("via") != "synth" or Path(name).name != name:
            raise ValueError("A simulated region may only contain simulator output")
        path = paths.raw_dir(region_id) / name
        if not path.is_file():
            raise FileNotFoundError(f"Simulated raw file listed in MANIFEST.json is missing: {name}")
        file_family(path)
        inputs.append(path)
    if not inputs:
        raise ValueError("No simulated inputs are listed in MANIFEST.json")
    return inputs


def run(region_id):
    region = config.get_region(region_id)
    science = config.load_science()
    manifest_path = paths.manifest(region_id)
    if region.synthetic:
        inputs = synthetic_inputs(region_id, manifest_path)
        provenance.raw_inputs(region_id)
        rows = clean_files(inputs, region, science)
        record_clean(region_id)
        return rows
    config.require_us_region(region)
    staged_now = not manifest_path.is_file()
    if staged_now:
        # First run on this machine: stage the local country CSVs (no network), then clean them.
        download.download_country(region, download.default_years(science), list(download.PRODUCTS))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not manifest:
        raise ValueError("No staged US inputs are listed in MANIFEST.json")
    jobs = set()
    for entry in manifest:
        if (
            entry["file"].startswith("nrt_viirs_noaa20_")
            and entry["source"] == "VIIRS_NOAA20_NRT" and entry["via"] == "local"
        ):
            continue
        source = paths.source_data_root() / entry["source"]
        if not source.resolve().is_relative_to(paths.source_data_root()) or not source.is_file():
            raise ValueError("Staged input has no valid local US source")
        parts = source.name.split("_")
        product, year = parts[0], int(parts[1])
        if source not in paths.country_csv_candidates(product, year, "United_States"):
            raise ValueError("Unrecognised US source path")
        expected = paths.raw_csv("us", download.PRODUCTS[product], "country", year)
        if entry["file"] != expected.name or entry["via"] != "country":
            raise ValueError("Only verified local US country inputs may be cleaned")
        jobs.add((product, year, expected))
    if not jobs:
        raise ValueError("No verified historical US country inputs are listed in MANIFEST.json")
    # Re-verify against original local sources; an old cache is never authoritative.
    if not staged_now:
        for product, year, _ in sorted(jobs):
            download.download_country(region, [year], [product])
    rows = clean_files([job[2] for job in sorted(jobs)], region, science)
    record_clean(region_id)
    return rows


def record_clean(region_id):
    provenance.record_stage(region_id, "clean", provenance.raw_inputs(region_id),
                            [*(paths.detections(region_id, sensor) for sensor in SENSORS),
                             paths.raw_daily_counts(region_id), paths.static_candidates(region_id),
                             paths.filter_log(region_id)])
