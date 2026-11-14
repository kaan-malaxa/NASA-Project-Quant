import csv
import hashlib
import json
import logging
from datetime import date, timedelta

import pytest
import requests

from pipeline.common import config, paths
from pipeline.ingest import download

HEADER = "latitude,longitude,acq_date,acq_time,satellite\n"


@pytest.fixture
def data_root(tmp_path, monkeypatch):
    monkeypatch.setenv("FIREROSETTA_DATA_ROOT", str(tmp_path))
    paths.tmp_dir().mkdir()
    candidates = paths.country_csv_candidates
    monkeypatch.setattr(paths, "country_csv_candidates", lambda *args: [
        path for path in candidates(*args) if path.is_relative_to(tmp_path)
    ])
    return tmp_path


def csv_file(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def records(path):
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def test_bbox_includes_all_boundaries(data_root):
    source = csv_file(data_root / "source.csv", HEADER + (
        "10,20,2023-01-01,0001,Aqua\n"
        "12,22,2023-01-02,0015,Aqua\n"
        "11,21,2023-01-03,0300,Aqua\n"
        "9.999,21,2023-01-04,0300,Aqua\n"
        "12.001,21,2023-01-04,0300,Aqua\n"
        "11,19.999,2023-01-04,0300,Aqua\n"
        "11,22.001,2023-01-04,0300,Aqua\n"
    ))
    output = data_root / "clipped.csv"
    download.clip_bbox([source], output, [20, 10, 22, 12])
    rows = records(output)
    assert len(rows) == 3
    assert {row["acq_time"] for row in rows} == {"0001", "0015", "0300"}
    assert list(rows[0]) == HEADER.strip().split(",")


def test_manifest_idempotent_and_changed_file_replaces_entry(data_root):
    path = csv_file(paths.raw_csv("us", "modis", "country", 2023), HEADER + (
        "40,-120,2023-03-01,0015,Aqua\n40,-120,2023-02-01,0015,Aqua\n"
    ))
    download.update_manifest("us", path, "modis", "country")
    manifest = paths.manifest("us")
    before = manifest.read_bytes()
    download.update_manifest("us", path, "modis", "country")
    assert manifest.read_bytes() == before
    entry = json.loads(before)[0]
    assert set(entry) == {
        "file", "source", "via", "downloaded_at", "rows", "sha256", "first_date", "last_date",
    }
    assert entry["rows"] == 2
    assert entry["first_date"] == "2023-02-01"
    assert entry["last_date"] == "2023-03-01"
    assert entry["sha256"] == hashlib.sha256(path.read_bytes()).hexdigest()
    assert entry["downloaded_at"].endswith("Z")
    path.write_text(HEADER, encoding="utf-8")
    download.update_manifest("us", path, "modis", "country")
    updated = json.loads(manifest.read_text(encoding="utf-8"))
    assert len(updated) == 1 and updated[0]["rows"] == 0
    assert updated[0]["first_date"] is None and updated[0]["last_date"] is None


@pytest.mark.parametrize("start,end", [
    (date(2023, 1, 1), date(2023, 1, 1)),
    (date(2023, 1, 1), date(2023, 1, 31)),
    (date(2023, 12, 28), date(2024, 1, 8)),
    (date(2024, 2, 25), date(2024, 3, 5)),
])
def test_api_windows_cover_once(start, end):
    windows = list(download.api_windows(start, end))
    days = [
        first + timedelta(days=offset)
        for first, last in windows for offset in range((last - first).days + 1)
    ]
    assert days == [start + timedelta(days=offset) for offset in range((end - start).days + 1)]
    assert all(1 <= (last - first).days + 1 <= 5 for first, last in windows)
    with pytest.raises(ValueError):
        list(download.api_windows(end + timedelta(days=1), start))


class CountryClient:
    def __init__(self, missing=False):
        self.calls = []
        self.missing = missing

    def fetch(self, url, target, allow_404=False):
        self.calls.append(url)
        if self.missing:
            assert allow_404
            return False
        csv_file(target, HEADER + "40,-120,2023-04-01,0015,Aqua\n0,0,2023-04-01,0015,Aqua\n")
        return True


def test_country_clip_skip_and_manifest(data_root):
    client = CountryClient()
    region = config.get_region("us")
    download.download_country(region, [2023], ["modis"], client)
    path = paths.raw_csv("us", "modis", "country", 2023)
    assert len(records(path)) == 1
    assert client.calls == [
        "https://firms.modaps.eosdis.nasa.gov/data/country/modis/2023/modis_2023_United_States.csv",
    ]
    previous = paths.manifest("us").read_bytes()
    download.download_country(region, [2023], ["modis"], client)
    assert len(client.calls) == 1
    assert paths.manifest("us").read_bytes() == previous
    assert list(paths.tmp_dir().iterdir()) == []


def test_country_404_is_not_fatal(data_root):
    manifest = download.download_country(config.get_region("us"), [2023], ["modis"], CountryClient(True))
    assert manifest == []
    assert not paths.raw_csv("us", "modis", "country", 2023).exists()


def test_local_country_file_is_reused_without_http_and_unchanged(data_root):
    source = csv_file(paths.country_csv_candidates("modis", 2023, "United_States")[0], HEADER + (
        "40,-120,2023-04-01,0015,Aqua\n0,0,2023-04-01,0015,Aqua\n"
    ))
    original = source.read_bytes()
    client = CountryClient()
    manifest = download.download_country(config.get_region("us"), [2023], ["modis"], client)
    assert client.calls == []
    assert source.read_bytes() == original
    assert manifest[0]["rows"] == 1


class ApiClient:
    def __init__(self, fail_at=None, bad_header=False):
        self.calls = []
        self.fail_at = fail_at
        self.bad_header = bad_header

    def fetch(self, url, target):
        self.calls.append(url)
        if "data_availability" in url:
            csv_file(target, "MODIS_SP\n")
        elif self.fail_at == len(self.calls):
            raise download.DownloadError("Request failed")
        elif self.bad_header:
            csv_file(target, "Invalid MAP_KEY: this-must-not-be-logged")
        else:
            first = url.rsplit("/", 1)[-1]
            csv_file(target, HEADER + f"40,-120,{first},0015,Aqua\n")
        return True


def test_api_appends_windows_once_and_refreshes_without_duplicates(data_root):
    region = config.get_region("us")
    client = ApiClient()
    download.download_api(region, [2023], ["MODIS_SP"], "secret", client)
    path = paths.raw_csv("us", "modis", "api", 2023)
    rows = records(path)
    assert len(rows) == 73
    assert rows[0]["acq_date"] == "2023-01-01"
    assert rows[-1]["acq_date"] == "2023-12-27"
    assert rows[0]["acq_time"] == "0015"
    old = paths.manifest("us").read_bytes()
    download.download_api(region, [2023], ["MODIS_SP"], "secret", ApiClient())
    assert len(records(path)) == 73
    assert paths.manifest("us").read_bytes() == old


def test_api_failure_keeps_old_output_and_manifest(data_root):
    region = config.get_region("us")
    path = csv_file(paths.raw_csv(region.id, "modis", "api", 2023), HEADER + "40,-120,2023-01-01,0015,Aqua\n")
    download.update_manifest(region.id, path, "MODIS_SP", "api")
    old_csv, old_manifest = path.read_bytes(), paths.manifest(region.id).read_bytes()
    with pytest.raises(download.DownloadError):
        download.download_api(region, [2023], ["MODIS_SP"], "secret", ApiClient(fail_at=3))
    assert path.read_bytes() == old_csv
    assert paths.manifest(region.id).read_bytes() == old_manifest


class Response:
    def __init__(self, status=200):
        self.status_code = status
        self.closed = False

    def iter_content(self, chunk_size):
        yield b"latitude,longitude,acq_date\n"

    def close(self):
        self.closed = True


class Session:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.calls = 0

    def get(self, *args, **kwargs):
        self.calls += 1
        response = next(self.responses)
        if isinstance(response, Exception):
            raise response
        return response

    def close(self):
        pass


def test_http_retries_pacing_and_no_key_in_error(tmp_path, caplog):
    responses = [Response(500) for _ in range(4)]
    session = Session(responses)
    pauses = []
    client = download.Client(session=session, sleep=pauses.append)
    with pytest.raises(download.DownloadError, match="three retries") as error:
        client.fetch("https://example.invalid/private-key", tmp_path / "response.csv")
    assert session.calls == 4
    assert pauses == [1, 1, 2, 1, 4, 1]
    assert all(response.closed for response in responses)
    assert "private-key" not in str(error.value) + caplog.text
    assert logging.getLogger("urllib3").level == logging.WARNING


def test_network_exception_is_redacted(tmp_path):
    session = Session([requests.ConnectionError("https://example.invalid/private-key")] * 4)
    with pytest.raises(download.DownloadError) as error:
        download.Client(session, sleep=lambda seconds: None).fetch("secret", tmp_path / "response.csv")
    assert "private-key" not in str(error.value)


def test_header_mismatch_stops_without_guessing(data_root):
    bad = csv_file(data_root / "bad.csv", "lat,lon,date\n40,-120,2023-01-01\n")
    with pytest.raises(download.DownloadError, match="latitude"):
        download.clip_bbox([bad], data_root / "out.csv", [73.8, 27.6, 77.6, 32.6])


def test_parse_years():
    assert list(download.parse_years("2023:2025")) == [2023, 2024, 2025]
    for raw in ["2023", "2025:2023", "x:y", "0:2023"]:
        with pytest.raises(download.DownloadError):
            download.parse_years(raw)
