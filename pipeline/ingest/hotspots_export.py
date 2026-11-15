"""Export local-US cleaned detections for release uploads, grouped by local-day year.

Both day and night observations are retained. Only the downloads.json fragment
is printed to stdout; the completion line goes to stderr for easy JSON capture.
"""
import csv
import gzip
import json
import sys
import time
from contextlib import redirect_stdout
from io import TextIOWrapper
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit

import pandas as pd

from pipeline.common import cli, config, io, log, paths
from pipeline.common.sensors import normalise_viirs_confidence

SENSORS = ("aqua", "terra", "snpp", "noaa20")
SATELLITES = {"aqua": "Aqua", "terra": "Terra", "snpp": "N", "noaa20": "N20"}
HOTSPOT_HEADER = (
    "latitude", "longitude", "acq_date", "acq_time", "satellite",
    "confidence", "frp", "daynight", "local_day", "h3_r6", "type", "product",
)


def validate_url_prefix(prefix):
    parts = urlsplit(prefix)
    if (
        parts.scheme not in {"https", "http"} or not parts.netloc
        or parts.query or parts.fragment or parts.username is not None
    ):
        raise ValueError("--url-prefix must be an absolute HTTP(S) URL without credentials, query or fragment")
    return prefix.rstrip("/")


def write_archive(frame, destination, sensor):
    """Write deterministic UTF-8/LF CSV with a timestamp-free gzip header."""
    with (
        destination.open("wb") as raw,
        gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as compressed,
        TextIOWrapper(compressed, encoding="utf-8", newline="") as handle,
    ):
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(HOTSPOT_HEADER)
        for row in frame.itertuples(index=False):
            timestamp = pd.Timestamp(row.acq_datetime_utc)
            confidence = (
                normalise_viirs_confidence(row.confidence_raw)
                if sensor in {"snpp", "noaa20"} else row.confidence_raw
            )
            writer.writerow([
                f"{row.latitude:.3f}", f"{row.longitude:.3f}",
                timestamp.strftime("%Y-%m-%d"), timestamp.strftime("%H%M"), SATELLITES[sensor],
                confidence, f"{row.frp:.3f}", row.daynight, row.local_day.isoformat(), row.h3_r6,
                "" if pd.isna(row.type) else int(row.type), row.product,
            ])


def run(region_id, url_prefix):
    region = config.get_region(region_id)
    config.require_us_region(region)
    prefix = validate_url_prefix(url_prefix)
    inputs = {sensor: paths.detections(region.id, sensor) for sensor in SENSORS}
    missing = [path.name for path in inputs.values() if not path.is_file()]
    if missing:
        raise FileNotFoundError(
            "Missing cleaned detections: " + ", ".join(missing)
            + "; run ingestion clean and grid before exporting"
        )
    paths.exports_dir().mkdir(parents=True, exist_ok=True)
    archives, staged = [], []
    with TemporaryDirectory(dir=paths.exports_dir(), prefix=".hotspots-export-") as temporary:
        for sensor, source in inputs.items():
            frame = io.read_parquet(source, "detections")
            if not frame.sensor.eq(sensor).all():
                raise ValueError(f"{source.name}: contains detections for another sensor")
            frame = frame.loc[frame.in_region].sort_values([
                "local_day", "acq_datetime_utc", "latitude", "longitude", "daynight",
                "frp", "confidence_raw", "type", "product", "h3_r6",
            ], kind="stable", na_position="last")
            years = frame.local_day.map(lambda day: day.year)
            for year, annual in frame.groupby(years, sort=True):
                year = int(year)
                destination = paths.hotspot_archive(region.id, sensor, year)
                prepared = Path(temporary) / destination.name
                write_archive(annual, prepared, sensor)
                archives.append({
                    "year": year, "sensor": sensor, "url": f"{prefix}/{destination.name}",
                    "rows": len(annual), "bytes": prepared.stat().st_size,
                })
                staged.append((prepared, destination))
        # Complete all schema checks and compression before replacing any archive.
        for prepared, destination in staged:
            prepared.replace(destination)
    return {
        "schema_version": "1.0", "region": region.id,
        "hotspot_archives": sorted(archives, key=lambda entry: (entry["year"], entry["sensor"])),
    }


def main(argv=None):
    parser = cli.stage_parser("ingest.hotspots_export")
    parser.description = "Export both passes as in-region, per-sensor, local-calendar-year hotspot archives."
    parser.add_argument("--url-prefix", required=True, help="Release download directory URL supplied by the uploader")
    args = parser.parse_args(argv)
    t0 = time.perf_counter()
    region_id = args.region or "us"
    try:
        fragment = run(region_id, args.url_prefix)
        print(json.dumps(fragment, sort_keys=True, ensure_ascii=False, allow_nan=False, indent=2))
        with redirect_stdout(sys.stderr):
            log.finish("hotspots_export", region_id, sum(row["rows"] for row in fragment["hotspot_archives"]), t0)
        return 0
    except (OSError, ValueError) as error:
        print(f"FAIL hotspots_export: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
