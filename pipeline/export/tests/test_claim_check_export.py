"""pipeline/export/claim_check.py on small fabricated inputs (SD-20)."""

from __future__ import annotations

import pandas as pd
import pytest

from pipeline.common import config
from pipeline.export.check import load_registry, validator_for
from pipeline.export.claim_check import ClaimCheckError, build_doc, list_in_regions, varying_replicates

HEADER = {"schema_version": "1.0", "generated_at": "2026-11-15T00:00:00Z", "code_version": "test"}


def _trend(values: dict[int, float | None]) -> dict:
    years = sorted(values)
    return {"years": [years[0], years[-1]], "annual": [
        {"year": y, "harmonized": v, "lo": v, "hi": v, "kind": "missing" if v is None else "observed",
         "naive_count": None if v is None else 2 * v, "naive_source": "modis" if y < 2012 else "snpp"}
        for y, v in values.items()]}


def _boot(per_replicate: list[dict[int, float | None]]) -> pd.DataFrame:
    return pd.DataFrame([{"replicate": r, "year": y, "harmonized": float("nan") if v is None else v}
                         for r, row in enumerate(per_replicate) for y, v in row.items()])


def test_only_years_that_differ_between_replicates_are_exported():
    trend = _trend({2020: 10.0, 2021: 20.0, 2022: None, 2023: 31.0})
    boot = _boot([{2020: 10.0, 2021: 19.0, 2022: None, 2023: 30.0},
                  {2020: 10.0, 2021: 21.0, 2022: None, 2023: 32.0}])
    reps = varying_replicates(trend, boot)
    assert reps["years"] == [2021, 2023]
    assert reps["n"] == 2
    assert reps["values"] == [[19.0, 30.0], [21.0, 32.0]]


def test_no_varying_year_gives_an_empty_replicate_table():
    trend = _trend({2020: 10.0, 2021: 20.0})
    reps = varying_replicates(trend, _boot([{2020: 10.0, 2021: 20.0}] * 3))
    assert reps == {"source": reps["source"], "n": 0, "years": [], "values": []}


def test_constant_year_that_disagrees_with_trend_is_refused():
    trend = _trend({2020: 10.0, 2021: 20.0})
    with pytest.raises(ClaimCheckError, match="2021"):
        varying_replicates(trend, _boot([{2020: 10.0, 2021: 25.0}] * 2))


def test_missing_trend_year_with_replicate_values_is_refused():
    trend = _trend({2020: 10.0, 2021: None})
    with pytest.raises(ClaimCheckError, match="2021"):
        varying_replicates(trend, _boot([{2020: 10.0, 2021: 5.0}] * 2))


def test_document_matches_its_contract_and_copies_config_from_science():
    science = config.load_science()
    y0, y1 = science["trend"]["years"]
    values = {y: 100.0 + y - y0 for y in range(y0, y1 + 1)}
    doc = build_doc(_trend(values), _boot([values, values]), science, HEADER, "testland")
    errors = [e.message for e in validator_for("claim_check", load_registry()).iter_errors(doc)]
    assert errors == []
    assert doc["config"]["window_years"] == science["claim_check"]["window_years"]
    assert doc["config"]["sensor_change_year"] == 2012
    assert doc["config"]["record_years"] == [y0, y1]


def test_document_refuses_a_trend_with_other_years():
    science = config.load_science()
    with pytest.raises(ClaimCheckError, match="trend.years"):
        build_doc(_trend({2010: 1.0, 2011: 2.0}), _boot([{2010: 1.0, 2011: 2.0}]), science, HEADER, "x")


def test_regions_list_claim_check_in_assemble_order():
    doc = {"regions": [{"id": "a", "optional_files": ["hotspots_recent", "cells_monthly"]},
                       {"id": "b", "optional_files": ["downloads"]}]}
    list_in_regions(doc, ["a"], ["cells_monthly", "downloads", "hotspots_recent", "claim_check"])
    assert doc["regions"][0]["optional_files"] == ["cells_monthly", "hotspots_recent", "claim_check"]
    assert doc["regions"][1]["optional_files"] == ["downloads"]
