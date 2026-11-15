"""Known-answer science tests and isolated spies for the stage's common IO."""

import argparse
import logging
from copy import deepcopy
from datetime import date
from types import SimpleNamespace
from unittest.mock import Mock

import numpy as np
import pandas as pd
import pytest
from pandas.testing import assert_frame_equal

from pipeline.harmonize import __main__ as stage
from pipeline.harmonize.calibrate import daily_counts
from pipeline.harmonize.series import (
    SENSORS,
    SERIES,
    build_daily_series,
    build_outputs,
    first_noaa20_full_year,
)
from pipeline.harmonize.tests.fabricate import (
    annual_aggregate_spy,
    planted_tables,
    series_tables,
)


@pytest.fixture
def science():
    # Fabricated config is independent of the missing common loader. The
    # separate test_science_yaml test still requires and checks the real loader.
    return {
        "seed": 7,
        "scope": {"region_id": "united_states", "country": "US"},
        "reference": {"sensor": "aqua", "pass": "D"},
        "grid": {"count_res": 6, "map_res": 5},
        "eras": {
            "record_start": "2003-01-01",
            "aqua_trusted_through": "2022-12-31",
            "snpp_through": "2025-12-31",
            "snpp_first_day": "2012-01-20",
        },
        "tier1": {
            "n0": 50,
            "bootstrap_b": 500,
            "interval_percentiles": [5, 95],
            "snpp_fit": ["2013-01-01", "2022-12-31"],
            "n20_min_fit_years": 3,
            "n20_min_detection_days": 300,
            "monthly": True,
        },
        "timebins": {"year_min_covered_frac": 0.9, "week_days": 7},
        "validation": {"step_window_years": 3, "drift_bootstrap_b": 200},
    }


@pytest.fixture(scope="module")
def tables():
    return series_tables()


@pytest.fixture
def result(tables, science):
    return build_outputs(*tables, science, "united_states")


def row(result, day, series="harmonized"):
    frame = result.daily
    selected = frame.loc[frame["local_day"].eq(date.fromisoformat(day)) & frame["series"].eq(series)]
    assert len(selected) == 1
    return selected.iloc[0]


def test_era_boundaries_and_daily_point_bands(result):
    for day, source, kind in (
        ("2022-12-31", "aqua", "observed"),
        ("2023-01-01", "snpp", "harmonized"),
        ("2025-12-31", "snpp", "harmonized"),
        ("2026-01-01", "noaa20", "harmonized"),
    ):
        actual = row(result, day)
        assert (actual.source, actual.kind) == (source, kind)
        assert actual.value == pytest.approx(4)
        assert actual.lo == actual.value == actual.hi


def test_outages_use_only_permitted_calibrated_fallbacks(result):
    for day, source in (
        ("2020-06-01", "snpp"),
        ("2023-01-02", "noaa20"),
        ("2026-01-02", "snpp"),
    ):
        actual = row(result, day)
        assert actual.source == source
        assert actual.kind == "harmonized"
        assert actual.value == pytest.approx(4)
    assert row(result, "2020-06-01", "aqua_raw").kind == "missing"
    # Primary VIIRS raw/translated lenses do not get the harmonized fallback.
    assert row(result, "2023-01-02", "viirs_raw").kind == "missing"
    assert row(result, "2023-01-02", "viirs_as_aqua").kind == "missing"
    assert row(result, "2026-01-02", "noaa20_as_aqua").kind == "missing"
    assert row(result, "2012-01-18").kind == "missing"


def test_uncovered_and_absent_coverage_days_are_null(result):
    for day in ("2026-01-03", "2003-01-02"):
        for series in SERIES:
            actual = row(result, day, series)
            assert actual.kind == "missing"
            assert not actual.covered
            assert all(pd.isna(actual[column]) for column in ("value", "lo", "hi"))


def test_inverse_translation_and_snpp_first_day(result):
    for day in ("2003-01-01", "2012-01-19"):
        actual = row(result, day, "viirs_equiv_t1")
        assert actual.value == pytest.approx(8)
        assert actual.lo == actual.value == actual.hi
        assert (actual.kind, actual.source) == ("estimated", "aqua")
    actual = row(result, "2012-01-20", "viirs_equiv_t1")
    assert (actual.kind, actual.source, actual.value) == ("observed", "snpp", 8)


def test_covered_days_without_detections_remain_zero(tables, science):
    cells, coverage = tables
    zeros = [date(2003, 1, 1), date(2026, 1, 1)]
    cells = cells.loc[~cells["local_day"].isin(zeros)]
    actual = build_outputs(cells, coverage, science, "united_states")
    for day, series in (
        ("2003-01-01", "harmonized"),
        ("2003-01-01", "viirs_equiv_t1"),
        ("2026-01-01", "harmonized"),
    ):
        zero = row(actual, day, series)
        assert zero.covered and zero.kind != "missing"
        assert zero.lo == zero.value == zero.hi == 0


def test_zero_inverse_factor_becomes_missing_instead_of_nan(result, tables, science):
    doc = deepcopy(result.calibration)
    for entry in doc["k"]["snpp"]:
        entry.update(k=0, lo=0, hi=0)
    counts = {sensor: daily_counts(*tables, sensor) for sensor in SENSORS}
    result.daily = build_daily_series(counts, tables[1], science, doc)
    inverse = row(result, "2003-01-01", "viirs_equiv_t1")
    assert inverse.kind == "missing" and not inverse.covered
    assert inverse[["value", "lo", "hi"]].isna().all()


def test_every_series_has_one_row_per_day_and_valid_values(result, tables):
    days = pd.date_range("2003-01-01", max(tables[1]["local_day"]))
    assert set(result.daily["series"]) == set(SERIES)
    assert len(result.daily) == len(days) * len(SERIES)
    assert not result.daily.duplicated(["local_day", "series"]).any()
    for _, group in result.daily.groupby("series"):
        assert group["local_day"].tolist() == list(days.date)
    for column in ("value", "lo", "hi"):
        assert str(result.daily[column].dtype) == "Float64"
        values = result.daily[column].dropna().to_numpy(dtype=float)
        assert np.isfinite(values).all() and (values >= 0).all()
        assert result.daily[column].isna().eq(~result.daily["covered"]).all()
    assert result.daily["kind"].eq("missing").eq(~result.daily["covered"]).all()
    assert set(result.daily["source"]) <= set(SENSORS)


def test_calibration_document_and_both_candidates(result):
    doc = result.calibration
    assert set(doc) == {
        "schema_version",
        "region",
        "reference",
        "count_resolution",
        "shrinkage_n0",
        "eras",
        "fit_window",
        "noaa20_method",
        "k_annual",
        "k",
    }
    assert doc["reference"] == "aqua_day"
    assert doc["eras"][1]["from"] == "2023-01-01"
    assert doc["eras"][2]["from"] == "2026-01-01"
    assert doc["fit_window"]["noaa20"] == ["2019-01-01", "2022-12-31"]
    assert doc["noaa20_method"] == "direct"
    assert result.fits.noaa20_direct is not None
    assert result.fits.noaa20_chained is not None
    for sensor, expected in (("snpp", 0.5), ("noaa20", 0.4)):
        assert doc["k_annual"][sensor] == {
            "k": expected,
            "lo": expected,
            "hi": expected,
        }
        assert [entry["month"] for entry in doc["k"][sensor]] == list(range(1, 13))
        np.testing.assert_allclose([entry["k"] for entry in doc["k"][sensor]], expected)
        for entry in doc["k"][sensor]:
            assert set(entry) == {
                "month",
                "k",
                "lo",
                "hi",
                "aqua_celldays",
                "viirs_celldays",
            }


def test_uncertainty_bands_multiply_forward_and_reverse_on_inverse(result, tables, science):
    doc = deepcopy(result.calibration)
    for entry in doc["k"]["snpp"]:
        entry.update(lo=0.4, hi=0.6)
    counts = {sensor: daily_counts(*tables, sensor) for sensor in SENSORS}
    result.daily = build_daily_series(counts, tables[1], science, doc)
    forward = row(result, "2023-01-01")
    assert (forward.value, forward.lo, forward.hi) == pytest.approx((4, 3.2, 4.8))
    inverse = row(result, "2003-01-01", "viirs_equiv_t1")
    assert (inverse.value, inverse.lo, inverse.hi) == pytest.approx((8, 4 / 0.6, 4 / 0.4))
    observed = row(result, "2003-01-01")
    assert observed.lo == observed.value == observed.hi == 4


def test_no_qualifying_noaa_year_is_absent_with_snpp_fallback(tables, science):
    science["tier1"]["n20_min_detection_days"] = 366
    actual = build_outputs(*tables, science, "united_states")
    assert actual.fits.n20_first_full_year is None
    assert actual.calibration["noaa20_method"] is None
    assert actual.calibration["fit_window"]["noaa20"] is None
    assert actual.calibration["k_annual"]["noaa20"] == {
        "k": None,
        "lo": None,
        "hi": None,
    }
    assert actual.calibration["k"]["noaa20"] == []
    fallback = row(actual, "2026-01-01")
    assert (fallback.source, fallback.kind, fallback.value) == ("snpp", "harmonized", 4)
    assert row(actual, "2026-01-01", "noaa20_as_aqua").kind == "missing"
    assert row(actual, "2026-01-01", "noaa20_raw").value == 10


def test_first_full_year_counts_dates_not_cells_or_passes():
    cells, _ = planted_tables(["2018-01-01", "2018-01-02", "2019-01-01", "2019-01-02", "2019-01-03"])
    cells = pd.concat([cells, cells.assign(daynight="N"), cells], ignore_index=True)
    assert first_noaa20_full_year(cells, 3) == 2019
    assert first_noaa20_full_year(cells, 4) is None


def test_chained_method_keeps_distinct_direct_and_chained_candidates(tables, science):
    cells, coverage = tables
    extra = cells.loc[cells["sensor"].eq("noaa20") & cells["local_day"].eq(date(2023, 1, 1))].copy()
    extra["h3_r6"] += "-extra"
    cells = pd.concat([cells, extra], ignore_index=True)
    science["tier1"]["n20_min_fit_years"] = 5
    actual = build_outputs(cells, coverage, science, "united_states")
    assert actual.calibration["noaa20_method"] == "chained"
    assert actual.calibration["fit_window"]["noaa20"] == ["2019-01-01", "2025-12-31"]
    assert actual.fits.noaa20_direct[1] == pytest.approx(0.4)
    assert actual.fits.noaa20_chained[1] != actual.fits.noaa20_direct[1]
    assert actual.calibration["k_annual"]["noaa20"]["k"] == actual.fits.noaa20_chained[1]


def test_late_first_noaa_year_keeps_direct_unavailability(science):
    actual = build_outputs(*series_tables(n20_first_year=2023), science, "united_states")
    assert actual.fits.noaa20_direct is None
    assert "direct" in actual.fits.unavailable
    assert actual.fits.noaa20_chained is not None
    assert actual.calibration["noaa20_method"] == "chained"


def test_selected_method_is_not_silently_replaced(tables, science):
    cells, coverage = tables
    coverage = coverage.copy()
    no_overlap = coverage["sensor"].eq("aqua") & coverage["local_day"].between(
        date(2019, 1, 1), date(2022, 12, 31)
    )
    coverage.loc[no_overlap, "covered"] = False
    with pytest.raises(ValueError, match="NOAA-20 direct calibration unavailable"):
        build_outputs(cells, coverage, science, "united_states")


def test_post_fit_aqua_drift_does_not_leak_into_either_candidate(tables, result, science):
    cells, coverage = tables
    extra = cells.loc[cells["sensor"].eq("aqua") & cells["local_day"].ge(date(2023, 1, 1))].copy()
    extra["h3_r6"] += "-drift"
    altered = build_outputs(pd.concat([cells, extra]), coverage, science, "united_states")
    assert altered.calibration["k_annual"] == result.calibration["k_annual"]
    assert_frame_equal(altered.fits.snpp[0], result.fits.snpp[0])
    assert_frame_equal(altered.fits.noaa20_direct[0], result.fits.noaa20_direct[0])
    assert_frame_equal(altered.fits.noaa20_chained[0], result.fits.noaa20_chained[0])


def test_annual_fallback_and_inputs_not_modified(tables, science):
    cells, coverage = tables
    extra = cells.loc[cells["sensor"].eq("aqua") & cells["local_day"].eq(date(2013, 1, 1))].copy()
    extra["h3_r6"] += "-seasonal"
    cells = pd.concat([cells, extra])
    cells_before, coverage_before = cells.copy(deep=True), coverage.copy(deep=True)
    science["tier1"]["monthly"] = False
    science_before = deepcopy(science)
    actual = build_outputs(cells, coverage, science, "united_states")
    assert actual.fits.snpp[0]["k"].nunique() > 1
    for sensor in ("snpp", "noaa20"):
        annual = actual.calibration["k_annual"][sensor]["k"]
        assert all(entry["k"] == annual for entry in actual.calibration["k"][sensor])
    assert_frame_equal(cells, cells_before)
    assert_frame_equal(coverage, coverage_before)
    assert science == science_before


def test_night_pass_uses_night_rows(tables, science):
    cells, coverage = tables
    actual = build_outputs(cells.assign(daynight="N"), coverage, science, "united_states", pass_="N")
    assert actual.calibration["reference"] == "aqua_night"
    assert row(actual, "2023-01-01").value == 4


@pytest.fixture
def shared(tmp_path, tables, science):
    """Contract-level IO spies; no common module or data files are fabricated."""
    paths = SimpleNamespace(
        celldays=lambda region: tmp_path / "grid" / region / "celldays.parquet",
        coverage=lambda region: tmp_path / "grid" / region / "coverage.parquet",
        grid_dir=lambda region: tmp_path / "grid" / region,
        harmonized_dir=lambda region: tmp_path / "harmonized" / region,
        web_data_dir=lambda: tmp_path / "web" / "public" / "data",
    )
    parser = argparse.ArgumentParser()
    parser.add_argument("--region", required=True)
    parser.add_argument("--data-root", default="data")
    parser.add_argument("--pass", dest="pass_", default="D")
    parser.add_argument("--log-level", default="INFO")
    hotspots = (
        tables[0]
        .groupby(["sensor", "local_day"], as_index=False)["n_det"]
        .sum()
        .rename(columns={"n_det": "n_det_all"})
    )
    reads = {
        "celldays": tables[0],
        "coverage": tables[1],
        "hotspot_counts_daily": hotspots,
    }
    return SimpleNamespace(
        paths=paths,
        cli=SimpleNamespace(stage_parser=Mock(return_value=parser)),
        config=SimpleNamespace(load_science=Mock(return_value=science), get_region=Mock()),
        io=SimpleNamespace(
            verify_us_inputs=Mock(),
            read_parquet=Mock(side_effect=lambda path, schema_name: reads[schema_name]),
            write_parquet=Mock(),
            write_json=Mock(),
            write_figure=Mock(),
            read_json=Mock(),
        ),
        timebins=SimpleNamespace(
            aggregate=annual_aggregate_spy(science["timebins"]["year_min_covered_frac"])
        ),
        log=SimpleNamespace(
            get_logger=Mock(return_value=logging.getLogger("test_harmonize")),
            finish=Mock(),
        ),
    )


def test_stage_uses_common_io_and_prints_results(shared, monkeypatch, capsys):
    monkeypatch.setattr(stage, "_common", lambda: shared)
    assert stage.main(["--region", "united_states"]) == 0
    shared.cli.stage_parser.assert_called_once_with("harmonize")
    shared.config.load_science.assert_called_once()
    shared.config.get_region.assert_called_once_with("united_states")
    shared.io.verify_us_inputs.assert_called_once_with("united_states")
    assert shared.io.read_parquet.call_count == 3
    assert shared.io.write_parquet.call_count == 3
    daily_call, bootstrap_call, naive_call = shared.io.write_parquet.call_args_list
    frame, path = daily_call.args
    assert path == shared.paths.harmonized_dir("united_states") / "daily.parquet"
    assert daily_call.kwargs == {"schema_name": "daily"}
    assert bootstrap_call.args[1].name == "annual_bootstrap.parquet"
    assert bootstrap_call.kwargs == {"schema_name": "annual_bootstrap"}
    assert naive_call.args[1].name == "naive_annual.parquet"
    assert naive_call.kwargs == {"schema_name": "naive_annual"}
    assert len(bootstrap_call.args[0]) == 500 * 23
    assert bootstrap_call.args[0]["year"].max() == 2025
    assert {call.kwargs["grain"] for call in shared.timebins.aggregate.call_args_list} == {"week", "year"}
    assert shared.io.write_json.call_count == 2
    doc, path = shared.io.write_json.call_args_list[0].args
    assert path == shared.paths.harmonized_dir("united_states") / "calibration.json"
    assert doc["noaa20_method"] == "direct"
    validation, path = shared.io.write_json.call_args_list[1].args
    assert path == shared.paths.harmonized_dir("united_states") / "validation_t1.json"
    assert len(validation["validation"]) == 13
    assert validation["drift"]
    assert validation["drift_summary"]["mean_k_fit_window"] == pytest.approx(0.5)
    assert all(row["region"] == "united_states" for row in validation["validation"])
    assert {call.args[1].name for call in shared.io.write_figure.call_args_list} == {
        "loyo_scatter.png", "overlay_aqua_vs_translated.png", "drift_k_by_year.png",
    }
    assert len(frame) > 0
    output = capsys.readouterr().out
    assert "snpp k_annual=0.5" in output
    assert "noaa20 k_annual=0.4" in output
    assert "noaa20_method=direct" in output
    assert "harmonized missing_days=" in output
    assert shared.log.finish.call_args.args[:3] == (
        "harmonize",
        "united_states",
        len(frame),
    )


def test_stage_reports_one_line_failure_without_writing(shared, monkeypatch, capsys):
    shared.io.read_parquet.side_effect = FileNotFoundError("missing\ninput")
    monkeypatch.setattr(stage, "_common", lambda: shared)
    assert stage.main(["--region", "united_states"]) == 1
    assert capsys.readouterr().err == "ERROR harmonize: missing input\n"
    shared.io.write_parquet.assert_not_called()
    shared.io.write_json.assert_not_called()


def test_stage_writes_bootstrap_bands_into_daily_translations(shared):
    read = shared.io.read_parquet.side_effect
    cells = read(None, schema_name="celldays")
    extra = cells.loc[cells["sensor"].eq("aqua") & cells["local_day"].eq(date(2013, 1, 1))].copy()
    extra["h3_r6"] += "-variable-year"
    altered = pd.concat([cells, extra], ignore_index=True)
    shared.io.read_parquet.side_effect = lambda path, schema_name: (
        altered if schema_name == "celldays" else read(path, schema_name)
    )
    result = stage.run_region("united_states", shared=shared)
    factor = result.calibration["k"]["snpp"][0]
    assert factor["lo"] < factor["hi"]
    translated = row(result, "2023-01-01")
    assert translated.lo == pytest.approx(8 * factor["lo"])
    assert translated.hi == pytest.approx(8 * factor["hi"])
    inverse = row(result, "2003-01-01", "viirs_equiv_t1")
    assert inverse.lo == pytest.approx(4 / factor["hi"])
    assert inverse.hi == pytest.approx(4 / factor["lo"])
    assert result.bootstrap.size == 500
    assert result.annual_bootstrap is not None and result.naive_annual is not None


def test_stage_validates_existing_schema_before_writing(shared, tmp_path):
    schema_path = tmp_path / "contracts" / "calibration.schema.json"
    schema_path.parent.mkdir()
    schema_path.touch()
    shared.io.read_json.return_value = {"type": "object", "required": ["noaa20_method"]}
    stage.run_region("united_states", shared=shared)
    shared.io.read_json.assert_called_once_with(schema_path)
    shared.io.write_parquet.reset_mock()
    shared.io.write_json.reset_mock()
    shared.io.write_figure.reset_mock()
    shared.io.read_json.return_value = {"type": "object", "required": ["nonexistent"]}
    from jsonschema import ValidationError

    with pytest.raises(ValidationError):
        stage.run_region("united_states", shared=shared)
    shared.io.write_parquet.assert_not_called()
    shared.io.write_json.assert_not_called()
    shared.io.write_figure.assert_not_called()


def test_stage_data_root_override_and_restore(shared, monkeypatch):
    import os

    monkeypatch.setenv("FIREROSETTA_DATA_ROOT", "original-root")
    monkeypatch.setattr(stage, "_common", lambda: shared)
    seen = []
    shared.config.get_region.side_effect = lambda region: seen.append(os.environ["FIREROSETTA_DATA_ROOT"])
    assert stage.main(["--region", "united_states", "--data-root", "new-root"]) == 0
    assert seen == ["new-root"]
    assert os.environ["FIREROSETTA_DATA_ROOT"] == "original-root"
