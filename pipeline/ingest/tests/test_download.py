import csv
import hashlib
import json
from dataclasses import replace
from datetime import date, timedelta

import pytest

from pipeline.common import config, paths
from pipeline.ingest import download

HEADER = "latitude,longitude,acq_date,acq_time,satellite\n"


@pytest.fixture
def local_data(tmp_path, monkeypatch):
    source = tmp_path / "source"
    source.mkdir()
    monkeypatch.setattr(paths, "source_data_root", lambda: source)
    monkeypatch.setenv("FIREROSETTA_DATA_ROOT", str(tmp_path / "derived"))
    return source


def csv_file(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def local_source(text, year=2023, product="modis"):
    return csv_file(paths.country_csv_candidates(product, year, "United_States")[0], text)


def records(path):
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def test_filename_year_must_match_observation_dates(local_data):
    local_source(HEADER + "40,-120,2022-12-31,0015,Aqua\n", year=2023)
    with pytest.raises(download.DownloadError, match="Filename year 2023"):
        download.download_country(config.get_region("us"), [2023], ["modis"])


def test_bbox_includes_all_boundaries(local_data):
    source = csv_file(local_data / "source.csv", HEADER + (
        "10,20,2023-01-01,0001,Aqua\n"
        "12,22,2023-01-02,0015,Aqua\n"
        "11,21,2023-01-03,0300,Aqua\n"
        "9.999,21,2023-01-04,0300,Aqua\n"
        "12.001,21,2023-01-04,0300,Aqua\n"
        "11,19.999,2023-01-04,0300,Aqua\n"
        "11,22.001,2023-01-04,0300,Aqua\n"
    ))
    output = local_data / "clipped.csv"
    download.clip_bbox([source], output, [20, 10, 22, 12])
    rows = records(output)
    assert len(rows) == 3
    assert {row["acq_time"] for row in rows} == {"0001", "0015", "0300"}
    assert list(rows[0]) == HEADER.strip().split(",")


def test_local_stage_manifest_and_rerun_are_idempotent(local_data):
    source = local_source(HEADER + (
        "40,-120,2023-03-01,0015,Aqua\n40,-120,2023-02-01,0015,Aqua\n0,0,2023-02-01,0015,Aqua\n"
    ))
    original = source.read_bytes()
    region = config.get_region("us")
    download.download_country(region, [2023], ["modis"])
    manifest = paths.manifest("us")
    before = manifest.read_bytes()
    download.download_country(region, [2023], ["modis"])
    assert manifest.read_bytes() == before
    assert source.read_bytes() == original
    output = paths.raw_csv("us", "modis", "country", 2023)
    assert len(records(output)) == 2
    entry = json.loads(before)[0]
    assert set(entry) == {
        "file", "source", "via", "downloaded_at", "rows", "sha256", "first_date", "last_date",
    }
    assert entry["rows"] == 2
    assert entry["source"] == "MODIS_data/modis_2023_United_States.csv"
    assert entry["first_date"] == "2023-02-01"
    assert entry["last_date"] == "2023-03-01"
    assert entry["sha256"] == hashlib.sha256(output.read_bytes()).hexdigest()
    assert entry["downloaded_at"].endswith("Z")
    assert list(paths.tmp_dir().iterdir()) == []


def test_modified_local_source_rebuilds_cache(local_data):
    source = local_source(HEADER + "40,-120,2023-01-01,0015,Aqua\n")
    region = config.get_region("us")
    download.download_country(region, [2023], ["modis"])
    source.write_text(HEADER + "40,-120,2023-02-01,0300,Aqua\n", encoding="utf-8")
    download.download_country(region, [2023], ["modis"])
    output = paths.raw_csv("us", "modis", "country", 2023)
    assert records(output)[0]["acq_date"] == "2023-02-01"
    assert json.loads(paths.manifest("us").read_text(encoding="utf-8"))[0]["first_date"] == "2023-02-01"


def test_untrusted_staged_csv_is_rebuilt_from_local_source(local_data):
    local_source(HEADER + "40,-120,2023-01-01,0015,Aqua\n")
    destination = csv_file(paths.raw_csv("us", "modis", "country", 2023), HEADER + (
        "40,-120,2023-01-01,0015,Aqua\n41,-121,2023-01-02,0015,Aqua\n"
    ))
    download.download_country(config.get_region("us"), [2023], ["modis"])
    assert len(records(destination)) == 1


def test_empty_clip_records_missing_date_bounds(local_data):
    local_source(HEADER + "0,0,2023-01-01,0015,Aqua\n")
    manifest = download.download_country(config.get_region("us"), [2023], ["modis"])
    assert manifest[0]["rows"] == 0
    assert manifest[0]["first_date"] is None and manifest[0]["last_date"] is None


def test_missing_source_does_not_trust_cached_output(local_data):
    destination = csv_file(paths.raw_csv("us", "modis", "country", 2023), HEADER + (
        "40,-120,2023-01-01,0015,Aqua\n"
    ))
    original = destination.read_bytes()
    with pytest.raises(download.DownloadError, match="No requested local US CSVs"):
        download.download_country(config.get_region("us"), [2023], ["modis"])
    assert destination.read_bytes() == original
    assert not paths.manifest("us").exists()


def test_output_directory_cannot_supply_input(local_data):
    csv_file(paths.data_root() / "MODIS_data" / "modis_2023_United_States.csv", HEADER)
    with pytest.raises(download.DownloadError, match="No requested local US CSVs"):
        download.download_country(config.get_region("us"), [2023], ["modis"])


def test_missing_product_year_is_reported_without_zero_entry(local_data):
    local_source(HEADER + "40,-120,2023-01-01,0015,Aqua\n")
    manifest = download.download_country(config.get_region("us"), [2023], ["modis", "viirs-snpp"])
    assert len(manifest) == 1
    assert "viirs_snpp_country_2023.csv" not in {entry["file"] for entry in manifest}


def test_malformed_staged_csv_is_repaired(local_data):
    local_source(HEADER + "40,-120,2023-01-01,0015,Aqua\n")
    output = csv_file(paths.raw_csv("us", "modis", "country", 2023), "wrong,columns\n1,2\n")
    download.download_country(config.get_region("us"), [2023], ["modis"])
    assert records(output)[0]["acq_date"] == "2023-01-01"


def test_api_mode_is_rejected_before_reading_sources(local_data, monkeypatch, capsys):
    def forbidden():
        pytest.fail("API mode must not touch the filesystem or network")
    monkeypatch.setattr(paths, "source_data_root", forbidden)
    assert download.main(["--region", "us", "--via", "api", "--years", "2023:2023"]) == 1
    assert "--via api is disabled" in capsys.readouterr().err


def test_non_us_region_is_rejected(local_data):
    other = replace(config.get_region("us"), country="CA", firms_country_names=["Canada"])
    with pytest.raises(ValueError, match="Only the us region"):
        download.download_country(other, [2023], ["modis"])


def test_source_cannot_escape_approved_directory(local_data):
    with pytest.raises(download.DownloadError, match="must remain inside"):
        download._source_name(local_data.parent / "outside.csv")
    with pytest.raises(ValueError, match="Only existing United_States"):
        paths.country_csv_candidates("modis", 2023, "India")


@pytest.mark.parametrize("start,end", [
    (date(2023, 1, 1), date(2023, 1, 1)),
    (date(2023, 1, 1), date(2023, 1, 31)),
    (date(2023, 12, 28), date(2024, 1, 8)),
    (date(2024, 2, 25), date(2024, 3, 5)),
])
def test_api_windows_are_pure_and_cover_once(start, end):
    windows = list(download.api_windows(start, end))
    days = [
        first + timedelta(days=offset)
        for first, last in windows for offset in range((last - first).days + 1)
    ]
    assert days == [start + timedelta(days=offset) for offset in range((end - start).days + 1)]
    assert all(1 <= (last - first).days + 1 <= 5 for first, last in windows)
    with pytest.raises(ValueError):
        list(download.api_windows(end + timedelta(days=1), start))


def test_header_mismatch_stops_without_guessing(local_data):
    bad = local_source("lat,lon,date\n40,-120,2023-01-01\n")
    original = bad.read_bytes()
    with pytest.raises(download.DownloadError, match="latitude"):
        download.download_country(config.get_region("us"), [2023], ["modis"])
    assert bad.read_bytes() == original
    assert not paths.manifest("us").exists()


def test_parse_years():
    assert list(download.parse_years("2023:2025")) == [2023, 2024, 2025]
    for raw in ["2023", "2025:2023", "x:y", "0:2023"]:
        with pytest.raises(download.DownloadError):
            download.parse_years(raw)
