"""Generate one analysis region per FIRMS country: world_regions.yaml plus outline polygons.

Outlines come from the Natural Earth 1:10m admin-0 *map units* layer (public domain), so overseas
territories that FIRMS lists as their own country (French Guiana, Svalbard, ...) are not drawn as part
of their sovereign. Matching is by name, with four explicit ISO-identity renames. Map units that no
FIRMS name claims (for example Somaliland, which FIRMS includes in Somalia) are assigned to the FIRMS
country whose own detections fall inside them, and every such assignment is recorded. The share of
each country's detections that fall inside its outline is recorded as a diagnostic, never tuned.
"""
import json
import re
import sys
import time
import unicodedata
from collections import Counter
from pathlib import Path

import h3
import pyarrow.compute as pc
import yaml

from pipeline.common import cli, io, log, paths
from pipeline.ingest import world_data

NAME_KEYS = ("GEOUNIT", "NAME", "NAME_LONG", "NAME_EN", "FORMAL_EN", "NAME_SORT", "BRK_NAME", "SUBUNIT",
             "NAME_ALT")
# FIRMS names that match no Natural Earth name; each is the same ISO 3166 entity under another name.
RENAMES = {
    "Macedonia_Former_Yugoslav_Republic_of": {"admin": "North Macedonia"},          # MK
    "Republic_of_Congo": {"admin": "Republic of the Congo"},                        # CG
    "South_Georgia_and_South_Sandwich_Islands": {"admin": "South Georgia and the Islands"},  # GS
    "Svalbard_and_Jan_Mayen": {"geounits": ["Svalbard", "Jan Mayen"]},              # SJ
}
# Covered by the core `us` region, which keeps its own tracked CSVs and Alaska/Hawaii outline.
CORE_COUNTRIES = {"United_States"}
RESOLUTION_KEY = "count_res"
MIN_ASSIGNED_DETECTIONS = 20
MIN_ASSIGNED_SHARE = 0.5
FIRE_TYPE = "Satellite-detected burning activity"


def norm(text):
    text = unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def region_id(country):
    return country.lower().replace("_", "-")


def _polygons(geometry):
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"]]
    if geometry["type"] == "MultiPolygon":
        return list(geometry["coordinates"])
    raise ValueError(f"Unsupported geometry type: {geometry['type']}")


def _rounded_polygons(polygons):
    """3-decimal coordinates (as for the us outline), without repeated points or degenerate rings."""
    result = []
    for polygon in polygons:
        rings = []
        for ring in polygon:
            points = []
            for x, y in ring:
                point = [round(float(x), 3), round(float(y), 3)]
                if not points or point != points[-1]:
                    points.append(point)
            if points and points[0] != points[-1]:
                points.append(points[0])
            if len({tuple(point) for point in points}) >= 3:
                rings.append(points)
            elif not rings:
                break  # degenerate outer ring: drop the whole polygon
        if rings:
            result.append(rings)
    return result


def _geometry(polygons):
    if len(polygons) == 1:
        return {"type": "Polygon", "coordinates": polygons[0]}
    return {"type": "MultiPolygon", "coordinates": polygons}


def _bbox(polygons):
    points = [point for polygon in polygons for ring in polygon for point in ring]
    return [min(p[0] for p in points), min(p[1] for p in points),
            max(p[0] for p in points), max(p[1] for p in points)]


def _fillable(polygons, resolution):
    """(kept polygons, their cells, dropped count). H3 cannot fill a ring that encircles a pole
    (Antarctica) or a degenerate sliver; those are left out of both the outline and the cells, so the
    drawn outline is always exactly the analysed area."""
    kept, cells, dropped = [], set(), 0
    for polygon in polygons:
        try:
            filled = h3.geo_to_cells({"type": "Polygon", "coordinates": polygon}, resolution)
        except h3.H3BaseException:
            dropped += 1
            continue
        kept.append(polygon)
        cells |= set(filled)
    return kept, cells, dropped


def match_units(firms_names, units):
    """FIRMS name -> list of map-unit indices, plus how it matched. Raises on any unmatched name."""
    by_admin, by_name = {}, {}
    for index, unit in enumerate(units):
        by_admin.setdefault(norm(unit["ADMIN"]), set()).add(unit["ADMIN"])
        for key in NAME_KEYS:
            if unit.get(key):
                by_name.setdefault(norm(unit[key]), set()).add(index)
    admin_units = {}
    for index, unit in enumerate(units):
        admin_units.setdefault(unit["ADMIN"], []).append(index)
    matches, unmatched = {}, []
    for name in firms_names:
        rename = RENAMES.get(name)
        if rename and "admin" in rename:
            if rename["admin"] not in admin_units:
                raise ValueError(f"Natural Earth has no admin unit {rename['admin']!r} for {name}")
            matches[name] = ("admin", list(admin_units[rename["admin"]]))
        elif rename:
            found = [index for index, unit in enumerate(units) if unit["GEOUNIT"] in rename["geounits"]]
            if len(found) != len(rename["geounits"]):
                raise ValueError(f"Natural Earth map units {rename['geounits']} not all found for {name}")
            matches[name] = ("territory", found)
        elif len(by_admin.get(norm(name), ())) == 1:
            admin = next(iter(by_admin[norm(name)]))
            matches[name] = ("admin", list(admin_units[admin]))
        elif norm(name) in by_name:
            matches[name] = ("territory", sorted(by_name[norm(name)]))
        else:
            unmatched.append(name)
    if unmatched:
        raise ValueError("FIRMS countries with no Natural Earth match: " + ", ".join(unmatched))
    # Territories FIRMS lists separately are not part of their sovereign's outline.
    claimed = {index for kind, found in matches.values() if kind == "territory" for index in found}
    result = {}
    for name, (kind, found) in matches.items():
        if kind == "admin":
            found = [index for index in found if index not in claimed]
            if not found:
                result[name] = {"kind": kind, "units": []}
                continue
            iso = Counter(units[index]["ISO_A2_EH"] for index in found).most_common(1)[0][0]
            # Separately coded dependencies (Bouvet, Tokelau, ...) stay unassigned unless data claims them.
            main = [index for index in found if units[index]["GEOUNIT"] == units[index]["ADMIN"]]
            iso = units[main[0]]["ISO_A2_EH"] if main else iso
            found = [index for index in found if units[index]["ISO_A2_EH"] == iso]
        result[name] = {"kind": kind, "units": sorted(found)}
    owners = Counter(index for entry in result.values() for index in entry["units"])
    doubled = [units[index]["GEOUNIT"] for index, count in owners.items() if count > 1]
    if doubled:
        raise ValueError("Map units claimed by two FIRMS countries: " + ", ".join(sorted(doubled)))
    return result


def detection_cells(country, year, resolution, root=None):
    """Counting cells of one country's MODIS detections in one archive year (diagnostic sample)."""
    path = (Path(root) if root else paths.world_root()) / "modis" / str(year) / f"modis_{year}_{country}.parquet"
    if not path.is_file():
        return Counter()
    table = world_data.pq.read_table(path, columns=["latitude", "longitude"])
    lats = pc.cast(table["latitude"], "double").to_pylist()
    lons = pc.cast(table["longitude"], "double").to_pylist()
    return Counter(h3.latlng_to_cell(lat, lon, resolution) for lat, lon in zip(lats, lons))


def build_catalog(geojson, firms_names, resolution, detections):
    """detections: FIRMS name -> Counter of counting cells (the diagnostic sample)."""
    features = geojson["features"]
    units = [feature["properties"] for feature in features]
    names = sorted(name for name in firms_names if name not in CORE_COUNTRIES)
    matched = match_units(names, units)
    filled = [_fillable(_rounded_polygons(_polygons(feature["geometry"])), resolution) for feature in features]
    unit_polygons = [polygons for polygons, _, _ in filled]
    unit_cells = [cells for _, cells, _ in filled]
    # Data-driven assignment of unclaimed map units (never by name).
    claimed = {index for entry in matched.values() for index in entry["units"]}
    cell_unit = {cell: index for index, cells in enumerate(unit_cells) if index not in claimed for cell in cells}
    in_unit = {}
    for name, counter in detections.items():
        for cell, count in counter.items():
            index = cell_unit.get(cell)
            if index is not None:
                in_unit.setdefault(index, Counter())[name] += count
    assigned = {}
    for index, counter in sorted(in_unit.items()):
        owner, count = counter.most_common(1)[0]
        if owner in matched and count >= MIN_ASSIGNED_DETECTIONS and count >= MIN_ASSIGNED_SHARE * sum(counter.values()):
            matched[owner]["units"].append(index)
            assigned.setdefault(owner, []).append(units[index]["GEOUNIT"])
    regions, polygons_out, diagnostics, unavailable = [], {}, {}, []
    for name in names:
        entry = matched[name]
        found = sorted(entry["units"])
        polygons = [polygon for index in found for polygon in unit_polygons[index]]
        cells = set().union(*(unit_cells[index] for index in found)) if found else set()
        rid = region_id(name)
        sample = detections.get(name, Counter())
        total = sum(sample.values())
        inside = sum(count for cell, count in sample.items() if cell in cells)
        diagnostics[rid] = {
            "firms_country": name, "match": entry["kind"],
            "natural_earth_units": sorted(units[index]["GEOUNIT"] for index in found),
            "assigned_by_detections": sorted(assigned.get(name, [])),
            "dropped_polygons": sum(filled[index][2] for index in found),
            "n_cells_r6": len(cells), "sample_detections": total,
            "sample_in_region_share": round(inside / total, 3) if total else None,
        }
        if not polygons or not cells:
            unavailable.append({"id": rid, "firms_country": name,
                                "reason": "outline smaller than one H3 counting cell"})
            continue
        main = next((units[index] for index in found if units[index]["GEOUNIT"] == units[index]["ADMIN"]),
                    units[found[0]])
        if entry["kind"] == "territory" and len(found) > 1:
            label = name.replace("_", " ")
        else:
            label = main["ADMIN"] if entry["kind"] == "admin" else main["GEOUNIT"]
        iso = main["ISO_A2_EH"] if main["ISO_A2_EH"] not in ("-99", "", None) else main["ADM0_A3"]
        polygon_path = paths.world_polygon(rid)
        polygons_out[rid] = {"type": "FeatureCollection", "features": [{
            "type": "Feature", "properties": {"id": rid, "name": label}, "geometry": _geometry(polygons)}]}
        regions.append({
            "id": rid, "name": label, "country": iso, "bbox": _bbox(polygons),
            "polygon": polygon_path.relative_to(paths.PROJECT_ROOT).as_posix(),
            "fire_type": FIRE_TYPE,
            "story": f"Satellite detections across {label}, compared across sensors.",
            "synthetic": False, "firms_country_names": [name], "source": "firms_world",
        })
    return regions, polygons_out, diagnostics, unavailable


def write_catalog(regions, polygons, diagnostics, unavailable, sample_year):
    folder = paths.world_polygon("x").parent
    folder.mkdir(parents=True, exist_ok=True)
    for stale in folder.glob("*.geojson"):
        if stale.stem not in polygons:
            stale.unlink()
    for rid, collection in polygons.items():
        staging = paths.world_polygon(rid).with_suffix(".geojson.part")
        io.write_json(collection, staging, compact=True)
        staging.replace(paths.world_polygon(rid))
    header = (
        "# GENERATED by `uv run python -m pipeline.ingest.world_regions`; do not edit by hand.\n"
        "# One region per NASA FIRMS country (data/FIRMS_world). Outlines: Natural Earth 1:10m admin-0\n"
        "# map units. United_States is the core `us` region in regions.yaml.\n"
    )
    doc = {"regions": regions, "unavailable": unavailable,
           "diagnostics": {"sample": f"MODIS {sample_year} detections, H3 counting cells",
                           "regions": diagnostics}}
    target = paths.world_regions_config()
    staging = target.with_suffix(".yaml.part")
    with staging.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(header)
        yaml.safe_dump(doc, handle, sort_keys=False, allow_unicode=True, width=120)
    staging.replace(target)
    return target


def latest_year(product="modis"):
    years = [archive["year"] for archive in world_data.load_index()["archives"] if archive["product"] == product]
    if not years:
        raise ValueError("The FIRMS world store is empty; run pipeline.ingest.world_data build first")
    return max(years)


def main(argv=None):
    t0 = time.perf_counter()
    parser = cli.stage_parser("ingest.world_regions")
    parser.description = "Generate world_regions.yaml and outlines for every FIRMS country in the world store."
    parser.add_argument("--input", type=Path, default=None,
                        help="Natural Earth ne_10m_admin_0_map_units.geojson (default: data/tmp/)")
    parser.add_argument("--sample-year", type=int, default=None, help="MODIS year used for diagnostics")
    args = parser.parse_args(argv)
    try:
        from pipeline.common import config

        source = args.input or paths.tmp_dir() / "ne_10m_admin_0_map_units.geojson"
        with Path(source).open(encoding="utf-8") as handle:
            geojson = json.load(handle)
        names = list(world_data.countries())
        if not names:
            raise ValueError("The FIRMS world store is empty; run pipeline.ingest.world_data build first")
        resolution = config.load_science()["grid"][RESOLUTION_KEY]
        year = args.sample_year or latest_year()
        detections = {name: detection_cells(name, year, resolution) for name in names}
        regions, polygons, diagnostics, unavailable = build_catalog(geojson, names, resolution, detections)
        write_catalog(regions, polygons, diagnostics, unavailable, year)
        config.load_regions()  # the generated catalog must load under the region rules
        for row in unavailable:
            print(f"UNAVAILABLE {row['id']}: {row['reason']}")
        log.finish("world_regions", "world", len(regions), t0)
        return 0
    except (OSError, ValueError, KeyError) as error:
        print(f"FAIL world_regions: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
