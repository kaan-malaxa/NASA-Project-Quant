import json
import zipfile
from datetime import date

import pyarrow.parquet as pq
import pytest

from pipeline.common import io, paths
from pipeline.ingest import world_data

MODIS_HEADER = "latitude,longitude,acq_date,acq_time,satellite,instrument,confidence,version,frp,type"
VIIRS_HEADER = "latitude,longitude,acq_date,acq_time,satellite,instrument,confidence,version,frp,type"


@pytest.fixture
def world(tmp_path, monkeypatch):
    source = tmp_path / "source"
    source.mkdir()
    monkeypatch.setattr(paths, "source_data_root", lambda: source)
    monkeypatch.setenv("PROMETHEUS_TORCH_DATA_ROOT", str(tmp_path / "derived"))
    return paths.world_root()


def make_archive(folder, product, year, members, readme=True):
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{product}_{year}_all_countries.zip"
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
        bundle.writestr(f"{product}/{year}/", b"")
        for country, data in members.items():
            bundle.writestr(f"{product}/{year}/{product}_{year}_{country}.csv", data)
        if readme:
            bundle.writestr(f"{product}/{year}/AttributesReadme.txt", b"attributes")
    return path


BRAZIL = (MODIS_HEADER + "\n"
          "-10.5,-50.25,2023-08-01,0250,Aqua,MODIS,71,6.10,12.0,0\n"
          "-10.6,-50.30,2023-08-01,1340,Terra,MODIS,30,6.10,7.5,0\n"
          "-11.0,-51.00,2023-08-02,0310,A,MODIS,100,6.1NRT,3.25,\n").encode()


def test_round_trip_keeps_exact_bytes_leading_zeros_and_layouts(world):
    crlf = BRAZIL.replace(b"\n", b"\r\n")
    no_trailing = BRAZIL[:-1]
    with_bom = b"\xef\xbb\xbf" + BRAZIL
    for raw in (BRAZIL, crlf, no_trailing, with_bom, (MODIS_HEADER + "\n").encode()):
        table, layout = world_data.parse_csv(raw)
        assert world_data.csv_bytes(table, layout) == raw
    table, _ = world_data.parse_csv(BRAZIL)
    assert table["acq_time"].to_pylist() == ["0250", "1340", "0310"]  # never parsed as numbers
    assert table["version"].to_pylist() == ["6.10", "6.10", "6.1NRT"]
    assert table["type"].to_pylist() == ["0", "0", ""]


def test_quoted_csv_that_cannot_round_trip_is_refused(world, tmp_path):
    raw = (MODIS_HEADER + '\n"1",2,2023-01-01,0001,Aqua,MODIS,5,6.1,1.0,0\n').encode()
    with pytest.raises(world_data.WorldDataError, match="round trip"):
        world_data.convert_member(raw, tmp_path / "x.parquet", "member.csv")
    assert not (tmp_path / "x.parquet").exists()


def test_build_index_verify_read_and_original_csv(world):
    empty = (MODIS_HEADER + "\n").encode()
    archive = make_archive(paths.world_archives_dir(), "modis", 2023, {"Brazil": BRAZIL, "Nauru": empty})
    index = world_data.build([archive], workers=1)
    [entry] = index["archives"]
    assert entry["members"] == 2 and entry["readmes"] == ["modis/2023/AttributesReadme.txt"]
    brazil = next(record for record in entry["files"] if record["country"] == "Brazil")
    assert brazil["rows"] == 3
    assert (brazil["first_date"], brazil["last_date"]) == ("2023-08-01", "2023-08-02")
    assert brazil["path"] == "modis/2023/modis_2023_Brazil.parquet"
    assert world_data.original_csv("modis", 2023, "Brazil") == BRAZIL
    assert world_data.original_csv("modis", 2023, "Nauru") == empty
    assert world_data.read_table("modis", 2023, "Brazil").num_rows == 3
    assert pq.read_metadata(paths.world_file("modis", 2023, "Brazil")).row_group(0).column(0).compression == "ZSTD"
    assert world_data.verify(full=True) == []
    assert world_data.countries() == {"Brazil": {"modis": [2023]}, "Nauru": {"modis": [2023]}}
    # An unchanged archive is not converted again.
    stamp = paths.world_file("modis", 2023, "Brazil").stat().st_mtime_ns
    world_data.build([archive], workers=1)
    assert paths.world_file("modis", 2023, "Brazil").stat().st_mtime_ns == stamp
    # Tampering is detected.
    paths.world_file("modis", 2023, "Nauru").write_bytes(b"tampered")
    assert world_data.verify() == ["changed modis/2023/modis_2023_Nauru.parquet"]


def test_delete_archives_only_after_verified_build(world):
    archive = make_archive(paths.world_archives_dir(), "modis", 2023, {"Brazil": BRAZIL})
    world_data.build([archive], workers=1, delete_archives=True)
    assert not archive.exists()
    assert world_data.original_csv("modis", 2023, "Brazil") == BRAZIL


def test_unexpected_member_and_wrong_year_are_refused(world):
    bad = make_archive(paths.world_archives_dir(), "modis", 2023, {"Brazil": BRAZIL})
    with zipfile.ZipFile(bad, "a") as bundle:
        bundle.writestr("modis/2023/surprise.csv", BRAZIL)
    with pytest.raises(world_data.WorldDataError, match="Unexpected member"):
        world_data._convert_archive(bad, paths.world_root())
    wrong_year = make_archive(paths.world_archives_dir() / "y", "modis", 2022, {"Brazil": BRAZIL})
    with pytest.raises(world_data.WorldDataError, match="outside its archive year"):
        world_data._convert_archive(wrong_year, paths.world_root())


def test_daily_counts_sum_every_country_per_sensor_and_utc_date(world):
    snpp = (VIIRS_HEADER + "\n1,1,2023-08-01,0100,N,VIIRS,n,2,1,0\n1,1,2023-08-02,0100,N,VIIRS,h,2,1,0\n").encode()
    other = (VIIRS_HEADER + "\n2,2,2023-08-01,0200,N,VIIRS,l,2,1,0\n2,2,bad-date,0200,N,VIIRS,l,2,1,0\n").encode()
    world_data.build([
        make_archive(paths.world_archives_dir(), "modis", 2023, {"Brazil": BRAZIL}),
        make_archive(paths.world_archives_dir(), "viirs-snpp", 2023, {"Brazil": snpp, "Peru": other}),
    ], workers=1)
    world_data.daily_counts()
    frame = io.read_parquet(paths.world_daily_counts(), "raw_daily_counts")
    counts = {(row.sensor, row.utc_date): row.n_raw_rows for row in frame.itertuples()}
    assert counts == {
        ("aqua", date(2023, 8, 1)): 1, ("aqua", date(2023, 8, 2)): 1, ("terra", date(2023, 8, 1)): 1,
        ("snpp", date(2023, 8, 1)): 2, ("snpp", date(2023, 8, 2)): 1,
    }


def test_world_file_rejects_unsafe_names():
    with pytest.raises(ValueError):
        paths.world_file("modis", 2023, "../escape")
    with pytest.raises(ValueError):
        paths.world_file("goes", 2023, "Brazil")


class FakeResponse:
    def __init__(self, status, body=b"", length=None):
        self.status_code, self.body = status, body
        self.headers = {"Content-Length": str(len(body) if length is None else length)}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise OSError(self.status_code)

    def iter_content(self, size):
        yield self.body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeSession:
    def __init__(self, files):
        self.files, self.headers, self.ranges = files, {}, []

    def head(self, url, **kwargs):
        body = self.files.get(url)
        return FakeResponse(404) if body is None else FakeResponse(200, length=len(body))

    def get(self, url, headers=None, **kwargs):
        start = int(headers["Range"].split("=")[1].rstrip("-")) if headers else 0
        self.ranges.append(start)
        return FakeResponse(206 if start else 200, self.files[url][start:])


def test_fetch_resumes_partial_downloads_and_skips_unpublished_years(world):
    url = world_data.ARCHIVE_URL.format(product="modis", year=2024)
    session = FakeSession({url: b"0123456789"})
    target = paths.world_archives_dir() / "modis_2024_all_countries.zip"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"0123")
    saved = world_data.fetch(["modis"], range(2024, 2026), session=session)
    assert saved == [target] and target.read_bytes() == b"0123456789"
    assert session.ranges == [4]


def test_cli_csv_writes_the_original(world, tmp_path, capsys):
    world_data.build([make_archive(paths.world_archives_dir(), "modis", 2023, {"Brazil": BRAZIL})], workers=1)
    output = tmp_path / "out.csv"
    code = world_data.main(["csv", "--products", "modis", "--year", "2023", "--country", "Brazil",
                            "--output", str(output), "--data-root", str(tmp_path / "derived")])
    assert code == 0 and output.read_bytes() == BRAZIL
    assert json.loads(paths.world_index().read_text(encoding="utf-8"))["version"] == 1
