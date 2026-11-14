"""build_matched on fabricated cell-days with known answers."""

from __future__ import annotations

import math

import pytest
from fabricate import cell, celldays, coverage, neighbour_of

from pipeline.eyesight.match import MATCHED_COLUMNS, build_matched, g_factor

DAY = "2015-06-01"
C1, C2, C3, C4 = cell(10.5, 10.5), cell(10.5, 11.5), cell(11.5, 10.5), cell(11.5, 11.5)
C_AQUA_ONLY = cell(11.0, 11.0)
FIT = ("2015-01-01", "2015-12-31")


def _run(rows, cov=None, **kw):
    cov = cov if cov is not None else coverage("2015-05-30", "2015-06-03")
    return build_matched(celldays(rows), cov, *FIT, frp_floor_mw=0.1, **kw)


def _base_rows():
    return [("snpp", DAY, C1, 10.0), ("snpp", DAY, C2, 20.0), ("snpp", DAY, C3, 30.0), ("snpp", DAY, C4, 40.0),
            ("aqua", DAY, C1, 5.0), ("aqua", DAY, C2, 7.0)]


def test_y_in_the_right_rows():
    m, counts = _run(_base_rows())
    assert list(m.columns) == MATCHED_COLUMNS
    y = dict(zip(m["h3_r6"], m["y"]))
    assert [y[C1], y[C2], y[C3], y[C4]] == [1, 1, 0, 0]
    x = dict(zip(m["h3_r6"], m["x"]))
    assert x[C3] == pytest.approx(math.log10(30.0))
    assert set(m["year"]) == {2015} and set(m["month"]) == {6}
    assert counts == {"aqua_celldays_total": 2, "aqua_celldays_matched": 2, "n_matched_rows": 4}


def test_aqua_only_cellday_raises_total_not_matched():
    _, counts = _run(_base_rows() + [("aqua", DAY, C_AQUA_ONLY, 3.0)])
    assert counts["aqua_celldays_total"] == 3 and counts["aqua_celldays_matched"] == 2
    assert g_factor(counts) == pytest.approx(1.5) and g_factor(counts) > 1


def test_uncovered_aqua_days_excluded_entirely():
    rows = _base_rows() + [("snpp", "2015-06-02", C1, 10.0), ("aqua", "2015-06-02", C1, 10.0),
                           ("aqua", "2015-06-02", C_AQUA_ONLY, 10.0)]
    cov = coverage("2015-05-30", "2015-06-03", uncovered={"aqua": ["2015-06-02"]})
    m, counts = _run(rows, cov)
    assert len(m) == 4 and str(m["local_day"].max()) == DAY  # S-NPP row on the uncovered day is gone
    assert counts["aqua_celldays_total"] == 2  # Aqua rows on that day are gone too


def test_rows_outside_window_or_other_pass_excluded():
    rows = _base_rows() + [("snpp", "2016-01-01", C1, 10.0), ("snpp", DAY, C_AQUA_ONLY, 10.0, "N"),
                           ("aqua", DAY, C3, 10.0, "N")]
    m, counts = _run(rows, coverage("2015-05-30", "2016-01-02"))
    y = dict(zip(m["h3_r6"], m["y"]))
    assert len(m) == 4 and y[C3] == 0  # a night Aqua row does not count as a daytime match
    assert counts["aqua_celldays_total"] == 2


def test_neighbour_mode_flips_adjacent():
    rows = _base_rows() + [("aqua", DAY, neighbour_of(C3), 9.0)]
    m_same, c_same = _run(rows)
    m_nb, c_nb = _run(rows, neighbour=True)
    y_same, y_nb = dict(zip(m_same["h3_r6"], m_same["y"])), dict(zip(m_nb["h3_r6"], m_nb["y"]))
    assert y_same[C3] == 0 and y_nb[C3] == 1
    assert y_nb[C4] == 0  # far away: unchanged
    assert c_same == c_nb  # g counts stay same-cell


def test_zero_or_null_frp_is_floored_not_dropped():
    rows = [("snpp", DAY, C1, 0.0), ("snpp", DAY, C2, None), ("snpp", DAY, C3, 0.05), ("aqua", DAY, C2, 1.0)]
    m, _ = _run(rows)
    x = dict(zip(m["h3_r6"], m["x"]))
    assert len(m) == 3
    assert x[C1] == pytest.approx(-1.0) and x[C2] == pytest.approx(-1.0) and x[C3] == pytest.approx(-1.0)
    assert dict(zip(m["h3_r6"], m["y"]))[C2] == 1


def test_floor_defaults_to_science_value():
    m, _ = build_matched(celldays([("snpp", DAY, C1, 0.0)]), coverage(DAY, DAY), *FIT)
    assert m["x"].iloc[0] == pytest.approx(-1.0)  # tier2.frp_floor_mw = 0.1
