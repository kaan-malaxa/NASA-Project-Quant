import json

import pytest

from pipeline.export.check import load_json_strict, semantic_errors


def test_duplicate_json_keys_and_inverted_ranges_fail(tmp_path):
    file = tmp_path / "duplicate.json"
    file.write_text('{"value": 1, "value": 2}', encoding="utf-8")
    with pytest.raises(ValueError, match="duplicate JSON key"):
        load_json_strict(file)
    assert semantic_errors({"value": 2, "lo": 3, "hi": 1})


def test_daily_array_alignment_and_missing_kind_are_checked():
    daily = {"start": "2020-01-01", "n_days": 2, "series": {"harmonized": {"value": [1]}},
             "kind_runs": [{"series": "harmonized", "from": "2020-01-01", "to": "2020-01-02", "kind": "observed"}]}
    assert any("length" in error for error in semantic_errors(daily))
    assert semantic_errors({"value": 0, "kind": "missing"})
    assert not semantic_errors(json.loads('{"value":null,"lo":null,"hi":null,"kind":"missing"}'))
