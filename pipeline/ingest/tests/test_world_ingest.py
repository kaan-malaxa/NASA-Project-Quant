import csv
import json
import zipfile
from datetime import date

import pandas as pd
import pytest

from pipeline.common import config, io, paths, provenance
from pipeline.ingest import download, grid, world_data

HEADER = "latitude,longitude,acq_date,acq_time,satellite\n"
BRAZIL = (HEADER + "-10,-50,2023-08-01,0250,Aqua\n-10,-50,2023-08-02,1340,Terra\n"
          "5,-80,2023-08-02,1340,Terra\n").encode()  # the last row is outside Brazil's box
PERU = (HEADER + "-10,-75,2023-08-01,0250,Aqua\n").encode()


def world_region(rid, country, bbox):
    return config.Region(
        id=rid, name=country, country="XX", bbox=bbox,
        polygon=paths.world_polygon(rid).relative_to(paths.PROJECT_ROOT).as_posix(),
        fire_type="Satellite-detected burning activity", story="test", synthetic=False,
        firms_country_names=[country], source="firms_world",
    )


@pytest.fixture
def world(tmp_path, monkeypatch):
    source = tmp_path / "source"
    source.mkdir()
    monkeypatch.setattr(paths, "source_data_root", lambda: source)
    monkeypatch.setenv("PROMETHEUS_TORCH_DATA_ROOT", str(tmp_path / "derived"))
    archive = paths.world_archives_dir() / "modis_2023_all_countries.zip"
    archive.parent.mkdir(parents=True)
    with zipfile.ZipFile(archive, "w") as bundle:
        bundle.writestr("modis/2023/modis_2023_Brazil.csv", BRAZIL)
        bundle.writestr("modis/2023/modis_2023_Peru.csv", PERU)
    world_data.build([archive], workers=1)
    regions = [world_region("brazil", "Brazil", [-74.0, -34.0, -34.0, 5.3]),
               world_region("peru", "Peru", [-81.4, -18.4, -68.6, 0.0])]
    monkeypatch.setattr(config, "load_world_regions", lambda: regions)
    return {region.id: region for region in regions}


def test_world_region_stages_the_exact_original_then_clips(world):
    manifest = download.download_country(world["brazil"], [2022, 2023], ["modis", "viirs-snpp"])
    [entry] = manifest
    assert entry["source"] == "FIRMS_world/modis/2023/modis_2023_Brazil.parquet"
    assert entry["file"] == "modis_country_2023.csv" and entry["via"] == "country" and entry["rows"] == 2
    staged = paths.raw_csv("brazil", "modis", "country", 2023)
    with staged.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    assert [row["acq_time"] for row in rows] == ["0250", "1340"]
    assert entry["sha256"] == io.sha256(staged)
    # Provenance binds the stored original as well as the staged bytes.
    files = provenance.raw_inputs("brazil")
    assert paths.world_file("modis", 2023, "Brazil") in files and staged in files
    # Re-staging is idempotent.
    before = paths.manifest("brazil").read_bytes()
    download.download_country(world["brazil"], [2023], ["modis"])
    assert paths.manifest("brazil").read_bytes() == before


def test_a_region_only_accepts_its_own_country(world):
    assert download.source_job(world["brazil"], "FIRMS_world/modis/2023/modis_2023_Brazil.parquet") == ("modis", 2023)
    with pytest.raises(download.DownloadError, match="not a brazil source"):
        download.source_job(world["brazil"], "FIRMS_world/modis/2023/modis_2023_Peru.parquet")
    us_csv = paths.country_csv_candidates("modis", 2023, "United_States")[0]
    us_csv.parent.mkdir(parents=True)
    us_csv.write_bytes(BRAZIL)
    with pytest.raises(download.DownloadError, match="not a brazil source"):
        download.source_job(world["brazil"], "MODIS_data/modis_2023_United_States.csv")
    with pytest.raises(download.DownloadError, match="not a us source"):
        download.source_job(config.get_region("us"), "FIRMS_world/modis/2023/modis_2023_Brazil.parquet")


def test_missing_world_country_reports_world_files(world):
    with pytest.raises(download.DownloadError, match="No requested FIRMS world files for peru"):
        download.download_country(world["peru"], [2019], ["modis"])


def test_world_coverage_reference_and_record_end(world):
    download.download_country(world["brazil"], [2023], ["modis"])
    counts = pd.DataFrame({"sensor": ["aqua", "aqua", "aqua"],
                           "utc_date": [date(2023, 8, 1), date(2023, 12, 31), date(2024, 1, 2)],
                           "n_raw_rows": [5, 7, 9]})
    io.write_parquet(counts, paths.world_daily_counts(), "raw_daily_counts")
    reference, end = grid.world_reference("brazil", world["brazil"])
    assert reference == [paths.world_daily_counts()]
    assert end == date(2023, 12, 31)  # bounded by the staged years, not the reference's last day
    assert grid.world_reference("us", config.get_region("us")) == ([], None)
    paths.world_daily_counts().unlink()
    with pytest.raises(ValueError, match="world_data counts"):
        grid.world_reference("brazil", world["brazil"])


def test_manifest_drops_entries_whose_source_is_another_country(world):
    download.download_country(world["brazil"], [2023], ["modis"])
    entries = json.loads(paths.manifest("brazil").read_text(encoding="utf-8"))
    entries.append({**entries[0], "file": "modis_country_2022.csv",
                    "source": "FIRMS_world/modis/2023/modis_2023_Peru.parquet"})
    paths.manifest("brazil").write_text(json.dumps(entries), encoding="utf-8")
    assert [entry["file"] for entry in download.update_manifest("brazil")] == ["modis_country_2023.csv"]
