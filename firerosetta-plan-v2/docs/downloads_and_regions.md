# Local US data policy

The only runtime region is `us`. The authoritative hotspot inputs are the
existing files in `NASA-Project-Quant/data/`:

- `MODIS_data/modis_<year>_United_States.csv`
- `VIIRS-SNPP_data/viirs-snpp_<year>_United_States.csv`
- `VIIRS-JPSS_data/viirs-jpss1_<year>_United_States.csv`

`pipeline.common.paths.source_data_root()` pins this input directory.
Neither `--data-root` nor `FIREROSETTA_DATA_ROOT` can redirect the inputs.
Those settings control derived output storage only.

No HTTP client, API downloader, country URL fallback, key loading, or remote
availability lookup remains in the acquisition code. `--via api` returns a
clear error before inspecting inputs. Missing local product-years are reported;
they are never fetched, fabricated, or recorded as zero-valued observations.
If none of the requested source files exist, the command fails.

## Run

From `NASA-Project-Quant/firerosetta-plan-v2`:

```text
uv run python -m pipeline.ingest.download --region us --via country --years 2023:2023
uv run python -m pipeline.run --region us
uv run ruff check pipeline
uv run pytest -q
```

An explicit `--years YYYY:YYYY` works without R3's science configuration.
Default analysis years still require that configuration; the program does not
invent scientific record boundaries.

The acquisition command preserves every original file. It clips source text
with DuckDB, including bbox boundary points and zero-padded acquisition times,
and writes derived CSVs under the project's `data/raw/us/`.
Outputs use the `modis`, `viirs_snpp` and `viirs_noaa20` prefixes.

Every run rechecks staged files against the corresponding local original.
Changed or malformed staged files are rebuilt. A cache without an authoritative
local source is never accepted as an input substitute.

The manifest records the relative original path in `source`, alongside the
derived file's hash, rows and acquisition-date bounds. `downloaded_at` records
when the file entered this project's staged dataset, since the original external
download time is unknown. Unchanged validated outputs preserve their manifest
timestamps. Old API/unverified entries are removed from the local-only manifest;
original source files are never deleted.

## Boundaries and tests

`pipeline/config/regions/us.geojson` is local geographic reference metadata,
not a hotspot source. It contains the Natural Earth US states and DC outline.
Puerto Rico is separate in that boundary source; raw FIRMS US files may include
detections there. A later grid stage must apply polygon membership rather than
treating bbox membership as sufficient.

The optional polygon regeneration tool reads local boundary metadata and checks
the configured US country membership. It performs no network request and does
not create hotspot detections.

Runtime configuration no longer exposes `synthland`. Fabricated unit-test
fixtures remain isolated in temporary directories; they are not production
source files. Shared generic path/time/IO helpers remain reusable, and the pure
API-window helper remains only for fabricated tests.

The runner skips packages without a stage `__main__`. Cleaning and gridding
are implemented but require R3's science configuration. Harmonization and
statistics are still pending; SKIP messages do not verify scientific outputs.

`docs/us_source_inventory.json` contains the prior direct inspection of the
real US CSVs. `docs/download_acceptance.txt` captures the latest validation.
`docs/local_us_source_check.json` records hashes for every original US CSV
and the successful real staging checks with network connections blocked.
The source policy supersedes the original regional/API examples; R1/R3 still
need to reconcile their plan documents with the user's US-only direction.

Handoff:
Built: strict local-US source selection and cache verification, with remote acquisition removed.
Run: use the commands above from the project root.
Reads/writes: reads only the designated US hotspot files; writes derived CSVs and provenance manifests.
Limits: no new live observations; analysis stages and R3 science configuration remain pending.
Next: implement cleaning and polygon membership using these local US inputs.
