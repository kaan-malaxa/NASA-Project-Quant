"""Publish the lossless FIRMS country inventory for the website's country browser."""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from pipeline.common import cli, io, paths, publication
from pipeline.export.__main__ import generated_at
from pipeline.export.check import load_registry, run_check, schema_errors, validator_for

PRODUCTS = (
    {"id": "modis", "label": "MODIS · Terra and Aqua"},
    {"id": "viirs-snpp", "label": "VIIRS · Suomi NPP"},
    {"id": "viirs-jpss1", "label": "VIIRS · NOAA-20"},
)
SOURCE_BASE = "https://firms.modaps.eosdis.nasa.gov/data/country/"


def catalog(index, header, source_sha256):
    """Copy original per-file counts, dates and checksums, keeping every product separate."""
    countries = {}
    identities = set()
    for archive in index["archives"]:
        for file in archive["files"]:
            country, product, year = file["country"], file["product"], file["year"]
            identity = (country, product, year)
            if identity in identities:
                raise ValueError(f"Duplicate country/product/year: {identity}")
            identities.add(identity)
            expected = f"{product}/{year}/{product}_{year}_{country}.csv"
            if file["member"] != expected:
                raise ValueError(f"Unexpected country member: {file['member']}")
            entry = countries.setdefault(country, {
                "id": "us" if country == "United_States" else country.lower().replace("_", "-"),
                "name": country.replace("_", " "), "firms_name": country, "records": [],
            })
            entry["records"].append({
                "product": product, "year": year, "detections": file["rows"], "kind": "observed",
                "first_date": file["first_date"], "last_date": file["last_date"],
                "csv_sha256": file["csv_sha256"], "url": SOURCE_BASE + file["member"],
            })
    for country in countries.values():
        country["records"].sort(key=lambda record: (record["product"], -record["year"]))
    doc = {**header, "source_sha256": source_sha256, "products": list(PRODUCTS),
           "countries": sorted(countries.values(), key=lambda country: country["name"].casefold())}
    errors = schema_errors(doc, validator_for("world", load_registry()))
    if errors:
        raise ValueError("Invalid world catalog: " + "; ".join(errors))
    return doc


def main(argv=None):
    parser = cli.stage_parser("export.world")
    parser.parse_args(argv)
    try:
        destination = paths.web_data_dir()
        failures = [result.line() for result in run_check(destination) if not result.ok]
        if failures:
            raise ValueError("Published data failed validation: " + " | ".join(failures[:3]))
        source = paths.world_index()
        header = {"schema_version": "1.0", "generated_at": generated_at(), "code_version": io.code_version()}
        doc = catalog(io.read_json(source), header, io.sha256(source))
        # Publish only the new catalog and its manifest entry, preserving every existing asset and header.
        paths.tmp_dir().mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(dir=paths.tmp_dir(), prefix="world-catalog-") as temporary:
            staged = Path(temporary)
            target = staged / "world.json"
            io.write_json(doc, target, compact=True)
            manifest = io.read_json(destination / "manifest.json")
            manifest["files"] = sorted(
                [entry for entry in manifest["files"] if entry["path"] != "world.json"] + [{
                    "path": "world.json", "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
                    "bytes": target.stat().st_size, "kinds": ["observed"],
                }], key=lambda entry: entry["path"])
            failures = schema_errors(manifest, validator_for("manifest", load_registry()))
            if failures:
                raise ValueError("Proposed catalog failed validation: " + " | ".join(failures[:3]))
            io.write_json(manifest, staged / "manifest.json")
            publication.publish({destination / name: staged / name for name in ("world.json", "manifest.json")})
        print(f"OK export.world countries={len(doc['countries'])} "
              f"files={sum(len(country['records']) for country in doc['countries'])}")
    except (OSError, ValueError, KeyError) as error:
        print(f"FAIL export.world: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
