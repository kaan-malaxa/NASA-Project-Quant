"""NASA FIRMS all-country yearly archives: fetch, store losslessly as compressed Parquet, read back.

Every country CSV inside every ``{product}_{year}_all_countries.zip`` becomes one Parquet file at
``data/FIRMS_world/{product}/{year}/{product}_{year}_{Country}.parquet``. All columns are kept as the
original text, so the exact original CSV bytes can be rebuilt; each conversion is proved byte-exact
against the original SHA-256 before it is accepted. Zstandard compression keeps the store at roughly
one fifth of the extracted CSV size (smaller than the zips) while every row stays directly queryable.
"""
import hashlib
import io
import json
import re
import sys
import time
import zipfile
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.csv as pacsv
import pyarrow.parquet as pq

from pipeline.common import cli, log, paths

ARCHIVE_URL = "https://firms.modaps.eosdis.nasa.gov/data/country/zips/{product}_{year}_all_countries.zip"
# First archive year published on the FIRMS country page for each product.
FIRST_YEAR = {"modis": 2000, "viirs-snpp": 2012, "viirs-jpss1": 2018}
MEMBER = re.compile(
    r"^(?P<product>modis|viirs-snpp|viirs-jpss1)/(?P<year>\d{4})/"
    r"(?P=product)_(?P=year)_(?P<country>[A-Za-z0-9_\-]+)\.csv$"
)
ARCHIVE = re.compile(r"^(?P<product>modis|viirs-snpp|viirs-jpss1)_(?P<year>\d{4})_all_countries\.zip$")
COMPRESSION_LEVEL = 12
INDEX_VERSION = 1
METADATA_KEY = b"firms_world"
LOGGER = log.get_logger("world_data")


class WorldDataError(ValueError):
    """An archive or stored file cannot be used without losing or inventing source data."""


def archive_name(product, year):
    if product not in FIRST_YEAR:
        raise WorldDataError(f"Unknown FIRMS product: {product}")
    return f"{product}_{int(year)}_all_countries.zip"


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def _sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


# ------------------------------------------------------------------ lossless CSV <-> table
def _layout(raw):
    """How the original bytes are laid out, so they can be rebuilt exactly."""
    bom = raw.startswith(b"\xef\xbb\xbf")
    body = raw[3:] if bom else raw
    first = body.split(b"\n", 1)[0]
    newline = "\r\n" if first.endswith(b"\r") else "\n"
    header = first.decode("utf-8").rstrip("\r").split(",")
    if not header or len(header) != len(set(header)) or any(not name for name in header):
        raise WorldDataError("CSV header must have unique, nonempty column names")
    return {"bom": bom, "newline": newline, "trailing_newline": body.endswith(newline.encode()),
            "header": header}


def parse_csv(raw):
    """Parse every column as text; return (table, layout)."""
    layout = _layout(raw)
    table = pacsv.read_csv(
        io.BytesIO(raw),
        read_options=pacsv.ReadOptions(encoding="utf-8"),
        parse_options=pacsv.ParseOptions(newlines_in_values=False),
        convert_options=pacsv.ConvertOptions(
            column_types={name: pa.string() for name in layout["header"]},
            strings_can_be_null=False, quoted_strings_can_be_null=False,
        ),
    )
    if table.column_names != layout["header"]:
        raise WorldDataError("Parsed columns differ from the CSV header")
    return table, layout


def csv_bytes(table, layout):
    """Rebuild the original CSV bytes from a text table and its recorded layout."""
    newline = layout["newline"]
    head = ",".join(table.column_names)
    if table.num_rows:
        columns = [pc.fill_null(table[name], "") for name in table.column_names]
        rows = pc.binary_join_element_wise(*columns, ",") if len(columns) > 1 else columns[0]
        lines = newline.join([head, *rows.to_pylist()])
    else:
        lines = head
    text = lines + (newline if layout["trailing_newline"] else "")
    return (b"\xef\xbb\xbf" if layout["bom"] else b"") + text.encode("utf-8")


def _date_range(table):
    """(first, last, invalid): valid acq_date range and how many rows have no parseable date."""
    if not table.num_rows or "acq_date" not in table.column_names:
        return None, None, 0
    parsed = pc.strptime(table["acq_date"], format="%Y-%m-%d", unit="s", error_is_null=True)
    invalid = parsed.null_count
    if invalid == table.num_rows:
        return None, None, invalid
    first, last = pc.min(parsed).as_py(), pc.max(parsed).as_py()
    return first.date().isoformat(), last.date().isoformat(), invalid


def convert_member(raw, destination, member):
    """Store one original CSV as Parquet only if the bytes rebuild exactly."""
    table, layout = parse_csv(raw)
    expected = sha256_bytes(raw)
    if sha256_bytes(csv_bytes(table, layout)) != expected:
        raise WorldDataError(f"Lossless round trip failed for {member}; refusing to store it")
    first, last, invalid = _date_range(table)
    facts = {"member": member, "rows": table.num_rows, "csv_bytes": len(raw), "csv_sha256": expected,
             "first_date": first, "last_date": last, "invalid_dates": invalid, **layout}
    metadata = {METADATA_KEY: json.dumps(facts, sort_keys=True).encode("utf-8")}
    table = table.replace_schema_metadata(metadata)
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = destination.with_name(destination.name + ".part")
    pq.write_table(table, staging, compression="zstd", compression_level=COMPRESSION_LEVEL)
    staging.replace(destination)
    return facts


def stored_facts(path):
    """The original-CSV facts embedded in a stored Parquet file."""
    metadata = pq.read_schema(path).metadata or {}
    if METADATA_KEY not in metadata:
        raise WorldDataError(f"{path} is not a FIRMS world file")
    return json.loads(metadata[METADATA_KEY].decode("utf-8"))


def read_table(product, year, country):
    path = paths.world_file(product, year, country)
    if not path.is_file():
        raise FileNotFoundError(f"No FIRMS world file for {product} {year} {country}: {path}")
    return pq.read_table(path)


def original_csv(product, year, country):
    """The exact original FIRMS CSV bytes, verified against the recorded SHA-256."""
    path = paths.world_file(product, year, country)
    if not path.is_file():
        raise FileNotFoundError(f"No FIRMS world file for {product} {year} {country}: {path}")
    facts = stored_facts(path)
    data = csv_bytes(pq.read_table(path), facts)
    if sha256_bytes(data) != facts["csv_sha256"]:
        raise WorldDataError(f"{path} no longer rebuilds its original CSV")
    return data


# ------------------------------------------------------------------ archives
def _convert_archive(archive, root):
    """Worker: convert every CSV member of one archive; returns its index records."""
    archive = Path(archive)
    match = ARCHIVE.match(archive.name)
    if not match:
        raise WorldDataError(f"Unexpected archive name: {archive.name}")
    product, year = match["product"], int(match["year"])
    records, readmes = [], []
    with zipfile.ZipFile(archive) as bundle:
        for info in sorted(bundle.infolist(), key=lambda item: item.filename):
            name = info.filename
            if info.is_dir():
                continue
            if name.endswith(".txt"):
                target = Path(root) / product / str(year) / Path(name).name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(bundle.read(info))  # ZipFile checks the CRC on read
                readmes.append(target.relative_to(root).as_posix())
                continue
            member = MEMBER.match(name)
            if not member or member["product"] != product or int(member["year"]) != year:
                raise WorldDataError(f"Unexpected member {name!r} in {archive.name}")
            country = member["country"]
            destination = Path(root) / product / str(year) / f"{product}_{year}_{country}.parquet"
            facts = convert_member(bundle.read(info), destination, name)
            records.append({
                "product": product, "year": year, "country": country,
                "path": destination.relative_to(root).as_posix(),
                "parquet_bytes": destination.stat().st_size, "parquet_sha256": _sha256_file(destination),
                **{key: facts[key] for key in (
                    "rows", "csv_bytes", "csv_sha256", "first_date", "last_date", "invalid_dates", "header",
                    "newline", "trailing_newline", "bom", "member")},
            })
    for record in records:
        if record["first_date"] and int(record["first_date"][:4]) != year:
            raise WorldDataError(f"{record['member']} has dates outside its archive year")
        if record["last_date"] and int(record["last_date"][:4]) != year:
            raise WorldDataError(f"{record['member']} has dates outside its archive year")
    return {"archive": archive.name, "product": product, "year": year,
            "url": ARCHIVE_URL.format(product=product, year=year),
            "zip_bytes": archive.stat().st_size, "zip_sha256": _sha256_file(archive),
            "members": len(records), "readmes": readmes, "files": records}


def load_index(root=None):
    path = Path(root) / "index.json" if root else paths.world_index()
    if not path.is_file():
        return {"version": INDEX_VERSION, "archives": []}
    doc = json.loads(path.read_text(encoding="utf-8"))
    if doc.get("version") != INDEX_VERSION:
        raise WorldDataError(f"Unsupported world index version in {path}")
    return doc


def write_index(doc, root=None):
    path = Path(root) / "index.json" if root else paths.world_index()
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = {**doc, "archives": sorted(doc["archives"], key=lambda row: (row["product"], row["year"]))}
    staging = path.with_name(path.name + ".part")
    staging.write_text(json.dumps(doc, indent=1, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    staging.replace(path)
    return path


def build(archives, root=None, workers=4, delete_archives=False):
    """Convert archives into the store; archives already indexed with the same bytes are skipped."""
    root = Path(root) if root else paths.world_root()
    index = load_index(root)
    done = {row["archive"]: row for row in index["archives"]}
    todo = []
    for archive in sorted(map(Path, archives)):
        old = done.get(archive.name)
        if old and old["zip_bytes"] == archive.stat().st_size and old["zip_sha256"] == _sha256_file(archive):
            LOGGER.info("UNCHANGED %s", archive.name)
            continue
        todo.append(archive)
    with ProcessPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = {pool.submit(_convert_archive, str(archive), str(root)): archive for archive in todo}
        for future in as_completed(futures):
            record = future.result()
            index["archives"] = [row for row in index["archives"] if row["archive"] != record["archive"]]
            index["archives"].append(record)
            write_index(index, root)
            LOGGER.info("STORED %s: %d country files", record["archive"], record["members"])
    if delete_archives:
        indexed = {row["archive"]: row for row in index["archives"]}
        for archive in map(Path, archives):
            row = indexed.get(archive.name)
            if row and archive.is_file() and row["zip_sha256"] == _sha256_file(archive) and not verify(
                root, archives=[archive.name], full=False
            ):
                archive.unlink()
                LOGGER.info("DELETED verified archive %s", archive.name)
    return index


def verify(root=None, archives=None, full=False):
    """Return a list of problems; empty means every indexed file is present and intact."""
    root = Path(root) if root else paths.world_root()
    problems = []
    for archive in load_index(root)["archives"]:
        if archives and archive["archive"] not in archives:
            continue
        for record in archive["files"]:
            path = root / record["path"]
            if not path.is_file():
                problems.append(f"missing {record['path']}")
                continue
            if _sha256_file(path) != record["parquet_sha256"]:
                problems.append(f"changed {record['path']}")
                continue
            if full:
                facts = stored_facts(path)
                if sha256_bytes(csv_bytes(pq.read_table(path), facts)) != record["csv_sha256"]:
                    problems.append(f"does not rebuild original CSV: {record['path']}")
    return problems


def countries(root=None):
    """Every FIRMS country name in the store with its products and years."""
    result = {}
    for archive in load_index(root)["archives"]:
        for record in archive["files"]:
            entry = result.setdefault(record["country"], {})
            entry.setdefault(record["product"], []).append(record["year"])
    return {name: {product: sorted(years) for product, years in sorted(products.items())}
            for name, products in sorted(result.items())}


def records_for(country, root=None):
    return sorted(
        (record for archive in load_index(root)["archives"] for record in archive["files"]
         if record["country"] == country),
        key=lambda record: (record["product"], record["year"]),
    )


FAMILIES = {"modis": "modis", "viirs-snpp": "viirs", "viirs-jpss1": "viirs"}


def daily_counts(root=None, output=None):
    """SD-08 coverage reference: unfiltered raw rows per sensor and UTC date over all countries.

    A sensor-day with zero rows anywhere on Earth has no data; a zero inside one small country is a
    real zero. Rows whose acq_date does not parse are left out, exactly as cleaning drops them.
    """
    import duckdb
    import pandas as pd

    from pipeline.common import io, sensors

    root = Path(root) if root else paths.world_root()
    totals = {}
    with duckdb.connect() as connection:
        for product, family in FAMILIES.items():
            files = sorted(path.as_posix() for path in (root / product).glob("*/*.parquet"))
            if not files:
                continue
            rows = connection.execute(
                "SELECT satellite, try_cast(acq_date AS DATE) AS day, count(*) FROM read_parquet(?) "
                "GROUP BY ALL", [files],
            ).fetchall()
            for satellite, day, count in rows:
                if day is None:
                    continue
                key = (sensors.normalise_sensor(satellite, family), day)
                totals[key] = totals.get(key, 0) + int(count)
    frame = pd.DataFrame(
        [{"sensor": sensor, "utc_date": day, "n_raw_rows": count}
         for (sensor, day), count in sorted(totals.items())],
        columns=["sensor", "utc_date", "n_raw_rows"],
    )
    output = Path(output) if output else root / "raw_daily_counts.parquet"
    staging = output.with_name(output.name + ".part")
    io.write_parquet(frame, staging, "raw_daily_counts")
    staging.replace(output)
    return frame


# ------------------------------------------------------------------ network (FIRMS E2)
def fetch(products, years, dest=None, session=None, timeout=120):
    """Download all-country archives with resume; a year FIRMS has not published is skipped."""
    import requests

    dest = Path(dest) if dest else paths.world_archives_dir()
    dest.mkdir(parents=True, exist_ok=True)
    session = session or requests.Session()
    session.headers.setdefault("User-Agent", "prometheus-torch-pipeline")
    saved = []
    for product in products:
        for year in years:
            if year < FIRST_YEAR[product]:
                continue
            url = ARCHIVE_URL.format(product=product, year=year)
            head = session.head(url, timeout=timeout, allow_redirects=True)
            if head.status_code == 404:
                LOGGER.info("NOT PUBLISHED %s", url)
                continue
            head.raise_for_status()
            size = int(head.headers["Content-Length"])
            target = dest / archive_name(product, year)
            for _ in range(5):
                have = target.stat().st_size if target.is_file() else 0
                if have == size:
                    break
                if have > size:
                    target.unlink()
                    have = 0
                headers = {"Range": f"bytes={have}-"} if have else {}
                with session.get(url, headers=headers, stream=True, timeout=timeout) as response:
                    response.raise_for_status()
                    mode = "ab" if have and response.status_code == 206 else "wb"
                    with target.open(mode) as handle:
                        for chunk in response.iter_content(1 << 20):
                            handle.write(chunk)
            if not target.is_file() or target.stat().st_size != size:
                raise WorldDataError(f"Incomplete download: {url}")
            LOGGER.info("SAVED %s (%d bytes)", target.name, size)
            saved.append(target)
    return saved


def _years(raw):
    first, last = map(int, raw.split(":"))
    if last < first:
        raise WorldDataError("--years end must not precede start")
    return range(first, last + 1)


def main(argv=None):
    t0 = time.perf_counter()
    parser = cli.stage_parser("ingest.world_data")
    parser.description = "Fetch, store, verify and read the NASA FIRMS all-country archives."
    parser.add_argument("command", choices=("fetch", "build", "counts", "verify", "list", "csv"))
    parser.add_argument("--products", nargs="+", default=list(FIRST_YEAR), choices=list(FIRST_YEAR))
    parser.add_argument("--years", default=f"2000:{time.gmtime().tm_year}")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--delete-archives", action="store_true",
                        help="after a verified build, delete the downloaded zips")
    parser.add_argument("--full", action="store_true", help="verify: also rebuild every original CSV")
    parser.add_argument("--country", help="csv: FIRMS country name, e.g. Brazil")
    parser.add_argument("--year", type=int, help="csv: archive year")
    parser.add_argument("--output", type=Path, help="csv: where to write the original CSV")
    args = parser.parse_args(argv)
    try:
        rows = 0
        if args.command == "fetch":
            rows = len(fetch(args.products, _years(args.years)))
        elif args.command == "build":
            archives = sorted(
                path for path in paths.world_archives_dir().glob("*_all_countries.zip")
                if ARCHIVE.match(path.name)["product"] in args.products
                and int(ARCHIVE.match(path.name)["year"]) in _years(args.years)
            )
            if not archives:
                raise WorldDataError(f"No archives in {paths.world_archives_dir()}; run fetch first")
            index = build(archives, workers=args.workers, delete_archives=args.delete_archives)
            daily_counts()
            rows = sum(record["rows"] for archive in index["archives"] for record in archive["files"])
        elif args.command == "counts":
            rows = len(daily_counts())
        elif args.command == "verify":
            problems = verify(full=args.full)
            for problem in problems[:50]:
                print(f"PROBLEM {problem}", file=sys.stderr)
            if problems:
                raise WorldDataError(f"{len(problems)} stored files failed verification")
            rows = sum(len(archive["files"]) for archive in load_index()["archives"])
        elif args.command == "list":
            listing = countries()
            for name, products in listing.items():
                print(name, json.dumps(products))
            rows = len(listing)
        else:
            if not (args.country and args.year and len(args.products) == 1 and args.output):
                raise WorldDataError("csv needs --products P --year Y --country C --output FILE")
            data = original_csv(args.products[0], args.year, args.country)
            args.output.write_bytes(data)
            rows = data.count(b"\n")
        log.finish("world_data", args.command, rows, t0)
        return 0
    except (OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        print(f"FAIL world_data: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
