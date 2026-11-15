from types import SimpleNamespace

import pytest

from pipeline.common import io, provenance


def test_configuration_and_derived_tampering_fail(tmp_path, monkeypatch):
    config = tmp_path / "science.yaml"
    config.write_text("seed: 7", encoding="utf-8")
    output = tmp_path / "table.parquet"
    output.write_bytes(b"known output")
    stamp = tmp_path / "stamp.json"
    monkeypatch.setattr(provenance, "configuration_inputs", lambda region: [config])
    monkeypatch.setattr(provenance.paths, "stage_provenance", lambda *args: stamp)
    provenance.record_stage("test", "grid", [], [output])
    assert provenance.verify_stage("test", "grid")["outputs"][str(output)] == io.sha256(output)
    output.write_bytes(b"tampered output")
    with pytest.raises(ValueError, match="Stale grid outputs"):
        provenance.verify_stage("test", "grid")
    output.write_bytes(b"known output")
    config.write_text("seed: 8", encoding="utf-8")
    with pytest.raises(ValueError, match="Stale grid inputs"):
        provenance.verify_stage("test", "grid")


def test_raw_manifest_hash_is_mandatory(tmp_path, monkeypatch):
    source = tmp_path / "modis_test.csv"
    source.write_bytes(b"original")
    manifest = tmp_path / "MANIFEST.json"
    io.write_json([{"file": source.name, "sha256": io.sha256(source), "via": "synth"}], manifest)
    monkeypatch.setattr(provenance.paths, "manifest", lambda region: manifest)
    monkeypatch.setattr(provenance.paths, "raw_dir", lambda region: tmp_path)
    monkeypatch.setattr(provenance.config, "get_region", lambda region: SimpleNamespace(synthetic=True))
    assert source in provenance.raw_inputs("test")
    source.write_bytes(b"modified")
    with pytest.raises(ValueError, match="Raw provenance mismatch"):
        provenance.raw_inputs("test")


def test_recent_coverage_change_invalidates_derived_statistics(tmp_path, monkeypatch):
    coverage = tmp_path / "nrt_coverage.json"
    io.write_json({"covered": True}, coverage)
    result = tmp_path / "nowcast.json"
    io.write_json({"value": 0}, result)
    monkeypatch.setattr(provenance, "configuration_inputs", lambda region: [])
    monkeypatch.setattr(provenance.paths, "stage_provenance", lambda *args: tmp_path / "stats-stamp.json")
    provenance.record_stage("test", "stats", [coverage], [result])
    assert provenance.verify_stage("test", "stats")
    io.write_json({"covered": False}, coverage)
    with pytest.raises(ValueError, match="Stale stats inputs"):
        provenance.verify_stage("test", "stats")


def test_recent_manifest_updates_do_not_invalidate_unchanged_history(tmp_path, monkeypatch):
    original = tmp_path / "originals" / "source.csv"
    original.parent.mkdir()
    original.write_bytes(b"known original")
    staged = tmp_path / "raw" / "modis_country_2020.csv"
    staged.parent.mkdir()
    staged.write_bytes(b"known staged")
    manifest = staged.parent / "MANIFEST.json"
    country = {"file": staged.name, "source": original.name, "via": "country", "sha256": io.sha256(staged)}
    io.write_json([country], manifest)
    monkeypatch.setattr(provenance, "configuration_inputs", lambda region: [])
    monkeypatch.setattr(provenance.config, "get_region", lambda region: SimpleNamespace(synthetic=False))
    monkeypatch.setattr(provenance.paths, "manifest", lambda region: manifest)
    monkeypatch.setattr(provenance.paths, "raw_dir", lambda region: staged.parent)
    monkeypatch.setattr(provenance.paths, "source_data_root", lambda: original.parent)
    monkeypatch.setattr(provenance.paths, "stage_provenance", lambda *args: tmp_path / "clean-stamp.json")
    provenance.record_stage("test", "clean", provenance.raw_inputs("test"), [staged])
    recent = {"file": "nrt_viirs_noaa20_2026-11-15.csv", "source": "VIIRS_NOAA20_NRT", "via": "local"}
    io.write_json([country, recent], manifest)
    assert provenance.verify_stage("test", "clean")
    io.write_json([{**country, "rows": 42}, recent], manifest)
    with pytest.raises(ValueError, match="Stale clean manifest entries"):
        provenance.verify_stage("test", "clean")
