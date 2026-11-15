# World data: every NASA FIRMS country

The FIRMS country page (`https://firms.modaps.eosdis.nasa.gov/country/`) publishes one zip per product and
year, each holding one CSV per country: `https://firms.modaps.eosdis.nasa.gov/data/country/zips/{product}_{year}_all_countries.zip`
with `product` in `modis` (2000+), `viirs-snpp` (2012+) and `viirs-jpss1` (2018+). All 48 archives published
up to 2025 are stored locally. 2026 is not yet published.

## Storage

| Path | What |
|---|---|
| `data/FIRMS_world/{product}/{year}/{product}_{year}_{Country}.parquet` | One file per original country CSV |
| `data/FIRMS_world/{product}/{year}/AttributesReadme.txt` | The attribute readme shipped in each archive |
| `data/FIRMS_world/index.json` | Every archive (URL, bytes, SHA-256) and file (rows, dates, original CSV bytes and SHA-256, Parquet SHA-256) |
| `data/FIRMS_world/raw_daily_counts.parquet` | Unfiltered raw rows per sensor and UTC date over all countries (SD-08 reference) |

Every column is stored as the original text (no numeric parsing, so `acq_time` `0250` and `version` `6.1NRT`
stay exact). Each file carries its original layout (newline, trailing newline, BOM) and SHA-256 in its Parquet
metadata. A file is written only after it has been shown to rebuild the original CSV byte for byte. Text columns
with dictionary encoding and zstd (level 12) were smaller than lossless numeric typing on real archives.

The whole record is 548,501,203 detections in 10,095 country files: 43.47 GB of CSV stored in 7.78 GB of
Parquet (9.75 GB as the original zips, deleted after a full verification; `fetch` restores them).
`data/` is git-ignored.

## Commands

```text
uv run python -m pipeline.ingest.world_data fetch                   # resumable download of all archives
uv run python -m pipeline.ingest.world_data build --delete-archives # convert, verify, then remove the zips
uv run python -m pipeline.ingest.world_data counts                  # rebuild raw_daily_counts.parquet
uv run python -m pipeline.ingest.world_data verify --full           # every file rebuilds its original CSV
uv run python -m pipeline.ingest.world_data list                    # countries, products and years
uv run python -m pipeline.ingest.world_data csv --products modis --year 2023 --country Brazil --output brazil.csv
uv run python -m pipeline.ingest.world_regions                      # regenerate world_regions.yaml + outlines
```

Query everything directly with DuckDB, for example:

```sql
SELECT filename, count(*) FROM read_parquet('data/FIRMS_world/viirs-snpp/*/*.parquet', filename = true) GROUP BY ALL;
```

## Regions

`pipeline/config/world_regions.yaml` is generated, never edited by hand. It holds one region per FIRMS country.
The id is the FIRMS name in lower case with hyphens, for example `portugal`, `cote-d-ivoire` or
`russian-federation`. `United_States` stays the core `us` region (tracked CSVs, Alaska and Hawaii outline).

- Outlines: Natural Earth 1:10m admin-0 **map units** (public domain), with coordinates rounded to 3 decimals
  as for `us`. Territories FIRMS lists separately (French Guiana, Réunion, Svalbard, ...) are not drawn into
  their sovereign. Four FIRMS names are matched by ISO identity: North Macedonia, Republic of the Congo,
  South Georgia, and Svalbard with Jan Mayen.
- Map units no FIRMS name claims are assigned only by evidence: to the country holding at least 20 and at
  least half of the MODIS sample detections inside them (Somaliland → Somalia, Zanzibar → Tanzania,
  Vojvodina → Serbia).
- `diagnostics` records, per region, the units used and the share of its sample detections (MODIS, latest
  year) inside the outline. The median is 0.988; the large fire countries are ≥ 0.99. Lower shares are mostly
  offshore detections (for example North Sea gas flares for the Netherlands, 0.69), which the outline
  excludes as it does for `us`.
- `unavailable`: Saint-Barthélemy and the US Minor Outlying Islands are smaller than one H3 counting cell.
  Antarctica's pole-encircling ring cannot be filled by H3, so its outline keeps only the islands H3 can fill.

## Pipeline

```text
uv run python -m pipeline.run --region portugal              # one country, every stage
uv run python -m pipeline.run --all-regions --world          # us plus every world country (many hours)
```

`--all-regions` without `--world` still means the core regions only. A world region stages its country's
original CSVs, rebuilt from the store, through the same bbox clip, manifest and provenance as `us`. Provenance
binds the stored Parquet source and the staged bytes. Per SD-08, coverage uses the global daily counts. All
`science.yaml` constants apply unchanged (SD-19 amendment, 2026-11-15). World regions are attested per
stage, so adding or regenerating them never changes the publication's shared `configuration_sha256`.

Very small territories may have too few detections for some fits; a stage then fails with its own reason and
publishes nothing.

## Verification (2026-11-15)

- `world_data verify --full`: all 10,095 stored files rebuild their original CSV byte for byte from disk.
  The world `United_States` 2000 MODIS file is byte-identical to the tracked `data/MODIS_data` CSV.
- Full pipeline in isolated `--data-root`/`--web-output-dir` folders (the live `web/public/data/` untouched):
  `portugal` and `fiji` (whose outline crosses ±180°) pass ingest, harmonize, eyesight, stats and export, and
  `pipeline.export --check` passes all 317 checks for each.
- The published `us` site is unchanged: `science.yaml` bytes, the shared `configuration_sha256` and all 631
  `export --check` results are identical.

World countries exposed two contract cases that `us` never reached; both now validate. First, a validation row
with no possible comparison (for example NOAA-20 below `n20_min_detection_days`) keeps `years: []`. Second, a
period whose critical weeks form no window of at least `min_window_share` keeps `windows: []`, and its
definition says so.

Known limits: the existing area-weighted centroid lands mid-ocean for outlines that cross ±180° (Fiji, Russia,
New Zealand; the `us` Aleutians too). It is unchanged so that `us` output does not move. Publishing every country
would take many hours and several GB of web data.
