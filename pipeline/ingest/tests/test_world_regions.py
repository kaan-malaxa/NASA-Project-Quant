from collections import Counter

import h3
import pytest
import yaml

from pipeline.common import config, paths, provenance
from pipeline.ingest import world_regions

RES = 6


def square(west, south, size=0.5):
    return {"type": "Polygon", "coordinates": [[
        [west, south], [west + size, south], [west + size, south + size], [west, south + size], [west, south],
    ]]}


def unit(admin, geounit, iso, geometry, adm0=None):
    return {"type": "Feature", "geometry": geometry, "properties": {
        "ADMIN": admin, "GEOUNIT": geounit, "NAME": geounit, "ISO_A2_EH": iso, "ADM0_A3": adm0 or iso}}


UNITS = {"type": "FeatureCollection", "features": [
    unit("France", "France", "FR", square(2, 46)),
    unit("France", "French Guiana", "GF", square(-53, 4)),
    unit("Somalia", "Somalia", "SO", square(45, 2)),
    unit("Somalia", "Puntland", "SO", square(48, 8)),
    unit("Somaliland", "Somaliland", "-99", square(45, 9.5), adm0="SOL"),
    unit("Norway", "Norway", "NO", square(10, 60)),
    unit("Norway", "Bouvet Island", "BV", square(3.2, -54.6)),
    unit("North Macedonia", "North Macedonia", "MK", square(21, 41.5)),
    unit("Tuvalu", "Tuvalu", "TV", square(179.1, -8.5, size=0.001)),
]}
NAMES = ["France", "French_Guiana", "Somalia", "Norway", "Macedonia_Former_Yugoslav_Republic_of",
         "United_States", "Tuvalu"]


def cells_in(geometry, count):
    cells = sorted(h3.geo_to_cells(geometry, RES))
    return Counter({cell: 1 for cell in cells[:count]})


def build(detections=None):
    return world_regions.build_catalog(UNITS, NAMES, RES, detections or {})


def test_territories_sovereigns_renames_and_core_country():
    regions, polygons, diagnostics, unavailable = build()
    by_id = {region["id"]: region for region in regions}
    assert "united-states" not in by_id and "united-states" not in diagnostics  # the core us region
    assert diagnostics["france"]["natural_earth_units"] == ["France"]  # French Guiana is its own region
    assert diagnostics["french-guiana"]["natural_earth_units"] == ["French Guiana"]
    assert by_id["french-guiana"]["country"] == "GF"
    assert diagnostics["norway"]["natural_earth_units"] == ["Norway"]  # Bouvet (BV) is not Norway's outline
    assert by_id["macedonia-former-yugoslav-republic-of"]["name"] == "North Macedonia"
    assert by_id["macedonia-former-yugoslav-republic-of"]["country"] == "MK"
    assert diagnostics["somalia"]["natural_earth_units"] == ["Puntland", "Somalia"]
    assert unavailable == [{"id": "tuvalu", "firms_country": "Tuvalu",
                            "reason": "outline smaller than one H3 counting cell"}]
    france = by_id["france"]
    assert france["bbox"] == [2.0, 46.0, 2.5, 46.5]
    assert france["firms_country_names"] == ["France"] and france["source"] == "firms_world"
    assert france["polygon"] == "pipeline/config/regions/world/france.geojson"
    assert polygons["france"]["features"][0]["geometry"]["type"] == "Polygon"


def test_unclaimed_unit_is_assigned_only_by_the_countrys_own_detections():
    somaliland = UNITS["features"][4]["geometry"]
    somalia = UNITS["features"][2]["geometry"]
    detections = {"Somalia": cells_in(somaliland, 30) + cells_in(somalia, 70),
                  "France": cells_in(UNITS["features"][0]["geometry"], 10)}
    _, _, diagnostics, _ = build(detections)
    assert diagnostics["somalia"]["assigned_by_detections"] == ["Somaliland"]
    assert "Somaliland" in diagnostics["somalia"]["natural_earth_units"]
    assert diagnostics["somalia"]["sample_in_region_share"] == 1.0
    assert diagnostics["france"]["sample_in_region_share"] == 1.0
    # Too few detections: the unit stays unassigned and the share reports what falls outside.
    _, _, few, _ = build({"Somalia": cells_in(somaliland, 5) + cells_in(somalia, 15)})
    assert few["somalia"]["assigned_by_detections"] == []
    assert few["somalia"]["sample_in_region_share"] == 0.75


def test_unmatched_firms_name_is_an_error():
    with pytest.raises(ValueError, match="no Natural Earth match: Atlantis"):
        world_regions.build_catalog(UNITS, ["Atlantis"], RES, {})


def test_written_catalog_loads_under_the_region_rules(tmp_path, monkeypatch):
    config_dir = tmp_path / "config"
    (config_dir / "regions").mkdir(parents=True)
    for name in ("regions.yaml", "science.yaml", "outages.yaml"):
        (config_dir / name).write_bytes(paths.config_file(name).read_bytes())
    monkeypatch.setattr(paths, "config_file", lambda name: config_dir / name)
    monkeypatch.setattr(paths, "PROJECT_ROOT", tmp_path)
    regions, polygons, diagnostics, unavailable = build()
    for region in regions:
        region["polygon"] = paths.world_polygon(region["id"]).relative_to(tmp_path).as_posix()
    world_regions.write_catalog(regions, polygons, diagnostics, unavailable, 2025)
    loaded = {region.id: region for region in config.load_regions()}
    assert {"us", "synthland", "france", "somalia"} <= loaded.keys()
    assert loaded["france"].source == "firms_world" and loaded["us"].source == "local_us"
    assert config.real_region().id == "us"
    assert yaml.safe_load(paths.world_regions_config().read_text(encoding="utf-8"))["unavailable"][0]["id"] == "tuvalu"
    assert paths.world_polygon("france").is_file()
    inputs = provenance.configuration_inputs("france")
    assert paths.world_regions_config() in inputs and paths.config_file("regions.yaml") not in inputs
    # A tampered catalog entry is rejected rather than read as a real region.
    text = paths.world_regions_config().read_text(encoding="utf-8").replace("source: firms_world", "source: local_us", 1)
    paths.world_regions_config().write_text(text, encoding="utf-8")
    with pytest.raises(ValueError, match="Invalid FIRMS world region"):
        config.load_regions()


def test_world_regions_never_change_the_shared_publication_fingerprint(monkeypatch):
    before = provenance.configuration_fingerprint()
    fake = config.Region(id="atlantis", name="Atlantis", country="AT", bbox=[0, 0, 1, 1],
                         polygon="pipeline/config/regions/world/atlantis.geojson", fire_type="x", story="x",
                         synthetic=False, firms_country_names=["Atlantis"], source="firms_world")
    monkeypatch.setattr(config, "load_world_regions", lambda: [fake])
    assert "atlantis" in {region.id for region in config.load_regions()}
    assert provenance.configuration_fingerprint() == before
