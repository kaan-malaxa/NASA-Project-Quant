"""Same seed -> byte-identical files; different seed -> different files; size target."""

from __future__ import annotations

import json

from pipeline.synth.__main__ import run
from pipeline.synth.write_firms import FILE_NAMES

DETERMINISTIC = [*FILE_NAMES.values(), "truth.json"]  # MANIFEST.json carries the real write time


def test_same_seed_byte_identical(tiny7, tmp_path):
    run("synthland", 7, "tiny", tmp_path)
    for name in DETERMINISTIC:
        assert (tmp_path / name).read_bytes() == (tiny7 / name).read_bytes(), name


def test_different_seed_differs(tiny7, tmp_path):
    run("synthland", 8, "tiny", tmp_path)
    for name in DETERMINISTIC:
        assert (tmp_path / name).read_bytes() != (tiny7 / name).read_bytes(), name


def test_tiny_size_target_and_manifest(tiny7):
    truth = json.loads((tiny7 / "truth.json").read_text(encoding="utf-8"))
    assert sum(truth["counts"].values()) < 400_000
    manifest = json.loads((tiny7 / "MANIFEST.json").read_text(encoding="utf-8"))
    assert {m["file"] for m in manifest} == set(FILE_NAMES.values())
    for m in manifest:
        assert set(m) == {"file", "source", "via", "downloaded_at", "rows", "sha256", "first_date", "last_date"}
