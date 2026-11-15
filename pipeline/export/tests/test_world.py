"""The web inventory preserves source counts and never merges satellite products."""
import copy

import pytest

from pipeline.common import io, paths
from pipeline.export import world
from pipeline.export.check import run_check
from pipeline.export.sample import write_sample
from pipeline.export.world import catalog

HEADER = {"schema_version": "1.0", "generated_at": "2026-11-15T12:00:00Z", "code_version": "test"}


def source(country="Portugal", product="modis", rows=7, year=2025):
    return {"country": country, "product": product, "year": year, "rows": rows,
            "member": f"{product}/{year}/{product}_{year}_{country}.csv",
            "first_date": "2025-01-01", "last_date": "2025-12-31", "csv_sha256": "a" * 64}


def test_countries_and_products_preserve_original_counts_and_source_identity():
    files = [source(), source(product="viirs-snpp", rows=19), source("United_States", rows=31),
             source("Fiji", rows=0)]
    index = {"archives": [{"files": files}]}
    before = copy.deepcopy(index)
    doc = catalog(index, HEADER, "b" * 64)
    assert [country["id"] for country in doc["countries"]] == ["fiji", "portugal", "us"]
    portugal = doc["countries"][1]
    assert [(record["product"], record["detections"]) for record in portugal["records"]] == [
        ("modis", 7), ("viirs-snpp", 19)]
    assert all(record["kind"] == "observed" for record in portugal["records"])
    assert portugal["records"][0]["csv_sha256"] == files[0]["csv_sha256"]
    assert portugal["records"][0]["url"].endswith(files[0]["member"])
    assert doc["countries"][0]["records"][0]["detections"] == 0
    assert index == before


def test_rejects_duplicate_and_unexpected_source_members():
    with pytest.raises(ValueError, match="Duplicate"):
        catalog({"archives": [{"files": [source(), source()]}]}, HEADER, "b" * 64)
    file = {**source(), "member": "../../outside.csv"}
    with pytest.raises(ValueError, match="Unexpected"):
        catalog({"archives": [{"files": [file]}]}, HEADER, "b" * 64)


def test_rejects_unknown_products_and_invalid_counts():
    for file in (source(product="unknown"), source(rows=-1)):
        with pytest.raises(ValueError, match="Invalid world catalog"):
            catalog({"archives": [{"files": [file]}]}, HEADER, "b" * 64)


def test_publication_preserves_assets_and_rejects_invalid_updates(tmp_path, monkeypatch):
    destination = tmp_path / "web"
    source_index = tmp_path / "index.json"
    scratch = tmp_path / "scratch"
    write_sample(destination)
    original_assets = {path.relative_to(destination): path.read_bytes()
                       for path in destination.rglob("*") if path.is_file() and path.name != "manifest.json"}
    original_manifest = io.read_json(destination / "manifest.json")
    io.write_json({"archives": [{"files": [source()]}]}, source_index)
    monkeypatch.setattr(paths, "web_data_dir", lambda: destination)
    monkeypatch.setattr(paths, "world_index", lambda: source_index)
    monkeypatch.setattr(paths, "tmp_dir", lambda: scratch)
    monkeypatch.setenv("PROMETHEUS_TORCH_DATA_ROOT", str(tmp_path))
    assert world.main([]) == 0
    assert all((destination / path).read_bytes() == value for path, value in original_assets.items())
    manifest = io.read_json(destination / "manifest.json")
    assert [entry for entry in manifest["files"] if entry["path"] != "world.json"] == original_manifest["files"]
    assert all(result.ok for result in run_check(destination))
    published = {name: (destination / name).read_bytes() for name in ("world.json", "manifest.json")}
    io.write_json({"archives": [{"files": [source(), source()]}]}, source_index)
    assert world.main([]) == 1
    assert all((destination / name).read_bytes() == value for name, value in published.items())
