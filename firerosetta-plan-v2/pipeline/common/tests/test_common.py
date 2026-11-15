"""Known-answer shared rules and strict US source selection."""

from datetime import date, datetime
from types import SimpleNamespace
from unittest.mock import Mock

import pandas as pd
import pytest

from pipeline import run
from pipeline.common import cli, config, io, log, paths, sensors, timebins


def test_only_us_region_and_cli_selection():
    assert config.get_region("united_states").country == "US"
    for region in ("punjab", "synthland", "bc", "litoral", "../united_states"):
        with pytest.raises(ValueError, match="US-only"):
            config.get_region(region)
    assert cli.stage_parser("harmonize").parse_args([]).region == "united_states"
    with pytest.raises(SystemExit):
        cli.stage_parser("harmonize").parse_args(["--region", "punjab"])
    with pytest.raises(ValueError, match="no country polygon"):
        config.region_centroid(config.get_region("united_states"))


def test_source_root_cannot_be_redirected_by_output_root(tmp_path, monkeypatch):
    source = paths.source_root()
    monkeypatch.setenv("FIREROSETTA_DATA_ROOT", str(tmp_path))
    assert paths.data_root() == tmp_path
    assert paths.source_root() == source
    assert paths.grid_dir("united_states") == tmp_path / "grid" / "united_states"


def test_sensor_aliases_and_unknown_codes():
    for family, aliases in (("modis", sensors.MODIS_ALIASES), ("viirs", sensors.VIIRS_ALIASES)):
        for value, expected in aliases.items():
            assert sensors.normalise_sensor(value.upper(), family) == expected
    with pytest.raises(ValueError, match="Unknown"):
        sensors.normalise_sensor("X", "viirs")
    assert sensors.normalise_viirs_confidence("High") == "h"
    with pytest.raises(ValueError):
        sensors.normalise_viirs_confidence("unknown")


def test_local_solar_day_scalar_and_vector():
    assert timebins.local_day(datetime(2024, 1, 1, 20), 75) == date(2024, 1, 2)
    assert timebins.local_day(datetime(2024, 1, 1, 1), -120) == date(2023, 12, 31)
    actual = timebins.local_day(
        pd.Series(pd.to_datetime(["2024-01-01 20:00", "2024-01-01 01:00"])), pd.Series([75, -120])
    )
    assert actual.tolist() == [date(2024, 1, 2), date(2023, 12, 31)]


def test_week_bins_and_week_52_normalization():
    for year in (2023, 2024):
        days = pd.date_range(f"{year}-01-01", f"{year}-12-31")
        assert timebins.week_of_year(days[0]) == 1
        assert timebins.week_of_year(days[356]) == 51
        assert timebins.week_of_year(days[357]) == 52
        assert timebins.days_in_week(year, 52) == (9 if year == 2024 else 8)
        frame = pd.DataFrame({"local_day": days.date, "value": 2.0})
        annual = timebins.aggregate(frame, "year", ("value",))
        assert annual.loc[0, "value"] == 2 * len(days)
        weeks = timebins.aggregate(frame, "week", ("value",))
        assert weeks["value"].eq(14).all()


def test_coverage_boundaries_and_doy_window():
    days = pd.date_range("2023-01-01", periods=7)
    frame = pd.DataFrame({"local_day": days.date, "value": [None, None, 2, 2, 2, 2, 2]})
    assert timebins.aggregate(frame, "week", ("value",)).loc[0, "value"] == 14
    assert timebins.doy_window(frame, 7, 7, 2023)["value"] == 14
    frame.loc[2, "value"] = None
    assert timebins.aggregate(frame, "week", ("value",)).loc[0, "missing"]
    month = pd.DataFrame(
        {"local_day": pd.date_range("2023-04-01", periods=30).date, "value": [2] * 24 + [None] * 6}
    )
    assert timebins.aggregate(month, "month", ("value",)).loc[0, "value"] == 60
    month.loc[23, "value"] = None
    assert timebins.aggregate(month, "month", ("value",)).loc[0, "missing"]


def test_json_and_parquet_validation(tmp_path):
    path = tmp_path / "data.json"
    io.write_json({"z": 1.23456, "a": None}, path)
    assert path.read_text(encoding="utf-8").startswith('{\n  "a": null,\n  "z": 1.235')
    with pytest.raises(ValueError, match="finite"):
        io.write_json({"bad": float("nan")}, path)
    with pytest.raises(ValueError, match="columns"):
        io.write_parquet(pd.DataFrame({"sensor": ["aqua"]}), tmp_path / "bad.parquet", "coverage")
    coverage = pd.DataFrame(
        {"sensor": ["aqua"], "local_day": [date(2020, 1, 1)], "covered": [True], "reason": ["ok"]}
    )
    io.write_parquet(coverage, tmp_path / "coverage.parquet", "coverage")
    pd.testing.assert_frame_equal(io.read_parquet(tmp_path / "coverage.parquet", "coverage"), coverage)
    assert io.code_version()


def test_runner_uses_only_us_subprocesses_and_logs(monkeypatch, capsys):
    execute = Mock(return_value=SimpleNamespace(returncode=0))
    monkeypatch.setattr(run.subprocess, "run", execute)
    assert run.main(["--region", "united_states"]) == 0
    assert [call.args[0][2] for call in execute.call_args_list] == ["pipeline.ingest", "pipeline.harmonize"]
    assert all("united_states" in call.args[0] for call in execute.call_args_list)
    log.get_logger("test")
    log.finish("test", "united_states", 1, 0)
    assert "OK test united_states rows=1" in capsys.readouterr().out
