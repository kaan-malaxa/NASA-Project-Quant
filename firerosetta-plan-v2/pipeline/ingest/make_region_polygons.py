"""Extract exact named admin-1 boundaries from a local Natural Earth GeoJSON."""
import json
import sys
import time
from pathlib import Path

from pipeline.common import cli, config, io, log, paths


def select_polygon(geojson, region, names):
    """Combine explicitly named provinces into one Polygon/MultiPolygon feature."""
    if geojson.get("type") != "FeatureCollection":
        raise ValueError("Natural Earth input must be a FeatureCollection")
    candidates = []
    for feature in geojson["features"]:
        properties = feature["properties"]
        if not {"iso_a2", "admin", "name"} <= properties.keys():
            raise ValueError("Natural Earth properties must include iso_a2, admin and name")
        if properties["iso_a2"] == region.country:
            candidates.append(feature)
    available = sorted(feature["properties"]["name"] for feature in candidates)
    if names is None:
        names = available
    selected = []
    if not names or len(names) != len(set(names)):
        raise ValueError("Provide a nonempty list of unique exact admin-1 names")
    for name in names:
        matches = [feature for feature in candidates if feature["properties"]["name"] == name]
        if len(matches) != 1:
            raise ValueError(
                f"Expected one exact match for {region.country}: {name!r}; got {len(matches)}. "
                f"Candidate names: {', '.join(available) or '(none)'}"
            )
        selected.append(matches[0])
    polygons = []
    for feature in selected:
        geometry = feature["geometry"]
        if geometry["type"] == "Polygon":
            polygons.append(geometry["coordinates"])
        elif geometry["type"] == "MultiPolygon":
            polygons.extend(geometry["coordinates"])
        else:
            raise ValueError("Selected geometry must be Polygon or MultiPolygon")
    geometry = (
        {"type": "Polygon", "coordinates": polygons[0]}
        if len(polygons) == 1 else {"type": "MultiPolygon", "coordinates": polygons}
    )
    # Round coordinates here as well as in write_json, so the printed bbox
    # exactly describes the output file.
    def rounded(value):
        return [rounded(item) for item in value] if isinstance(value, list) else round(value, 3)
    geometry["coordinates"] = rounded(geometry["coordinates"])
    return {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature", "properties": {"id": region.id, "name": region.name},
            "geometry": geometry,
        }],
    }


def polygon_bbox(collection):
    geometry = collection["features"][0]["geometry"]
    polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    points = [point for polygon in polygons for ring in polygon for point in ring]
    if not points:
        raise ValueError("Region geometry has no coordinates")
    return [
        min(point[0] for point in points), min(point[1] for point in points),
        max(point[0] for point in points), max(point[1] for point in points),
    ]


def main(argv=None):
    t0 = time.perf_counter()
    parser = cli.stage_parser("ingest.make_region_polygons")
    parser.add_argument("--input", type=Path, required=True, help="Local Natural Earth admin-1 GeoJSON")
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument("--names", nargs="+", help="Exact Natural Earth admin-1 name values")
    selection.add_argument("--all-admin1", action="store_true", help="All admin-1 features for the region country")
    args = parser.parse_args(argv)
    try:
        if not args.region:
            parser.error("--region is required and must exist in approved regions.yaml")
        region = config.get_region(args.region)
        if region.synthetic:
            raise ValueError("Synthetic regions do not use Natural Earth polygons")
        with args.input.open(encoding="utf-8") as handle:
            source = json.load(handle)
        collection = select_polygon(source, region, args.names)
        n_selected = len(args.names) if args.names else sum(
            feature["properties"]["iso_a2"] == region.country for feature in source["features"]
        )
        bbox = polygon_bbox(collection)
        output = paths.region_polygon(region.id)
        staging = output.with_suffix(".geojson.part")
        io.write_json(collection, staging)
        staging.replace(output)
        print(f"{region.id} bbox: " + ", ".join(f"{value:.3f}" for value in bbox))
        print(f"{region.id} configured bbox: " + ", ".join(f"{value:.3f}" for value in region.bbox))
        log.finish("make_region_polygons", region.id, n_selected, t0)
        return 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"FAIL make_region_polygons: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
