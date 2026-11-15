"""Tests for `python -m pipeline.export.audit` (R1 prompt E1)."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import pytest

from pipeline.export import audit as audit_mod
from pipeline.export.audit import (
    AUDIT_FILE,
    build_audit,
    dir_loader,
    resolve_pointer,
    write_audit,
)
from pipeline.export.sample import write_sample

LINE = re.compile(r"^- (?P<label>[^:]+): (?P<value>.+)  (?P<file>[^#\s]+)#(?P<ptr>\S*)$")


@pytest.fixture(scope="module")
def site(tmp_path_factory) -> Path:
    d = tmp_path_factory.mktemp("site")
    write_sample(d)
    return d


def number_lines(text: str) -> list[re.Match]:
    return [m for line in text.splitlines() if line.startswith("- ") and (m := LINE.match(line))]


def test_every_line_has_the_contract_shape(site):
    text = (site / AUDIT_FILE).read_text(encoding="utf-8")
    bullets = [line for line in text.splitlines() if line.startswith("- ")]
    assert bullets and len(number_lines(text)) == len(bullets)


def test_every_value_is_exactly_what_its_pointer_holds(site):
    load = dir_loader(site)
    checked = 0
    for m in number_lines((site / AUDIT_FILE).read_text(encoding="utf-8")):
        if m["label"].startswith("MISSING") or "count of pass" in m["label"]:
            continue
        doc = load(m["file"])
        assert json.dumps(resolve_pointer(doc, m["ptr"]), ensure_ascii=False) == m["value"], m.group(0)
        checked += 1
    assert checked > 60


def test_required_headline_numbers_are_listed(site):
    text = (site / AUDIT_FILE).read_text(encoding="utf-8")
    for needle in ("conus/ruler.json#/jump_multiple/value", "conus/trend.json#/harmonized/pct_per_decade",
                   "conus/trend.json#/naive/lo", "conus/trend.json#/sentence", "conus/season.json#/windows/0/label",
                   "conus/nowcast.json#/percentile", "conus/nowcast.json#/status", "conus/nowcast.json#/as_of",
                   "LOYO weekly WAPE baseline raw_viirs",
                   "eyesight status", "eyesight param a", "planted truth passed"):
        assert needle in text, needle


def test_planted_truth_count_matches_methods(site):
    methods = json.loads((site / "methods.json").read_text(encoding="utf-8"))
    passed = sum(r["pass"] for r in methods["planted_truth"])
    line = next(line for line in (site / AUDIT_FILE).read_text(encoding="utf-8").splitlines()
                if "planted truth passed" in line)
    assert f": {passed} of {len(methods['planted_truth'])}  methods.json#/planted_truth" in line


def test_sample_is_flagged_and_real_is_not(site):
    assert "**SAMPLE DATA" in (site / AUDIT_FILE).read_text(encoding="utf-8")
    real = {"regions.json": {"code_version": "abc1234", "regions": []},
            "methods.json": {"code_version": "abc1234", "planted_truth": []}}
    text = build_audit(real.get)
    assert "SAMPLE" not in text and "code_version abc1234" in text


def test_missing_files_and_entries_are_listed_not_dropped():
    docs = {"regions.json": {"code_version": "x", "regions": [{"id": "testland", "name": "Testland"}]},
            "methods.json": {"code_version": "x", "validation": [], "eyesight": [], "planted_truth": []},
            "testland/trend.json": {"code_version": "x", "harmonized": {"pct_per_decade": 1.5}}}
    text = build_audit(docs.get)
    for needle in ("MISSING ruler: file absent  testland/ruler.json#",
                   "MISSING harmonized trend lo: no value  testland/trend.json#/harmonized/lo",
                   "MISSING LOYO weekly WAPE", "MISSING eyesight",
                   "planted truth passed (count of pass = true): 0 of 0"):
        assert needle in text, needle
    assert "- harmonized trend pct_per_decade: 1.5  testland/trend.json#/harmonized/pct_per_decade" in text


def test_rewriting_keeps_the_manifest_hash_valid(site, tmp_path):
    before = (site / AUDIT_FILE).read_bytes()
    assert write_audit(site).encode("utf-8") == before                     # standalone run: same bytes
    manifest = json.loads((site / "manifest.json").read_text(encoding="utf-8"))
    entry = next(f for f in manifest["files"] if f["path"] == AUDIT_FILE)
    assert entry["sha256"] == hashlib.sha256(before).hexdigest() and entry["bytes"] == len(before)


def test_cli_refuses_without_regions_json(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr("pipeline.export.check.default_data_dir", lambda: tmp_path)
    assert audit_mod.main() == 1
    assert "FAIL export.audit" in capsys.readouterr().out


def test_cli_prints_and_writes(site, monkeypatch, capsys):
    monkeypatch.setattr("pipeline.export.check.default_data_dir", lambda: site)
    assert audit_mod.main() == 0
    out = capsys.readouterr().out
    assert out.startswith("# Numbers audit") and out.rstrip().splitlines()[-1].startswith("OK export.audit all rows=")
