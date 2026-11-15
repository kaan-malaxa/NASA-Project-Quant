"""Stage only the existing local United States country CSVs; never fetch data."""
import csv
import hashlib
import json
import sys
import time
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory

import duckdb

from pipeline.common import cli, config, io, log, paths

PRODUCTS = {"modis": "modis", "viirs-snpp": "viirs_snpp", "viirs-jpss1": "viirs_noaa20"}
LOGGER = log.get_logger("download")


class DownloadError(ValueError):
    """A local input cannot be used without changing or inventing source data."""


def api_windows(start: date, end: date):
    """Pure window helper retained for fabricated tests; performs no IO."""
    if end < start:
        raise ValueError("end must not precede start")
    while start <= end:
        stop = min(end, start + timedelta(days=4))
        yield start, stop
        start = stop + timedelta(days=1)


def csv_header(path):
    with Path(path).open(encoding="utf-8-sig", newline="") as handle:
        header = next(csv.reader(handle), [])
    if len(header) != len(set(header)) or not {"latitude", "longitude", "acq_date"} <= set(header):
        raise DownloadError("CSV must have unique columns including latitude, longitude and acq_date")
    return header


def _connection():
    paths.tmp_dir().mkdir(parents=True, exist_ok=True)
    connection = duckdb.connect()
    connection.execute("SET memory_limit = '4GB'")
    connection.execute("SET temp_directory = ?", [str(paths.tmp_dir())])
    return connection


def clip_bbox(inputs, output, bbox):
    """Keep bbox boundaries and every original text column, including HHMM."""
    inputs = [Path(path) for path in inputs]
    headers = [csv_header(path) for path in inputs]
    if not headers or any(header != headers[0] for header in headers[1:]):
        raise DownloadError("Input CSV headers differ; refusing to merge")
    west, south, east, north = bbox
    with _connection() as connection:
        relation = connection.read_csv([str(path) for path in inputs], header=True, all_varchar=True)
        relation = relation.filter(
            f"try_cast(longitude as double) >= {float(west)!r} AND "
            f"try_cast(longitude as double) <= {float(east)!r} AND "
            f"try_cast(latitude as double) >= {float(south)!r} AND "
            f"try_cast(latitude as double) <= {float(north)!r}"
        )
        relation.order(", ".join('"' + name.replace('"', '""') + '"' for name in headers[0])).write_csv(
            str(output), header=True,
        )


def _file_facts(path):
    csv_header(path)
    with _connection() as connection:
        relation = connection.read_csv(str(path), header=True, all_varchar=True)
        rows, first, last, invalid = relation.aggregate(
            "count(*), min(try_cast(acq_date as date)), max(try_cast(acq_date as date)), "
            "count(*) FILTER (WHERE try_cast(acq_date as date) IS NULL)"
        ).fetchall()[0]
    if invalid:
        raise DownloadError("CSV contains missing or invalid acq_date values")
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return {
        "rows": rows, "sha256": digest.hexdigest(),
        "first_date": first.isoformat() if first else None,
        "last_date": last.isoformat() if last else None,
    }


def _source_name(path):
    root = paths.source_data_root()
    resolved = Path(path).resolve()
    if not resolved.is_relative_to(root):
        raise DownloadError(f"US source must remain inside {root}")
    return resolved.relative_to(root).as_posix()


def update_manifest(region, path=None, source=None, via="country"):
    """Upsert local provenance without inventing the original download time."""
    if region != "us":
        raise DownloadError("Only the local us region is supported")
    manifest = paths.manifest(region)
    entries = json.loads(manifest.read_text(encoding="utf-8")) if manifest.exists() else []
    # Do not carry old API or unverified source entries into a local-only manifest.
    by_file = {}
    for entry in entries:
        if (
            entry.get("source") == "VIIRS_NOAA20_NRT" and entry.get("via") == "local"
            and Path(entry["file"]).name == entry["file"] and entry["file"].startswith("nrt_viirs_noaa20_")
        ):
            staged = paths.raw_dir(region) / entry["file"]
            if staged.is_file() and all(entry.get(key) == value for key, value in _file_facts(staged).items()):
                by_file[entry["file"]] = entry
            continue
        relative = entry.get("source", "")
        candidate = paths.source_data_root() / relative
        if (
            entry.get("via") == "country" and relative
            and candidate.is_file() and _source_name(candidate) == relative
            and candidate.name.endswith("_United_States.csv")
        ):
            by_file[entry["file"]] = entry
    if path is not None:
        if via != "country" or not source:
            raise DownloadError("Manifest entries require a local US source")
        candidate = paths.source_data_root() / source
        if not candidate.is_file() or _source_name(candidate) != source:
            raise DownloadError("Manifest source must be an existing file inside the US source directory")
        if not candidate.name.endswith("_United_States.csv"):
            raise DownloadError("Manifest source must be a United_States country CSV")
        facts = _file_facts(path)
        old = by_file.get(Path(path).name)
        values = {"source": source, "via": via, **facts}
        if old is None or any(old.get(key) != value for key, value in values.items()):
            by_file[Path(path).name] = {
                "file": Path(path).name, **values,
                "downloaded_at": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
            }
    updated = sorted(by_file.values(), key=lambda entry: entry["file"])
    if updated != entries or not manifest.exists():
        manifest.parent.mkdir(parents=True, exist_ok=True)
        staging = manifest.with_suffix(".json.part")
        io.write_json(updated, staging)
        staging.replace(manifest)
    return updated


def download_country(region, years, products):
    """Stage verified local US inputs; missing files never trigger a network call."""
    config.require_us_region(region)
    paths.tmp_dir().mkdir(parents=True, exist_ok=True)
    jobs = []
    for year in years:
        for product in products:
            source = paths.country_csv_candidates(product, year, "United_States")[0]
            if not source.is_file():
                LOGGER.warning("MISSING local US source: %s", source)
                continue
            relative = _source_name(source)
            csv_header(source)
            jobs.append((year, product, source, relative))
    if not jobs:
        raise DownloadError(f"No requested local US CSVs exist in {paths.source_data_root()}")
    for year, product, source, relative in jobs:
        source_facts = _file_facts(source)
        if any(value and int(value[:4]) != year for value in
               (source_facts["first_date"], source_facts["last_date"])):
            raise DownloadError(f"Filename year {year} disagrees with observation dates in {source.name}")
        LOGGER.info("LOCAL %s", relative)
        LOGGER.info("HEADER %s: %s", product, ",".join(csv_header(source)))
        destination = paths.raw_csv("us", PRODUCTS[product], "country", year)
        with TemporaryDirectory(dir=paths.tmp_dir(), prefix="local-us-") as temporary:
            output = Path(temporary) / "output.csv"
            clip_bbox([source], output, region.bbox)
            facts = _file_facts(output)
            try:
                unchanged = destination.is_file() and _file_facts(destination) == facts
            except (DownloadError, duckdb.Error):
                unchanged = False
            if unchanged:
                LOGGER.info("VERIFIED %s", destination.name)
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                output.replace(destination)
                LOGGER.info("SAVED %s", destination.name)
            update_manifest("us", destination, relative)
    return update_manifest("us")


def default_years(science):
    """Every year of the analysis record: record start through the last baseline year."""
    first = date.fromisoformat(science["eras"]["record_start"]).year
    return range(first, science["climatology"]["baseline_years"][1] + 1)


def parse_years(raw):
    try:
        first, last = map(int, raw.split(":"))
        date(first, 1, 1)
        date(last, 12, 31)
    except (ValueError, TypeError):
        raise DownloadError("--years must be an inclusive YYYY:YYYY range") from None
    if last < first:
        raise DownloadError("--years end must not precede start")
    return range(first, last + 1)


def main(argv=None):
    t0 = time.perf_counter()
    parser = cli.stage_parser("ingest.download")
    parser.description = "Stage only local US CSVs from data/; no network downloads."
    parser.add_argument("--via", choices=("country", "api"), default="country")
    parser.add_argument("--years")
    parser.add_argument("--sources", nargs="+")
    args = parser.parse_args(argv)
    try:
        if args.via != "country":
            raise DownloadError("--via api is disabled: only existing local US country CSVs may be used")
        region = config.get_region(args.region or "us")
        config.require_us_region(region)
        if args.years is None:
            try:
                science = config.load_science()
            except FileNotFoundError:
                raise DownloadError("Supply --years YYYY:YYYY until R3 provides science.yaml") from None
            years = default_years(science)
            args.years = f"{years[0]}:{years[-1]}"
        selected = (
            [item for value in args.sources for item in value.split(",")]
            if args.sources else list(PRODUCTS)
        )
        if len(selected) != len(set(selected)) or not set(selected) <= set(PRODUCTS):
            raise DownloadError("Unknown or duplicate --sources; choose from " + ", ".join(PRODUCTS))
        manifest = download_country(region, parse_years(args.years), selected)
        log.finish("download", "us", sum(entry["rows"] for entry in manifest), t0)
        return 0
    except (OSError, duckdb.Error, ValueError, KeyError) as error:
        message = str(error) if isinstance(error, (ValueError, FileNotFoundError)) else type(error).__name__
        print(f"FAIL download: {message}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
