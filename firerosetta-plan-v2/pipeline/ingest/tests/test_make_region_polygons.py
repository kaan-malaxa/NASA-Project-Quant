import json

import pytest

from pipeline.common import config, paths
from pipeline.ingest import make_region_polygons as polygons


@pytest.fixture
def region():
    return config.Region(
        id="test", name="Fabricated region", country="ZZ",
        bbox=[0, 0, 4, 4], polygon="pipeline/config/regions/test.geojson",
        fire_type="", story="", synthetic=False, firms_country_names=["Test"],
    )


def feature(name, coordinates, country="ZZ"):
    return {
        "type": "Feature", "properties": {"name": name, "admin": "Test country", "iso_a2": country},
        "geometry": {"type": "Polygon", "coordinates": [coordinates]},
    }


@pytest.fixture
def source():
    ring_a = [[0.0004, 0], [1.23456, 0], [1.23456, 1], [0.0004, 0]]
    ring_b = [[2, 2], [3, 2], [3, 3], [2, 2]]
    return {
        "type": "FeatureCollection",
        "features": [feature("State A", ring_a), feature("State B", ring_b)],
    }


def test_exact_selection_one_feature_and_three_decimals(region, source):
    result = polygons.select_polygon(source, region, ["State A", "State B"])
    assert len(result["features"]) == 1
    geometry = result["features"][0]["geometry"]
    assert geometry["type"] == "MultiPolygon"
    assert geometry["coordinates"][0][0][1] == [1.235, 0]
    assert polygons.polygon_bbox(result) == [0, 0, 3, 3]
    single = polygons.select_polygon(source, region, ["State A"])
    assert single["features"][0]["geometry"]["type"] == "Polygon"


def test_unmatched_name_lists_candidates_without_guessing(region, source):
    with pytest.raises(ValueError, match="Candidate names: State A, State B"):
        polygons.select_polygon(source, region, ["state a"])
    with pytest.raises(ValueError, match="unique"):
        polygons.select_polygon(source, region, ["State A", "State A"])


def test_country_filter_is_strict(region, source):
    source["features"][0]["properties"]["iso_a2"] = "XY"
    with pytest.raises(ValueError, match="Candidate names: State B"):
        polygons.select_polygon(source, region, ["State A"])


def test_all_admin1_selects_only_configured_country(region, source):
    source["features"].append(feature("Other country", [[0, 0], [9, 0], [9, 9], [0, 0]], country="XY"))
    result = polygons.select_polygon(source, region, None)
    assert len(result["features"][0]["geometry"]["coordinates"]) == 2
    assert polygons.polygon_bbox(result) == [0, 0, 3, 3]


def test_multipolygon_preserves_holes(region, source):
    outer = source["features"][0]["geometry"]["coordinates"][0]
    hole = [[0.2, 0.2], [0.3, 0.2], [0.3, 0.3], [0.2, 0.2]]
    source["features"][0]["geometry"] = {"type": "MultiPolygon", "coordinates": [[outer, hole]]}
    result = polygons.select_polygon(source, region, ["State A", "State B"])
    assert result["features"][0]["geometry"]["coordinates"][0][1] == hole


def test_script_writes_only_after_success(tmp_path, monkeypatch, capsys, region, source):
    path = tmp_path / "source.geojson"
    path.write_text(json.dumps(source), encoding="utf-8")
    monkeypatch.setattr(config, "get_region", lambda region_id: region)
    monkeypatch.setattr(paths, "PROJECT_ROOT", tmp_path)
    output = paths.region_polygon("test")
    assert polygons.main(["--region", "test", "--input", str(path), "--names", "State A"]) == 0
    assert output.is_file()
    before = output.read_bytes()
    assert "test bbox: 0.000, 0.000, 1.235, 1.000" in capsys.readouterr().out
    assert polygons.main(["--region", "test", "--input", str(path), "--names", "Missing"]) == 1
    assert output.read_bytes() == before
    assert "Candidate names: State A, State B" in capsys.readouterr().err


def test_script_all_admin1(tmp_path, monkeypatch, capsys, region, source):
    path = tmp_path / "source.geojson"
    path.write_text(json.dumps(source), encoding="utf-8")
    monkeypatch.setattr(config, "get_region", lambda region_id: region)
    monkeypatch.setattr(paths, "PROJECT_ROOT", tmp_path)
    assert polygons.main(["--region", "test", "--input", str(path), "--all-admin1"]) == 0
    assert "OK make_region_polygons test rows=2" in capsys.readouterr().out
