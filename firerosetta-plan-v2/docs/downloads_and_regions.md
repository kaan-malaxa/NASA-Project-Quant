# Downloads and US region handoff

The user changed this task from the original showcase regions to **the whole
United States**. `pipeline/config/regions.yaml` now contains `us` and the
unchanged synthetic region `synthland`. No science configuration was created.

The official Natural Earth source identifies US admin-1 features with
`iso_a2: US`, `admin: United States of America`, and exact state names in
`name`. The generated outline combines all of those features into one
MultiPolygon feature, including Alaska, Hawaii and the District of Columbia.
Natural Earth assigns Puerto Rico its own `PR` country code; it is outside
this US outline. The raw FIRMS US files do contain detections there, so a later
ingest stage must use polygon membership when counting this region. Bbox
clipping alone does not establish polygon membership.

The US download bbox was computed from the rounded source boundary coordinates,
rather than from hotspot locations. Its large longitude span reflects the
Aleutian Islands crossing the date line.

## Run from the project root

```text
uv run python -m pipeline.ingest.download --region us --via country --years 2023:2023
uv run python -m pipeline.ingest.make_region_polygons --region us --input data/tmp/ne_10m_admin_1_states_provinces.geojson --all-admin1
uv run pytest pipeline/ingest -q
```

The original Punjab smoke test was replaced by the US command after the user's
region change. Local source files are checked first in the corresponding
product folder under the chosen data root, then under the existing sibling
`../data/` directory. Those source directories are `MODIS_data`,
`VIIRS-SNPP_data` and `VIIRS-JPSS_data`. Sources remain unchanged.
If no local source exists, the downloader streams the verified FIRMS country
URL to temporary storage. It clips every country immediately with DuckDB and
deletes the temporary unclipped download.

Outputs live under `data/raw/us/`, with product prefixes `modis`,
`viirs_snpp` and `viirs_noaa20`. Existing outputs are skipped and reconciled
with `MANIFEST.json`. The manifest's acquisition timestamp records when a
file enters this project's raw directory; for local imports, the original
external download time is not known. Unchanged files keep the original
manifest timestamp and digest. Empty clipped files have null first/last dates.

Use `--sources` to select exact country products (`modis`, `viirs-snpp`,
`viirs-jpss1`) or the Area API sources listed in the contracts.
An explicit `--years YYYY:YYYY` works without science configuration.
Default years require R3's science configuration.

For Area API downloads, put `FIRMS_MAP_KEY` in the project `.env` or environment.
The client checks requested sources with E4, requests at most five days at a
time, waits between requests and retries failures. Each source/year output is
assembled from window responses in temporary storage, then published after
validation. Repeating a year replaces that year's output instead of duplicating
rows. Failed windows leave that source/year's previous CSV and manifest intact.
The Area API path has automated fake-response tests; no live authenticated
Area API download was performed.

The polygon tool can also accept `--names` followed by exact admin-1 names.
It lists candidates and stops on any missing or ambiguous name. It never
normalizes spelling or guesses replacements.

The runner skips packages that have no stage `__main__`, so the download
helpers can exist before the cleaning/grid stage is implemented.

## Source inspection and verification

`docs/us_source_inventory.json` was generated directly from all existing US
CSVs with DuckDB. It records file names, byte totals, dates, headers, sensor
values and detection-coordinate ranges. Those ranges are observations about
the input files, not region boundaries.

`docs/download_acceptance.txt` contains captured command output.
Raw downloads and the global Natural Earth cache stay in ignored `data/`.

Verified sources:
- [NASA FIRMS country downloads](https://firms.modaps.eosdis.nasa.gov/country/)
- [Official yearly country-file index](https://firms.modaps.eosdis.nasa.gov/data/country/yearly_summary_files.txt)
- [FIRMS Area API](https://firms.modaps.eosdis.nasa.gov/api/area/)
- [Natural Earth admin-1 source](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson)

## Request for R1/R3 to post in team chat

The user has explicitly selected the whole United States in place of Punjab,
British Columbia and Litoral. Please reconcile contracts section 4.1 and science
decision SD-19 with `pipeline/config/regions.yaml`, and update region-dependent
examples and consumers. R2 has not edited the R1/R3-owned plan documents.
The current US polygon uses Natural Earth's US country membership; Puerto Rico
is separate. The synthetic region remains available for planted-truth tests.

Handoff:
Built: country/API download helpers, exact-name polygon extraction and the US outline.
Run: execute the commands above from the selected project root.
Reads/writes: reads existing country CSVs or FIRMS responses; writes raw CSVs, manifests and the configured outline.
Limits: live API remains untested; clean/grid are pending; team plan documents need the US scope update.
Next: reconcile the team contracts, then implement cleaning and polygon membership using the US files.
