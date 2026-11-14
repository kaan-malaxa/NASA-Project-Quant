"""Stage entry point on fabricated inputs: curve.json shape, figure, and the 'absent' path."""

from __future__ import annotations

import json
import logging

import numpy as np
import pandas as pd
import pytest
from fabricate import celldays, coverage
from scipy.special import expit

from pipeline.eyesight.__main__ import main
from pipeline.eyesight.compat import write_parquet

ENTRY_KEYS = {"region", "status", "params", "g", "n_celldays", "curve", "binned", "k_compare"}
PARAM_KEYS = {"a", "b", "c", "a_lo", "a_hi", "b_lo", "b_hi", "c_lo", "c_hi"}


def _fabricated_region(n_per_year: int, seed: int = 3) -> tuple[pd.DataFrame, pd.DataFrame]:
    """S-NPP cell-days on distinct (day, cell) keys; Aqua detects each with 0.88 * expit(-2 + 2.2 log10 FRP)."""
    import h3

    rng = np.random.default_rng(seed)
    base = h3.latlng_to_cell(11.0, 11.0, 6)
    cells = sorted(h3.grid_disk(base, 6))
    rows = []
    for year in range(2013, 2023):
        for i in range(n_per_year):
            day = f"{year}-{1 + i % 12:02d}-{1 + (i // 12) % 28:02d}"
            cell = cells[(i // 336) % len(cells)]
            frp = float(8.0 * np.exp(1.2 * rng.standard_normal()))
            rows.append(("snpp", day, cell, frp))
            if rng.random() < 0.88 * expit(-2.0 + 2.2 * np.log10(frp)):
                rows.append(("aqua", day, cell, frp))
    return celldays(rows), coverage("2013-01-01", "2022-12-31")


def _run(tmp_path, n_per_year, caplog=None):
    cd, cov = _fabricated_region(n_per_year)
    write_parquet(cd, tmp_path / "grid" / "fab" / "celldays.parquet", "celldays")
    write_parquet(cov, tmp_path / "grid" / "fab" / "coverage.parquet", "coverage")
    code = main(["--region", "fab", "--data-root", str(tmp_path)])
    return code, json.loads((tmp_path / "eyesight" / "fab" / "curve.json").read_text(encoding="utf-8"))


def test_curve_json_shape_and_figure(tmp_path):
    code, entry = _run(tmp_path, 400)
    assert code == 0
    assert set(entry) == ENTRY_KEYS and set(entry["params"]) == PARAM_KEYS
    assert entry["status"] == "exploratory" and entry["region"] == "fab" and entry["k_compare"] == []
    assert entry["n_celldays"] == 4000 and entry["g"] == pytest.approx(1.0)
    p = entry["params"]
    for k in "abc":
        assert p[f"{k}_lo"] <= p[k] <= p[f"{k}_hi"]
    assert len(entry["curve"]) == 25 and set(entry["curve"][0]) == {"frp_mw", "p", "lo", "hi"}
    assert entry["binned"] and set(entry["binned"][0]) == {"frp_mw", "p_obs", "n"}
    assert (tmp_path / "eyesight" / "fab" / "figures" / "eyesight_curve.png").stat().st_size > 10_000


def test_too_few_rows_is_absent_and_exits_zero(tmp_path, caplog):
    with caplog.at_level(logging.WARNING, logger="pipeline.eyesight"):
        code, entry = _run(tmp_path, 150)  # 1 500 matched rows < 2 000
    assert code == 0
    assert entry["status"] == "absent" and entry["curve"] == [] and entry["params"]["a"] is None
    assert "reason" not in json.dumps(entry)
    assert not (tmp_path / "eyesight" / "fab" / "figures" / "eyesight_curve.png").exists()


def test_missing_inputs_fail_with_nonzero_exit(tmp_path):
    assert main(["--region", "nowhere", "--data-root", str(tmp_path)]) != 0
