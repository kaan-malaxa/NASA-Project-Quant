"""Tests for `python -m pipeline.export --sample` (R1 prompt A2)."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from statistics import median

import h3
import pytest

from pipeline.export.check import CSV_HEADERS, run_check
from pipeline.export.sample import SAMPLE_REGIONS, build_sample, write_sample

REPO_ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture(scope="module")
def files() -> dict[str, bytes]:
    return build_sample()


@pytest.fixture(scope="module")
def docs(files) -> dict[str, object]:
    return {p: json.loads(b) for p, b in files.items() if p.endswith((".json", ".geojson"))}


def _hashes(folder: Path) -> dict[str, str]:
    return {p.relative_to(folder).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(folder.rglob("*")) if p.is_file()}


def test_two_runs_give_identical_bytes(tmp_path):
    """One run in this process, one in a fresh interpreter with a different hash seed."""
    a, b = tmp_path / "a", tmp_path / "b"
    write_sample(a)
    code = f"from pathlib import Path; from pipeline.export.sample import write_sample; write_sample(Path({str(b)!r}))"
    env = {**os.environ, "PYTHONHASHSEED": "123", "PYTHONPATH": str(REPO_ROOT)}
    subprocess.run([sys.executable, "-c", code], check=True, cwd=REPO_ROOT, env=env)
    ha, hb = _hashes(a), _hashes(b)
    assert len(ha) == 45
    assert ha == hb


def test_sample_site_passes_check(tmp_path):
    write_sample(tmp_path)
    bad = [r.line() for r in run_check(tmp_path) if not r.ok]
    assert bad == []


def test_every_file_of_section_6_exists(files):
    per_region = ["weekly.json", "monthly.json", "daily.json", "climatology.json", "season.json", "trend.json",
                  "ruler.json", "nowcast.json", "hex.json", "calibration.json", "downloads.json",
                  "outline.geojson", "cells_monthly.csv", "hotspots_recent.csv"]
    expected = {"regions.json", "methods.json", "manifest.json"} | {
        f"{r}/{f}" for r in SAMPLE_REGIONS for f in per_region}
    assert set(files) == expected


def _all_kinds(node, acc):
    if isinstance(node, dict):
        if "kind" in node:
            acc.append(node["kind"])
        for v in node.values():
            _all_kinds(v, acc)
    elif isinstance(node, list):
        for v in node:
            _all_kinds(v, acc)
    return acc


def test_sample_marks_everywhere(docs):
    for path, doc in docs.items():
        if path.endswith(".json"):
            assert doc["code_version"] == "sample", path
        assert set(_all_kinds(doc, [])) <= {"sample"}, path
    assert docs["manifest.json"]["contains_sample"] is True
    # every region file carries kind, except those whose contract has no kind field:
    # climatology.json (6.5) and downloads.json (6.12). They are still marked by code_version "sample".
    region_files = [p for p in docs if "/" in p and not p.endswith(("/downloads.json", "/climatology.json"))]
    assert all(_all_kinds(docs[p], []) for p in region_files)


def test_manifest_hashes_match(files, docs):
    for entry in docs["manifest.json"]["files"]:
        data = files[entry["path"]]
        assert entry["sha256"] == hashlib.sha256(data).hexdigest()
        assert entry["bytes"] == len(data)
    assert {e["path"] for e in docs["manifest.json"]["files"]} == set(files) - {"manifest.json"}


def _weekly(docs, region, series):
    return {(r["year"], r["week"]): r for r in docs[f"{region}/weekly.json"]["rows"] if r["series"] == series}


def _annual(docs, region):
    return {a["year"]: a["harmonized"] for a in docs[f"{region}/trend.json"]["annual"] if a["harmonized"] is not None}


def test_punjab_two_seasons_second_larger(docs):
    wins = docs["punjab/season.json"]["windows"]
    assert [w["peak_week"] for w in wins] == [44, 18]
    assert wins[0]["share"] > wins[1]["share"]


def test_bc_one_summer_season_and_extreme_2023(docs):
    wins = docs["bc/season.json"]["windows"]
    assert len(wins) == 1 and wins[0]["peak_week"] == 32
    annual = _annual(docs, "bc")
    others = [v for y, v in annual.items() if y != 2023]
    assert annual[2023] > 4 * median(others)


def test_litoral_aug_sep_season_and_elevated_2020_2022(docs):
    win = docs["litoral/season.json"]["windows"][0]
    assert win["start_week"] <= 31 and win["end_week"] >= 39 and 33 <= win["peak_week"] <= 37
    annual = _annual(docs, "litoral")
    crisis = [annual[y] for y in (2020, 2021, 2022)]
    rest = [v for y, v in annual.items() if y not in (2020, 2021, 2022)]
    assert min(crisis) > 1.5 * median(rest)


@pytest.mark.parametrize("region", SAMPLE_REGIONS)
def test_viirs_from_2012_at_about_2_5x_aqua(docs, region):
    viirs, aqua = _weekly(docs, region, "viirs_raw"), _weekly(docs, region, "aqua_raw")
    assert all(r["value"] is None for k, r in viirs.items() if k[0] < 2012)
    keys = [k for k, r in viirs.items() if r["value"] is not None and aqua[k]["value"] is not None]
    assert min(k[0] for k in keys) == 2012
    ratio = sum(viirs[k]["value"] for k in keys) / sum(aqua[k]["value"] for k in keys)
    assert 2.2 < ratio < 2.8


@pytest.mark.parametrize("region", SAMPLE_REGIONS)
def test_missing_weeks_and_estimated_band(docs, region):
    harm = _weekly(docs, region, "harmonized")
    missing = [k for k, r in harm.items() if r["value"] is None]
    assert len(missing) >= 3
    assert all(harm[k]["lo"] is None and harm[k]["hi"] is None for k in missing)
    band = [r for k, r in _weekly(docs, region, "viirs_equiv").items() if k[0] <= 2011 and r["value"]]
    assert band and all(r["lo"] < r["value"] < r["hi"] for r in band)


def test_harmonized_era_switches_in_kind_runs(docs):
    runs = [r for r in docs["punjab/daily.json"]["kind_runs"] if r["series"] == "harmonized"]
    starts = {r["from"]: r["source"] for r in runs}
    assert starts["2023-01-01"] == "snpp" and starts["2026-01-01"] == "noaa20"
    assert runs[-1]["to"] == "2026-11-13"


def test_daily_columns_have_n_days_entries(docs):
    for region in SAMPLE_REGIONS:
        d = docs[f"{region}/daily.json"]
        for s in d["series"].values():
            assert all(len(s[k]) == d["n_days"] for k in ("value", "lo", "hi") if k in s)


def test_nowcast_statuses(docs):
    status = {r: docs[f"{r}/nowcast.json"]["status"] for r in SAMPLE_REGIONS}
    assert status["punjab"] == "above_normal"
    assert status["bc"] == "low_activity"


def test_trend_sentence_ids(docs):
    ids = {r: docs[f"{r}/trend.json"]["sentence_id"] for r in SAMPLE_REGIONS}
    assert ids == {"punjab": "artifact_flat", "bc": "agree", "litoral": "unclear"}
    for r in SAMPLE_REGIONS:
        s = docs[f"{r}/trend.json"]["sentence"]
        assert s and "{" not in s and "number of fires" not in s


def test_methods_contents(docs):
    m = docs["methods.json"]
    validated = [e for e in m["eyesight"] if e["status"] != "absent"]
    assert validated and all(len(e["curve"]) == 10 and len(e["binned"]) == 6 for e in validated)
    assert len(m["planted_truth"]) == 6
    assert len(m["validation"]) >= 8
    assert len(m["sources"]) == 3 and len(m["limitations"]) == 3
    for region in SAMPLE_REGIONS:
        drift = {d["year"]: d["k_annual"] for d in m["drift"] if d["region"] == region}
        assert sorted(drift) == list(range(2013, 2026))
        fit = [drift[y] for y in range(2013, 2023)]
        spread = max(fit) - min(fit)
        assert abs(drift[2025] - sum(fit) / len(fit)) > 2 * spread   # visible departure after 2022


def test_optional_files(files, docs):
    for region in SAMPLE_REGIONS:
        dl = docs[f"{region}/downloads.json"]["hotspot_archives"]
        assert len(dl) == 2 and all(e["url"] == "#" for e in dl)
        w, s, e, n = next(r["bbox"] for r in docs["regions.json"]["regions"] if r["id"] == region)
        ring = docs[f"{region}/outline.geojson"]["features"][0]["geometry"]["coordinates"][0]
        assert ring == [[w, s], [e, s], [e, n], [w, n], [w, s]]
        for name in ("cells_monthly.csv", "hotspots_recent.csv"):
            lines = files[f"{region}/{name}"].decode("utf-8").splitlines()
            assert lines[0].split(",") == CSV_HEADERS[name] and len(lines) > 1
        assert all(h3.is_valid_cell(c["h3"]) and h3.get_resolution(c["h3"]) == 5
                   for c in docs[f"{region}/hex.json"]["cells"])
