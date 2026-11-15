"""Build recent NOAA-20 files from genuine local NRT inputs, without network IO."""
import csv
import json
import sys
import time
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory

import duckdb
import pandas as pd
import yaml

from pipeline.common import cli, config, io, log, paths, provenance, timebins
from pipeline.common.publication import publish
from pipeline.common.sensors import normalise_viirs_confidence
from pipeline.ingest import clean, download, grid, static_mask

HOTSPOT_HEADER = (
    "latitude", "longitude", "acq_date", "acq_time", "satellite",
    "confidence", "frp", "daynight", "local_day", "h3_r6",
)


class NowcastUnavailable(ValueError):
    """Safe, explicit local-data or coverage failure."""


def recent_window(now, longitude, days, west_longitude=None):
    if days < 1:
        raise NowcastUnavailable("--days must be positive")
    end = timebins.last_complete_local_day(now, longitude,
                                           longitude if west_longitude is None else west_longitude)
    return end - timedelta(days=days - 1), end


def load_local(inputs):
    frames = []
    with duckdb.connect() as connection:
        connection.execute("SET memory_limit = '4GB'")
        connection.execute("SET temp_directory = ?", [str(paths.tmp_dir())])
        for path in inputs:
            download.csv_header(path)
            frame = connection.read_csv(str(path), header=True, all_varchar=True).df()
            # A filename or absent type column alone cannot authenticate NRT data.
            if "version" not in frame or not frame.version.fillna("").str.contains("NRT", case=False).all():
                raise NowcastUnavailable("Cannot confirm NRT provenance: every input row must have an NRT version marker")
            normalized = clean.normalise(frame, "viirs", False)
            if not normalized.sensor.eq("noaa20").all():
                raise NowcastUnavailable("Local NRT inputs contain a sensor other than NOAA-20")
            frames.append(frame)
    if not frames:
        raise NowcastUnavailable("No local NOAA-20 NRT inputs")
    return pd.concat(frames, ignore_index=True).drop_duplicates().reset_index(drop=True)


def validate_coverage(raw, region, start, end, metadata=None):
    if metadata is not None:
        if metadata.get("source") != "VIIRS_NOAA20_NRT":
            raise NowcastUnavailable("Coverage metadata must identify VIIRS_NOAA20_NRT")
        known = {row["local_day"]: row for row in metadata["days"]}
        if any(type(row.get("covered")) is not bool for row in known.values()):
            raise NowcastUnavailable("Coverage metadata requires a boolean covered value for every day")
        for day, row in known.items():
            try:
                date.fromisoformat(day)
            except (TypeError, ValueError) as error:
                raise NowcastUnavailable("Coverage metadata has an invalid local day") from error
            if "reason" in row and not isinstance(row["reason"], str):
                raise NowcastUnavailable("Coverage reason must be text")
        if len(known) != len(metadata["days"]) or any(day.isoformat() not in known
                  for day in pd.date_range(start, end).date):
            raise NowcastUnavailable("Coverage metadata does not describe every requested day")
        if raw.empty:
            return raw
    normalized = clean.normalise(raw, "viirs", False)
    if not normalized.sensor.eq("noaa20").all():
        raise NowcastUnavailable("Only NOAA-20 NRT observations are permitted")
    if not raw.version.fillna("").str.contains("NRT", case=False).all():
        raise NowcastUnavailable("Historical processing cannot be relabeled as NRT")
    west, south, east, north = region.bbox
    valid = (
        normalized.latitude.between(-90, 90) & normalized.longitude.between(-180, 180)
        & normalized.acq_datetime_utc.notna()
        & normalized.longitude.between(west, east) & normalized.latitude.between(south, north)
    )
    local_days = pd.Series(index=normalized.index, dtype=object)
    local_days.loc[valid] = timebins.local_day(
        normalized.loc[valid, "acq_datetime_utc"], normalized.loc[valid, "longitude"],
    )
    covered = set(local_days.loc[valid])
    required = [day for first, last in download.api_windows(start, end)
                for day in pd.date_range(first, last).date]
    missing = sorted(set(required) - covered)
    if missing and metadata is None:
        raise NowcastUnavailable(
            f"Missing local NOAA-20 NRT coverage on {len(missing)} day(s): "
            + ", ".join(day.isoformat() for day in missing)
        )
    return raw.loc[local_days.between(start, end)].copy()


def write_hotspots(frame, destination):
    with Path(destination).open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(HOTSPOT_HEADER)
        for row in frame.itertuples(index=False):
            timestamp = pd.Timestamp(row.acq_datetime_utc)
            writer.writerow([
                f"{row.latitude:.3f}", f"{row.longitude:.3f}",
                timestamp.strftime("%Y-%m-%d"), timestamp.strftime("%H%M"), "N20",
                normalise_viirs_confidence(row.confidence_raw), f"{row.frp:.3f}",
                row.daynight, row.local_day.isoformat(), row.h3_r6,
            ])



def run(region_id, days, *, now=None, fetch=None, coverage_metadata=None):
    region = config.get_region(region_id)
    now = pd.Timestamp(now if now is not None else datetime.now(UTC))
    if now.tzinfo is None:
        raise NowcastUnavailable("Nowcast time must be timezone-aware UTC")
    now = now.tz_convert("UTC")
    start, end = recent_window(now, config.region_centroid(region)[0], days, region.bbox[0])
    inputs = paths.local_nrt_inputs(region_id)
    if not inputs:
        raise NowcastUnavailable(
            f"No genuine local VIIRS_NOAA20_NRT CSVs; missing coverage for {start} through {end}. "
            "Historical country CSVs were not substituted"
        )
    with paths.config_file("outages.yaml").open(encoding="utf-8") as handle:
        outages = yaml.safe_load(handle)["outages"]
    for outage in outages:
        first = date.fromisoformat(outage["start"])
        last = date.fromisoformat(outage["end"]) if outage["end"] else end
        if outage["sensor"] == "noaa20" and max(start, first) <= min(end, last):
            raise NowcastUnavailable("Requested NRT coverage overlaps a declared NOAA-20 outage")
    paths.tmp_dir().mkdir(parents=True, exist_ok=True)
    if coverage_metadata is None and paths.local_nrt_coverage(region_id).is_file():
        coverage_metadata = io.read_json(paths.local_nrt_coverage(region_id))
    raw = validate_coverage((fetch or load_local)(inputs), region, start, end, coverage_metadata)
    science = config.load_science()
    mask_path = paths.static_mask(region_id)
    if not mask_path.is_file():
        raise NowcastUnavailable("Existing static_mask.parquet is required before an NRT refresh")
    provenance.verify_stage(region_id, "grid")
    # Upgrade an already verified historical stamp to the separate manifest-entry attestation.
    if paths.stage_provenance(region_id, "clean").is_file():
        clean.record_clean(region_id)
    mask = io.read_parquet(mask_path, "static_mask")
    with TemporaryDirectory(dir=paths.tmp_dir(), prefix="nowcast-") as temporary:
        work = Path(temporary)
        snapshot = work / f"nrt_viirs_noaa20_{now.date()}.csv"
        raw.to_csv(snapshot, index=False, lineterminator="\n")
        frames = clean.clean_files([snapshot], region, science, publish=False)
        detections = static_mask.apply_mask(frames["noaa20"], set(mask.h3_r8))
        detections = detections.loc[detections.in_region & detections.local_day.between(start, end)].copy()
        cells, _ = grid.aggregate_detections({"noaa20": detections})
        cells["fetched_at"] = now.tz_localize(None)
        cells = clean.typed(cells, "celldays_nrt")
        parquet = work / "celldays_nrt.parquet"
        io.write_parquet(cells, parquet, "celldays_nrt")
        csv_path = work / "hotspots_recent.csv"
        write_hotspots(detections, csv_path)
        manifest_path = paths.manifest(region_id)
        entries = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else []
        target = paths.nrt_snapshot(region_id, now.date())
        old = {entry["file"]: entry for entry in entries}
        old[target.name] = {
            "file": target.name, "source": "VIIRS_NOAA20_NRT", "via": "local",
            "downloaded_at": now.isoformat().replace("+00:00", "Z"), **download._file_facts(snapshot),
        }
        manifest = work / "MANIFEST.json"
        io.write_json(sorted(old.values(), key=lambda entry: entry["file"]), manifest)
        coverage_path = work / "nrt_coverage.json"
        known = {row["local_day"]: {**row, "reason": row.get("reason", "independent_coverage")}
                 for row in coverage_metadata["days"]} if coverage_metadata else {}
        io.write_json({"schema_version": "1.0", "source": "VIIRS_NOAA20_NRT",
                       "fetched_at": now.isoformat().replace("+00:00", "Z"),
                       "start": start.isoformat(), "end": end.isoformat(),
                       "days": [known.get(day.isoformat(), {"local_day": day.isoformat(),
                                                           "covered": True, "reason": "raw_rows"})
                                for day in pd.date_range(start, end).date]}, coverage_path)
        publish({
            target: snapshot, paths.celldays_nrt(region_id): parquet,
            paths.staged_hotspots_recent(region_id): csv_path, manifest_path: manifest,
            paths.nrt_coverage(region_id): coverage_path,
        })
        source_inputs = [*inputs, mask_path]
        if paths.local_nrt_coverage(region_id).is_file():
            source_inputs.append(paths.local_nrt_coverage(region_id))
        provenance.record_stage(region_id, "nowcast", source_inputs,
                                [target, paths.celldays_nrt(region_id), paths.staged_hotspots_recent(region_id),
                                 paths.nrt_coverage(region_id)], upstream=("grid",))
    return len(detections)


def main(argv=None):
    parser = cli.stage_parser("ingest.nowcast_fetch")
    parser.add_argument("--days", type=int, default=31)
    args = parser.parse_args(argv)
    t0 = time.perf_counter()
    try:
        rows = run(args.region or "us", args.days)
        log.finish("nowcast_fetch", args.region or "us", rows, t0)
        return 0
    except (OSError, ValueError, KeyError, duckdb.Error) as error:
        message = str(error) if isinstance(error, NowcastUnavailable) else type(error).__name__
        print(f"FAIL nowcast_fetch: {message}; previous outputs untouched", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
