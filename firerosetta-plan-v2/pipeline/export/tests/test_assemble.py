"""Tests for `python -m pipeline.export` (assemble, R1 prompt C2) on temp trees."""

from __future__ import annotations

import hashlib
import json
import shutil
from datetime import date
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from pipeline.export._contract_defaults import REGIONS_4_1, SCIENCE_4_2
from pipeline.export.assemble import (
    AssembleError,
    Inputs,
    assemble,
    planted_truth,
    resolve,
)
from pipeline.export.check import run_check
from pipeline.export.sample import json_bytes, write_sample

HEADER = {"schema_version": "1.0", "generated_at": "2026-11-15T12:00:00Z", "code_version": "abc1234"}


def realify(node):
    """Turn sample JSON into what a real run would write: real code_version, real kinds."""
    if isinstance(node, dict):
        out = {k: realify(v) for k, v in node.items()}
        if out.get("kind") == "sample":
            out["kind"] = "observed"
        if out.get("code_version") == "sample":
            out["code_version"] = "abc1234"
        return out
    if isinstance(node, list):
        return [realify(v) for v in node]
    return node


def write_json(obj, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(json_bytes(obj))


def write_cells(path: Path, membership: bytes | None = b"polygon") -> None:
    df = pd.DataFrame({"h3_r6": ["86a", "86b", "86c"], "h3_r5": ["85a", "85a", "85b"], "lat": [30.0] * 3,
                       "lon": [75.0] * 3})
    table = pa.Table.from_pandas(df, preserve_index=False)
    if membership:
        table = table.replace_schema_metadata({**(table.schema.metadata or {}), b"membership": membership})
    path.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, path)


@pytest.fixture
def tree(tmp_path: Path) -> Inputs:
    """--sample site with conus turned real (and a sample-only synthland/), plus the R2/R3 inputs conus needs."""
    web, data = tmp_path / "web", tmp_path / "data"
    write_sample(web)
    shutil.copytree(web / "conus", web / "synthland")          # a leftover sample-only folder
    for f in (web / "conus").iterdir():
        if f.suffix in (".json", ".geojson"):
            write_json(realify(json.loads(f.read_text(encoding="utf-8"))), f)
    harm = data / "harmonized" / "conus"
    write_json(realify(json.loads((web / "conus" / "calibration.json").read_text(encoding="utf-8"))),
               harm / "calibration.json")
    (web / "conus" / "calibration.json").unlink()            # assemble must copy it back
    pd.DataFrame({"local_day": [date(2003, 1, 1), date(2026, 11, 13)], "series": "harmonized",
                  "value": [1.0, 2.0]}).to_parquet(harm / "daily.parquet")
    write_json({"validation": [
        {"region": "conus", "test": "loyo_weekly_wape", "method": "tier1", "value": 0.21,
         "baselines": {"raw_viirs": 1.4, "annual_ratio": 0.25}, "n": 520, "years": [2013, 2022], "note": ""},
        {"region": "conus", "test": "handoff_annual_mape", "method": "tier1", "value": 0.05, "n": 10,
         "years": [2013, 2022], "note": "Totals match partly by construction."}],
        "drift": [{"year": 2013, "sensor": "snpp", "k_annual": 0.41, "lo": 0.39, "hi": 0.43}],
        "drift_summary": {}}, harm / "validation_t1.json")
    write_cells(data / "grid" / "conus" / "region_cells.parquet")
    write_json([{"file": "modis_conus.csv", "source": "MODIS_SP", "via": "archive",
                 "downloaded_at": "2026-11-14T10:00:00Z", "rows": 1234, "sha256": "0" * 64,
                 "first_date": "2003-01-01", "last_date": "2025-12-31"}], data / "raw" / "conus" / "MANIFEST.json")
    write_json([{"sensor": "aqua", "step": "confidence", "rows_in": 1000, "rows_dropped": 50}],
               data / "clean" / "conus" / "filter_log.json")
    regions = [{**r, "centroid": [(r["bbox"][0] + r["bbox"][2]) / 2, (r["bbox"][1] + r["bbox"][3]) / 2]}
               for r in REGIONS_4_1]
    return Inputs(web_dir=web, regions=regions, science=SCIENCE_4_2, science_sha256="1" * 64,
                  harmonized_dir=lambda r: data / "harmonized" / r, eyesight_dir=lambda r: data / "eyesight" / r,
                  grid_dir=lambda r: data / "grid" / r, raw_dir=lambda r: data / "raw" / r,
                  clean_dir=lambda r: data / "clean" / r, read_parquet=lambda p, name: pd.read_parquet(p),
                  write_json=write_json, header=HEADER)


def load(inp: Inputs, name: str):
    return json.loads((inp.web_dir / name).read_text(encoding="utf-8"))


# ------------------------------------------------------------------ the happy path
def test_assemble_real_region_next_to_sample_ones(tree):
    warnings = assemble(tree)
    assert sorted(w.split("/")[3] for w in warnings) == ["synthland"]      # sample-only, left out
    regions = load(tree, "regions.json")
    assert regions["code_version"] == "abc1234"
    (r,) = regions["regions"]
    assert (r["id"], r["n_cells_r6"], r["membership"], r["last_data_day"]) == ("conus", 3, "polygon", "2026-11-13")
    assert r["files"] == ["weekly", "monthly", "daily", "climatology", "season", "trend", "ruler", "nowcast",
                          "hex", "calibration", "outline"]
    assert r["optional_files"] == ["cells_monthly", "downloads", "hotspots_recent"]
    assert r["synthetic"] is False
    src = tree.harmonized_dir("conus") / "calibration.json"
    assert (tree.web_dir / "conus" / "calibration.json").read_bytes() == src.read_bytes()
    assert [x.line() for x in run_check(tree.web_dir) if not x.ok] == []


def test_methods_contents(tree):
    assemble(tree)
    m = load(tree, "methods.json")
    assert m["decisions"]["reference"] == "MODIS Aqua, daytime"
    assert m["decisions"]["science_yaml_sha256"] == "1" * 64
    assert m["decisions"]["baseline_years"] == [2003, 2025]
    assert [v["test"] for v in m["validation"]] == ["loyo_weekly_wape", "handoff_annual_mape"]   # unchanged
    assert m["drift"] == [{"region": "conus", "year": 2013, "sensor": "snpp", "k_annual": 0.41, "lo": 0.39,
                           "hi": 0.43}]
    assert m["eyesight"] == [{"region": "conus", "status": "absent"}]
    assert m["inputs"][0]["downloaded"] == "2026-11-14T10:00:00Z" and m["inputs"][0]["region"] == "conus"
    assert m["filters"] == [{"region": "conus", "sensor": "aqua", "step": "confidence", "rows_in": 1000,
                             "rows_dropped": 50}]
    assert m["planted_truth"] == [] and m["sources"] == []
    assert len(m["limitations"]) == 3 and m["ai_use"]


def test_manifest_covers_every_file_and_flags_leftover_sample(tree):
    assemble(tree)
    man = load(tree, "manifest.json")
    on_disk = {p.relative_to(tree.web_dir).as_posix() for p in tree.web_dir.rglob("*") if p.is_file()}
    assert {f["path"] for f in man["files"]} == on_disk - {"manifest.json"}
    assert man["contains_sample"] is True                     # synthland/ is still sample
    kinds = {f["path"]: f["kinds"] for f in man["files"]}
    assert kinds["conus/weekly.json"] == ["observed"] and kinds["synthland/weekly.json"] == ["sample"]
    assert kinds["conus/cells_monthly.csv"] == []
    audit = tree.web_dir / "numbers_audit.md"                 # written before the manifest
    entry = next(f for f in man["files"] if f["path"] == "numbers_audit.md")
    assert entry["sha256"] == hashlib.sha256(audit.read_bytes()).hexdigest()
    assert "conus/trend.json#/harmonized/pct_per_decade" in audit.read_text(encoding="utf-8")


def test_manifest_has_no_sample_once_sample_folders_are_gone(tree):
    for r in ("synthland",):
        shutil.rmtree(tree.web_dir / r)
    assert assemble(tree) == []
    assert load(tree, "manifest.json")["contains_sample"] is False


def test_eyesight_and_t2_validation_are_included_when_present(tree):
    eye = tree.eyesight_dir("conus")
    curve = {"status": "exploratory", "params": {k: 0.1 for k in ("a", "b", "c", "a_lo", "a_hi", "b_lo", "b_hi",
                                                                   "c_lo", "c_hi")},
             "g": 1.1, "n_celldays": 10, "curve": [], "binned": [], "k_compare": []}
    write_json(curve, eye / "curve.json")
    write_json({"validation": [{"region": "conus", "test": "t1_t2_wape", "method": "tier2", "value": 0.1,
                                "n": 10, "years": [2013, 2022], "note": ""}]}, eye / "validation_t2.json")
    assemble(tree)
    m = load(tree, "methods.json")
    assert m["eyesight"][0]["status"] == "exploratory" and m["eyesight"][0]["region"] == "conus"
    assert m["validation"][-1]["test"] == "t1_t2_wape"


def test_validated_curve_goes_into_methods_unchanged_with_k_compare(tree):
    curve = {"region": "conus", "status": "validated",
             "params": {k: 0.25 for k in ("a", "b", "c", "a_lo", "a_hi", "b_lo", "b_hi", "c_lo", "c_hi")},
             "g": 1.142, "n_celldays": 48210,
             "curve": [{"frp_mw": 1.0, "p": 0.1, "lo": 0.09, "hi": 0.11}],
             "binned": [{"frp_mw": 1.0, "p_obs": 0.1, "n": 500}],
             "k_compare": [{"month": m, "k_tier1": 0.47, "k_tier2": 0.46 + m / 1000} for m in range(1, 13)]}
    write_json(curve, tree.eyesight_dir("conus") / "curve.json")
    assemble(tree)
    stored = json.loads((tree.eyesight_dir("conus") / "curve.json").read_text(encoding="utf-8"))
    assert load(tree, "methods.json")["eyesight"] == [stored]


def test_sources_without_url_are_dropped(tree, tmp_path):
    text = tmp_path / "methods_text.yaml"
    text.write_text("sources:\n"
                    "  - {claim_id: snpp_end, text: 'S-NPP stopped.', url: 'https://example.org/notice', checked: '2026-11-15'}\n"
                    "  - {claim_id: aqua_drift, text: 'Aqua drifts.', url: '', checked: '2026-11-15'}\n"
                    "limitations: ['One.']\nai_use: 'Text.'\n", encoding="utf-8")
    tree.methods_text = text
    assemble(tree)
    assert [s["claim_id"] for s in load(tree, "methods.json")["sources"]] == ["snpp_end"]


# ------------------------------------------------------------------ refusals
def test_mixed_sample_and_real_is_rejected_and_nothing_is_written(tree):
    (tree.web_dir / "conus" / "hex.json").write_bytes((tree.web_dir / "synthland" / "hex.json").read_bytes())
    before = (tree.web_dir / "regions.json").read_bytes()
    with pytest.raises(AssembleError, match=r"conus: sample \['hex.json'\]"):
        assemble(tree)
    assert (tree.web_dir / "regions.json").read_bytes() == before
    assert not (tree.web_dir / "conus" / "calibration.json").exists()


def test_invalid_calibration_is_rejected(tree):
    path = tree.harmonized_dir("conus") / "calibration.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["k_annual"]["snpp"]["k"] = "half"
    write_json(doc, path)
    with pytest.raises(AssembleError, match="calibration.schema.json"):
        assemble(tree)


def test_missing_membership_metadata_is_rejected(tree):
    write_cells(tree.grid_dir("conus") / "region_cells.parquet", membership=None)
    with pytest.raises(AssembleError, match="membership"):
        assemble(tree)


def test_only_sample_folders_is_an_error(tmp_path):
    write_sample(tmp_path / "web")
    inp = Inputs(web_dir=tmp_path / "web", regions=[{**r, "centroid": [0, 0]} for r in REGIONS_4_1],
                 science=SCIENCE_4_2, science_sha256="1" * 64, harmonized_dir=lambda r: tmp_path / "h" / r,
                 eyesight_dir=lambda r: tmp_path / "e" / r, grid_dir=lambda r: tmp_path / "g" / r,
                 raw_dir=lambda r: tmp_path / "r" / r, clean_dir=lambda r: tmp_path / "c" / r,
                 read_parquet=lambda p, n: pd.read_parquet(p), write_json=write_json, header=HEADER)
    with pytest.raises(AssembleError, match="no region folder holds real pipeline output"):
        assemble(inp)


# ------------------------------------------------------------------ planted truth
def test_resolve_paths():
    doc = {"k_annual": {"snpp": {"k": 0.47}}, "windows": [{"peak_week": 44}, {"peak_week": 18}]}
    assert resolve(doc, "k_annual.snpp.k") == 0.47
    assert resolve(doc, "windows[1].peak_week") == 18
    with pytest.raises(IndexError):
        resolve({"windows": [{}]}, "windows[1].peak_week")


def test_planted_truth_rows_pass_fail_and_unevaluable(tree):
    import h3
    d = tree
    cal = {"k_annual": {"snpp": {"k": 0.48}}, "k": {"snpp": [{"month": m, "k": 0.47 + (0.1 if m == 7 else 0)}
                                                             for m in range(1, 13)]}}
    write_json(cal, d.harmonized_dir("synthland") / "calibration.json")
    write_json({"harmonized": {"pct_per_decade": 30.0}, "windows": [{"peak_week": 44}]},
               d.web_dir / "synthland" / "trend.json")
    write_json({"windows": [{"peak_week": 45}]}, d.web_dir / "synthland" / "season.json")
    outage = ["2010-03-01", "2010-03-02", "2010-03-03"]
    d.grid_dir("synthland").mkdir(parents=True)
    pd.DataFrame({"sensor": "aqua", "local_day": [date(2010, 3, 1), date(2010, 3, 2), date(2010, 3, 3)],
                  "covered": [False, False, True], "reason": "outage_list"}).to_parquet(
        d.grid_dir("synthland") / "coverage.parquet")
    static = h3.latlng_to_cell(10.5, 10.5, 6)
    pd.DataFrame({"h3_r6": [static, "86other"]}).to_parquet(d.grid_dir("synthland") / "celldays.parquet")
    truth = {"planted": {"outage_days": {"aqua": outage}, "static_points": [{"lat": 10.5, "lon": 10.5}]},
             "expected": [
                 {"quantity": "k_annual_snpp", "truth": 0.471, "tolerance": 0.03, "source_file": "calibration.json",
                  "path": "k_annual.snpp.k"},
                 {"quantity": "k_month_snpp_max_abs_err", "truth": 0.0, "tolerance": 0.08,
                  "source_file": "calibration.json", "path": "k.snpp[*].k",
                  "truth_by_month": [{"month": m, "k": 0.47} for m in range(1, 13)]},
                 {"quantity": "trend_pct_per_decade", "truth": 10.0, "tolerance": 5.0, "source_file": "trend.json",
                  "path": "harmonized.pct_per_decade"},
                 {"quantity": "peak_week_main", "truth": 44, "tolerance": 1, "source_file": "season.json",
                  "path": "windows[0].peak_week"},
                 {"quantity": "peak_week_second", "truth": 18, "tolerance": 1, "source_file": "season.json",
                  "path": "windows[1].peak_week"},
                 {"quantity": "reliability_err", "truth": 0.0, "tolerance": 0.05, "source_file": "validation_t2.json",
                  "path": "reliability_err"},
                 {"quantity": "aqua_outage_days_missing", "truth": 3, "tolerance": 0, "source_file": "coverage.parquet",
                  "path": "aqua covered=false in outage"},
                 {"quantity": "static_rows_surviving", "truth": 0, "tolerance": 0, "source_file": "celldays.parquet",
                  "path": "cells of the 5 static points"}]}
    write_json(truth, d.raw_dir("synthland") / "truth.json")
    rows = {r["quantity"]: r for r in planted_truth(d)}
    assert rows["k_annual_snpp"]["recovered"] == pytest.approx(0.48) and rows["k_annual_snpp"]["pass"]
    assert rows["k_month_snpp_max_abs_err"]["recovered"] == pytest.approx(0.1)
    assert rows["k_month_snpp_max_abs_err"]["pass"] is False
    assert rows["trend_pct_per_decade"]["pass"] is False                       # 30 vs 10 +- 5
    assert rows["peak_week_main"]["recovered"] == 45 and rows["peak_week_main"]["pass"]
    for q in ("peak_week_second", "reliability_err"):                         # window / file absent
        assert rows[q]["recovered"] is None and rows[q]["pass"] is False
    assert rows["aqua_outage_days_missing"]["recovered"] == 2 and rows["aqua_outage_days_missing"]["pass"] is False
    assert rows["static_rows_surviving"]["recovered"] == 1 and rows["static_rows_surviving"]["pass"] is False
