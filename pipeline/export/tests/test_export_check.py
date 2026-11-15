"""Tests for contracts/*.schema.json, contracts/examples/ and pipeline/export/check.py."""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from pipeline.export.check import (
    SCHEMA_DIR,
    load_json_strict,
    load_registry,
    report,
    run_check,
    validator_for,
)

EXAMPLES = SCHEMA_DIR / "examples"
FILE_SCHEMAS = sorted(p.name.removesuffix(".schema.json") for p in SCHEMA_DIR.glob("*.schema.json"))
FILE_SCHEMAS.remove("common")
EXPECTED = {
    "regions", "weekly", "monthly", "daily", "climatology", "season", "trend", "ruler",
    "nowcast", "hex", "calibration", "downloads", "methods", "manifest",
    "outline", "period", "period_index", "spatial", "spatial_index", "world",
}


# ------------------------------------------------------------------ schemas and examples
def test_every_contract_file_has_a_schema_and_an_example():
    assert set(FILE_SCHEMAS) == EXPECTED
    assert {p.stem for p in EXAMPLES.glob("*.json")} == EXPECTED


@pytest.mark.parametrize("name", FILE_SCHEMAS + ["common"])
def test_schema_is_valid_draft_2020_12(name):
    schema = json.loads((SCHEMA_DIR / f"{name}.schema.json").read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)


def _objects(node, where="#"):
    if isinstance(node, dict):
        if node.get("type") == "object":
            yield where, node
        for k, v in node.items():
            yield from _objects(v, f"{where}/{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from _objects(v, f"{where}/{i}")


@pytest.mark.parametrize("name", FILE_SCHEMAS + ["common"])
def test_every_object_forbids_additional_properties(name):
    schema = json.loads((SCHEMA_DIR / f"{name}.schema.json").read_text(encoding="utf-8"))
    for where, node in _objects(schema):
        assert node.get("additionalProperties") is False, f"{name}{where}"


@pytest.mark.parametrize("name", FILE_SCHEMAS)
def test_example_validates_against_its_schema(name):
    validator = validator_for(name, load_registry())
    doc = load_json_strict(EXAMPLES / f"{name}.json")
    errors = [e.message for e in validator.iter_errors(doc)]
    assert errors == []


@pytest.mark.parametrize("name", FILE_SCHEMAS)
def test_header_fields_are_required(name):
    validator = validator_for(name, load_registry())
    for key in (("type", "features") if name == "outline" else ("schema_version", "generated_at", "code_version")):
        doc = load_json_strict(EXAMPLES / f"{name}.json")
        del doc[key]
        assert not validator.is_valid(doc), key


def test_missing_weekly_value_is_null_not_rejected():
    validator = validator_for("weekly", load_registry())
    doc = load_json_strict(EXAMPLES / "weekly.json")
    doc["rows"][0].update(value=None, lo=None, hi=None, kind="missing", source=None)
    assert validator.is_valid(doc)


def test_enum_values_are_enforced():
    validator = validator_for("weekly", load_registry())
    doc = load_json_strict(EXAMPLES / "weekly.json")
    doc["rows"][0]["kind"] = "guessed"
    assert not validator.is_valid(doc)


def test_eyesight_absent_needs_only_region_and_status():
    validator = validator_for("methods", load_registry())
    doc = load_json_strict(EXAMPLES / "methods.json")
    doc["eyesight"] = [{"region": "synthland", "status": "absent"}]
    assert validator.is_valid(doc)
    doc["eyesight"] = [{"region": "synthland", "status": "validated"}]
    assert not validator.is_valid(doc)


# ------------------------------------------------------------------ the checker on a data tree
@pytest.fixture(scope="module")
def sample_template(tmp_path_factory):
    from pipeline.export.sample import write_sample
    data = tmp_path_factory.mktemp("sample-template")
    write_sample(data)
    return data


@pytest.fixture
def site(tmp_path: Path, sample_template) -> Path:
    data = tmp_path / "data"
    shutil.copytree(sample_template, data)
    return data


def _by_path(results):
    return {r.path: r for r in results}


def test_valid_site_passes(site, capsys):
    results = run_check(site)
    assert [r.line() for r in results if not r.ok] == []
    assert len(results) == 18
    assert report(results) == 0
    out = capsys.readouterr().out.splitlines()
    assert len(out) == 18 and all(line.startswith("OK") for line in out)


def test_missing_data_folder_fails(tmp_path):
    results = run_check(tmp_path / "nope")
    assert report(results) == 1


def test_schema_violation_fails_with_path(site, capsys):
    doc = json.loads((site / "us/weekly.json").read_text(encoding="utf-8"))
    doc["rows"][0]["extra_field"] = 1
    (site / "us/weekly.json").write_text(json.dumps(doc), encoding="utf-8")
    res = _by_path(run_check(site))["us/weekly.json"]
    assert not res.ok and "rows/0" in res.errors[0]
    assert report(run_check(site)) == 1
    assert "FAIL us/weekly.json: rows/0" in capsys.readouterr().out


@pytest.mark.parametrize("token", ["NaN", "Infinity", "-Infinity", "1e400"])
def test_non_finite_json_fails(site, token):
    path = site / "us/weekly.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["rows"][0]["value"] = "NON_FINITE_TOKEN"
    path.write_text(json.dumps(doc).replace('"NON_FINITE_TOKEN"', token), encoding="utf-8")
    res = _by_path(run_check(site))["us/weekly.json"]
    assert not res.ok and "not valid JSON" in res.errors[0]


def test_non_finite_csv_fails(site):
    (site / "us/cells_monthly.csv").write_text("h3_r5,ym,aqua,viirs\n85a,201510,nan,7\n", encoding="utf-8")
    res = _by_path(run_check(site))["us/cells_monthly.csv"]
    assert not res.ok and "non-finite" in res.errors[0]


@pytest.mark.parametrize("name", ["cells_monthly.csv", "hotspots_recent.csv"])
def test_wrong_csv_header_fails(site, name):
    path = site / "us" / name
    lines = path.read_text(encoding="utf-8").splitlines()
    lines[0] = lines[0].replace(",", ";", 1)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    res = _by_path(run_check(site))[f"us/{name}"]
    assert not res.ok and "header" in res.errors[0]


def test_listed_file_missing_fails_regions(site):
    (site / "us/trend.json").unlink()
    res = _by_path(run_check(site))["regions.json"]
    assert not res.ok and "'trend'" in res.errors[0]


def test_listed_optional_file_missing_fails_regions(site):
    (site / "us/downloads.json").unlink()
    res = _by_path(run_check(site))["regions.json"]
    assert not res.ok and "'downloads'" in res.errors[0]


def test_missing_regions_json_fails(site):
    (site / "regions.json").unlink()
    assert not _by_path(run_check(site))["regions.json"].ok


def test_sample_kind_requires_manifest_flag(site):
    manifest = json.loads((site / "manifest.json").read_text(encoding="utf-8"))
    manifest["contains_sample"] = False
    (site / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    doc = json.loads((site / "us/weekly.json").read_text(encoding="utf-8"))
    doc["rows"][0]["kind"] = "sample"
    (site / "us/weekly.json").write_text(json.dumps(doc), encoding="utf-8")
    res = _by_path(run_check(site))["us/weekly.json"]
    assert not res.ok and "contains_sample" in res.errors[0]

    manifest = json.loads((site / "manifest.json").read_text(encoding="utf-8"))
    manifest["contains_sample"] = True
    (site / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    assert _by_path(run_check(site))["us/weekly.json"].ok


def test_unexpected_file_fails(site):
    (site / "us/notes.txt").write_text("hi", encoding="utf-8")
    assert not _by_path(run_check(site))["us/notes.txt"].ok


def test_outline_must_have_one_feature(site):
    (site / "us/outline.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": []}), encoding="utf-8")
    assert not _by_path(run_check(site))["us/outline.geojson"].ok


def test_cli_accepts_the_common_stage_flags(site, monkeypatch, tmp_path):
    """pipeline.run passes --data-root, --pass and --log-level to every stage, export included."""
    from pipeline.export import __main__ as cli

    monkeypatch.setattr(cli, "default_data_dir", lambda: site)
    monkeypatch.setenv("PROMETHEUS_TORCH_DATA_ROOT", "unset-by-test")
    args = ["--check", "--data-root", str(tmp_path), "--pass", "D", "--log-level", "INFO"]
    assert cli.main(args) == 0
    assert os.environ["PROMETHEUS_TORCH_DATA_ROOT"] == str(tmp_path)
