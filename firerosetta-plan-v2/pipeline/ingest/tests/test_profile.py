from datetime import date

import pandas as pd
import pytest

from pipeline.common import config, io, paths, timebins
from pipeline.ingest import profile


def test_distinct_day_qualification_and_nrt_share():
    records = [
        {"sensor": "noaa20", "local_day": day.date(), "product": "SP"}
        for year, count in [(2018, 299), (2019, 300)]
        for day in pd.date_range(f"{year}-01-01", periods=count)
    ]
    records += [{"sensor": "aqua", "local_day": date(2020, 1, 1), "product": product}
                for product in ["SP", "NRT"]]
    # Repeated observations increase rows, not distinct-day qualification.
    records += [records[0]] * 5
    daily = profile.daily_summary(pd.DataFrame(records))
    annual, bounds, days, first = profile.summarise(daily)
    assert first == 2019
    assert days.to_dict() == {2018: 299, 2019: 300}
    aqua = annual.loc[annual.sensor.eq("aqua")].iloc[0]
    assert aqua.rows == 2 and aqua.nrt_rows == 1
    assert bounds.loc["noaa20", "min"] == date(2018, 1, 1)
    assert bounds.loc["noaa20", "max"] == pd.Timestamp("2019-10-27").date()
    assert "2 (50.000%)" in "\n".join(profile.render_summary(daily))


def test_raw_fallback_uses_only_local_us_and_solar_days(tmp_path, monkeypatch):
    source = tmp_path / "originals"
    monkeypatch.setattr(paths, "source_data_root", lambda: source)
    monkeypatch.setenv("FIREROSETTA_DATA_ROOT", str(tmp_path / "derived"))
    path = paths.country_csv_candidates("modis", 2023, "United_States")[0]
    path.parent.mkdir(parents=True)
    path.write_text(
        "satellite,longitude,acq_date,acq_time,version,type\n"
        "Aqua,-120,2023-01-01,0100,61.03,0\n"
        "Terra,-120,2023-01-01,1200,61.03,\n",
        encoding="utf-8",
    )
    original = path.read_bytes()
    daily, files = profile.source_summary()
    assert daily.loc[daily.sensor.eq("aqua"), "local_day"].iloc[0] == date(2022, 12, 31)
    assert daily.loc[daily.sensor.eq("terra"), "nrt_rows"].iloc[0] == 1
    report = profile.build_report("us")
    assert "PROVISIONAL, UNFILTERED" in report
    assert "Region cells: unavailable" in report
    assert "coverage.parquet is missing" in report
    assert f"| ../data/MODIS_data/{path.name} | {path.stat().st_size} |" in report
    assert files == [(path, path.stat().st_size)]
    assert original == path.read_bytes()
    destination = tmp_path / "profile_us.md"
    monkeypatch.setattr(paths, "profile_report", lambda region: destination)
    assert profile.main(["--region", "us"]) == 0
    assert destination.read_text(encoding="utf-8").startswith("# US data profile")


def test_peak_week_uses_aqua_day_and_coverage_scaling(monkeypatch):
    monkeypatch.setattr(timebins, "load_science", lambda: {
        "timebins": {"week_min_covered_days": 5, "month_min_covered_frac": 0.8, "year_min_covered_frac": 0.9},
    })
    dates = pd.date_range("2023-01-01", periods=7).date
    covered = pd.DataFrame({"sensor": "aqua", "local_day": dates, "covered": True})
    cells = pd.DataFrame({
        "sensor": ["aqua"] * 6 + ["snpp", "aqua"],
        "daynight": ["D"] * 7 + ["N"],
        "local_day": [dates[0]] * 8,
        "h3_r6": ["one", "two", "three", "four", "five", "six", "other", "night"],
    })
    assert profile.peak_aqua_week(cells, covered) == (2023, 1, 6.0)
    covered["covered"] = False
    assert profile.peak_aqua_week(cells, covered) is None


def test_processed_profile_uses_contract_files(tmp_path, monkeypatch):
    from pipeline.ingest.clean import typed
    monkeypatch.setenv("FIREROSETTA_DATA_ROOT", str(tmp_path))
    for sensor in profile.SENSORS:
        io.write_parquet(typed(pd.DataFrame(), "detections"), paths.detections("us", sensor), "detections")
    io.write_parquet(typed(pd.DataFrame({
        "sensor": ["aqua"], "local_day": [date(2023, 1, 1)], "covered": [False], "reason": ["outage_list"],
    }), "coverage"), paths.coverage("us"), "coverage")
    member = typed(pd.DataFrame({"h3_r6": ["cell"], "h3_r5": ["parent"], "lat": [1.0], "lon": [2.0]}),
                   "region_cells")
    member.attrs["membership"] = "bbox"
    io.write_parquet(member, paths.region_cells("us"), "region_cells")
    report = profile.build_report("us")
    assert "Basis: cleaned detections" in report and "PROVISIONAL" not in report
    assert "| aqua | outage_list | 1 |" in report
    assert "Region cells: 1; membership: bbox." in report


def test_missing_source_and_invalid_region_fail(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(paths, "source_data_root", lambda: tmp_path / "missing")
    monkeypatch.setenv("FIREROSETTA_DATA_ROOT", str(tmp_path / "derived"))
    assert profile.main(["--region", "us"]) == 1
    assert "No local US CSVs" in capsys.readouterr().err
    with pytest.raises(ValueError):
        config.get_region("foreign")


def test_unknown_sensor_is_rejected():
    with pytest.raises(ValueError, match="Unexpected sensor"):
        profile.daily_summary(pd.DataFrame({
            "sensor": ["X"], "local_day": [date(2023, 1, 1)], "product": ["SP"],
        }))
