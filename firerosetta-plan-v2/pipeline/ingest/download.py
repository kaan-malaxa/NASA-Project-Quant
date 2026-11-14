"""Download FIRMS country or Area API CSVs without changing source columns."""
import csv
import hashlib
import json
import logging
import os
import sys
import time
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import quote

import duckdb
import requests
from dotenv import load_dotenv

from pipeline.common import cli, config, io, log, paths

# Verified against the country page's yearly_summary_files.txt and linked UI.
COUNTRY_URL = (
    "https://firms.modaps.eosdis.nasa.gov/data/country/"
    "{product}/{year}/{product}_{year}_{country}.csv"
)
AREA_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
AVAILABILITY_URL = "https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv"
PRODUCTS = {"modis": "modis", "viirs-snpp": "viirs_snpp", "viirs-jpss1": "viirs_noaa20"}
SOURCES = {
    "MODIS_SP": "modis", "VIIRS_SNPP_SP": "viirs_snpp",
    "VIIRS_NOAA20_SP": "viirs_noaa20", "VIIRS_NOAA20_NRT": "nrt_viirs_noaa20",
}
LOGGER = log.get_logger("download")


class DownloadError(ValueError):
    """A safe-to-print failure that never contains a MAP_KEY or request URL."""


def api_windows(start: date, end: date):
    """Yield inclusive (start, end) windows, never exceeding E3's five days."""
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
    """Keep bbox boundaries; preserve every column as source text, including HHMM."""
    inputs = [Path(path) for path in inputs]
    headers = [csv_header(path) for path in inputs]
    if not headers or any(header != headers[0] for header in headers[1:]):
        raise DownloadError("Input CSV headers differ; refusing to merge countries")
    west, south, east, north = bbox
    with _connection() as connection:
        relation = connection.read_csv([str(path) for path in inputs], header=True, all_varchar=True)
        relation = relation.filter(
            f"try_cast(longitude as double) >= {float(west)!r} AND "
            f"try_cast(longitude as double) <= {float(east)!r} AND "
            f"try_cast(latitude as double) >= {float(south)!r} AND "
            f"try_cast(latitude as double) <= {float(north)!r}"
        )
        # All output rows have a deterministic lexical order, with original text intact.
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


def update_manifest(region, path=None, source=None, via=None):
    """Upsert one entry by filename; unchanged content keeps its original timestamp."""
    manifest = paths.manifest(region)
    entries = json.loads(manifest.read_text(encoding="utf-8")) if manifest.exists() else []
    by_file = {entry["file"]: entry for entry in entries}
    if path is not None:
        path = Path(path)
        facts = _file_facts(path)
        old = by_file.get(path.name)
        if old is None or any(old.get(key) != value for key, value in facts.items()):
            by_file[path.name] = {
                "file": path.name, "source": source, "via": via,
                "downloaded_at": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
                **facts,
            }
    updated = sorted(by_file.values(), key=lambda entry: entry["file"])
    if updated != entries or not manifest.exists():
        manifest.parent.mkdir(parents=True, exist_ok=True)
        staging = manifest.with_suffix(".json.part")
        io.write_json(updated, staging)
        staging.replace(manifest)
    return updated


class Client:
    """Streaming HTTP with one-second pacing, three retries and redacted errors."""

    def __init__(self, session=None, sleep=time.sleep):
        self.session = session if session is not None else requests.Session()
        self.sleep = sleep
        self.called = False
        # urllib3 DEBUG logs include request paths, which contain the MAP_KEY.
        logging.getLogger("urllib3").setLevel(logging.WARNING)

    def fetch(self, url, destination, allow_404=False):
        error = "network error"
        for attempt in range(4):
            if self.called:
                self.sleep(1)
            self.called = True
            response = None
            try:
                response = self.session.get(url, stream=True, timeout=(15, 120))
                if response.status_code == 404 and allow_404:
                    return False
                if response.status_code >= 400:
                    error = f"HTTP {response.status_code}"
                else:
                    with Path(destination).open("wb") as handle:
                        for chunk in response.iter_content(chunk_size=1024 * 1024):
                            if chunk:
                                handle.write(chunk)
                    return True
            except requests.RequestException:
                error = "network error"
            finally:
                if response is not None:
                    response.close()
            if attempt < 3:
                self.sleep(2 ** attempt)
        raise DownloadError(f"Request failed after three retries ({error})")

    def close(self):
        self.session.close()


def download_country(region, years, products, client):
    if not region.firms_country_names:
        raise DownloadError("Country downloads require configured firms_country_names")
    for year in years:
        for product in products:
            destination = paths.raw_csv(region.id, PRODUCTS[product], "country", year)
            if destination.exists():
                LOGGER.info("EXISTS %s", destination.name)
                update_manifest(region.id, destination, product, "country")
                continue
            with TemporaryDirectory(dir=paths.tmp_dir(), prefix="country-") as temporary:
                work = Path(temporary)
                clipped = []
                for index, country in enumerate(region.firms_country_names):
                    raw = next(
                        (path for path in paths.country_csv_candidates(product, year, country) if path.is_file()),
                        None,
                    )
                    local = raw is not None
                    if local:
                        LOGGER.info("LOCAL %s", raw.name)
                    else:
                        raw = work / f"country-{index}.csv"
                        url = COUNTRY_URL.format(product=product, year=year, country=quote(country, safe=""))
                        if not client.fetch(url, raw, allow_404=True):
                            LOGGER.warning("404 %s %s %s: skipped", product, year, country)
                            continue
                    header = csv_header(raw)
                    LOGGER.info("HEADER %s: %s", product, ",".join(header))
                    part = work / f"clipped-{index}.csv"
                    clip_bbox([raw], part, region.bbox)
                    if not local:
                        raw.unlink()
                    clipped.append(part)
                if not clipped:
                    continue
                output = work / "output.csv"
                clip_bbox(clipped, output, region.bbox)
                _file_facts(output)  # Validate before publishing.
                destination.parent.mkdir(parents=True, exist_ok=True)
                output.replace(destination)
                update_manifest(region.id, destination, product, "country")
                LOGGER.info("SAVED %s", destination.name)
    return update_manifest(region.id)


def check_availability(sources, key, client, work):
    target = work / "availability.csv"
    client.fetch(f"{AVAILABILITY_URL}/{quote(key, safe='')}/all", target)
    with target.open(encoding="utf-8-sig", newline="") as handle:
        # No undocumented E4 column names are assumed: look for the exact source values.
        available = {cell for row in csv.reader(handle) for cell in row}
    missing = sorted(set(sources) - available)
    if missing:
        raise DownloadError("E4 does not list the requested source(s): " + ", ".join(missing))


def download_api(region, years, sources, key, client):
    with TemporaryDirectory(dir=paths.tmp_dir(), prefix="api-") as temporary:
        work = Path(temporary)
        check_availability(sources, key, client, work)
        bbox = ",".join(str(value) for value in region.bbox)
        for source in sources:
            for year in years:
                start, end = date(year, 1, 1), min(date(year, 12, 31), datetime.now(UTC).date())
                if start > end:
                    continue
                assembled = work / "assembled.csv"
                header = None
                with assembled.open("w", encoding="utf-8", newline="") as handle:
                    writer = csv.writer(handle, lineterminator="\n")
                    for first, last in api_windows(start, end):
                        window = work / "window.csv"
                        count = (last - first).days + 1
                        client.fetch(f"{AREA_URL}/{quote(key, safe='')}/{source}/{bbox}/{count}/{first}", window)
                        current = csv_header(window)
                        if header is None:
                            header = current
                            writer.writerow(header)
                            LOGGER.info("HEADER %s: %s", source, ",".join(header))
                        elif current != header:
                            raise DownloadError("Area API CSV header changed between windows")
                        with window.open(encoding="utf-8-sig", newline="") as rows:
                            reader = csv.reader(rows)
                            next(reader)
                            for row in reader:
                                if len(row) != len(header):
                                    raise DownloadError("Area API returned a malformed CSV row")
                                acquired = date.fromisoformat(row[header.index("acq_date")])
                                if not first <= acquired <= last:
                                    raise DownloadError("Area API returned an acq_date outside its requested window")
                                writer.writerow(row)
                output = work / "output.csv"
                clip_bbox([assembled], output, region.bbox)
                _file_facts(output)
                destination = paths.raw_csv(region.id, SOURCES[source], "api", year)
                destination.parent.mkdir(parents=True, exist_ok=True)
                output.replace(destination)
                update_manifest(region.id, destination, source, "api")
                LOGGER.info("SAVED %s", destination.name)
    return update_manifest(region.id)


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
    parser.add_argument("--via", choices=("country", "api"), default="country")
    parser.add_argument("--years")
    parser.add_argument("--sources", nargs="+")
    args = parser.parse_args(argv)
    client = None
    try:
        if not args.region:
            parser.error("--region is required")
        region = config.get_region(args.region)
        if region.synthetic:
            raise DownloadError("Synthetic regions use pipeline.synth, not FIRMS downloads")
        if args.years is None:
            try:
                science = config.load_science()
            except FileNotFoundError:
                raise DownloadError("Supply --years YYYY:YYYY until R3 provides science.yaml") from None
            args.years = f'{date.fromisoformat(science["eras"]["record_start"]).year}:'
            args.years += str(science["climatology"]["baseline_years"][1])
        years = parse_years(args.years)
        allowed = PRODUCTS if args.via == "country" else SOURCES
        selected = (
            [item for value in args.sources for item in value.split(",")]
            if args.sources else list(PRODUCTS) if args.via == "country" else list(SOURCES)[:3]
        )
        if len(selected) != len(set(selected)) or not set(selected) <= set(allowed):
            raise DownloadError("Unknown or duplicate --sources; choose from " + ", ".join(allowed))
        paths.tmp_dir().mkdir(parents=True, exist_ok=True)
        client = Client()
        if args.via == "country":
            manifest = download_country(region, years, selected, client)
        else:
            load_dotenv(paths.env_file())
            key = os.environ.get("FIRMS_MAP_KEY", "").strip()
            if not key:
                raise DownloadError("FIRMS_MAP_KEY is required for --via api; set it in .env or the environment")
            manifest = download_api(region, years, selected, key, client)
        log.finish("download", region.id, sum(entry["rows"] for entry in manifest), t0)
        return 0
    except (DownloadError, OSError, duckdb.Error, ValueError, KeyError):
        # Never echo arbitrary HTTP, DuckDB or file contents: they may contain a key.
        error = sys.exc_info()[1]
        message = str(error) if isinstance(error, DownloadError) else type(error).__name__
        print(f"FAIL download: {message}", file=sys.stderr)
        return 1
    finally:
        if client is not None:
            client.close()


if __name__ == "__main__":
    sys.exit(main())
