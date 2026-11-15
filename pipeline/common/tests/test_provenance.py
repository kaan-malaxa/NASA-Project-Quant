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
