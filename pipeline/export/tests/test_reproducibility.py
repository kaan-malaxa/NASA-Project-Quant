import json

from pipeline.export.reproducibility import snapshot


def test_payload_digest_ignores_build_clocks_but_changes_with_science(tmp_path):
    file = tmp_path / "trend.json"
    file.write_text(json.dumps({"generated_at": "first", "value": 3.5}), encoding="utf-8")
    first = snapshot(tmp_path)
    file.write_text(json.dumps({"generated_at": "second", "value": 3.5}), encoding="utf-8")
    assert snapshot(tmp_path) == first
    file.write_text(json.dumps({"generated_at": "second", "value": 4.5}), encoding="utf-8")
    assert snapshot(tmp_path) != first
