# Local-only nowcast handoff

Run from the project root:

```text
uv run pytest pipeline/ingest -q
uv run python -m pipeline.ingest.nowcast_fetch --region us --days 31
```

The command searches only local `nrt_viirs_noaa20_*.csv` files beneath the
designated source directory `data/` and staged
`data/raw/us/`. Paths resolving outside their allowed directories are rejected.
No HTTP/API client, MAP_KEY reader or remote fetch is used.

A filename or absent type column cannot by itself authenticate NRT provenance.
Every source row must have an explicit NRT marker in its version and normalize
to NOAA-20. Historical SP country CSVs are never substituted or relabeled.
This intentionally stops for a source whose NRT identity cannot be confirmed;
it does not guess a new source convention.

The window contains the requested number of complete local days, ending
yesterday at the region centroid's solar date. Each requested local day must
have valid unfiltered raw observations within the download bbox. A declared
NOAA-20 outage intersecting the window also blocks publication. Missing
coverage is not filled with zeros. Confidence and static-mask filtering can
subsequently leave a genuinely covered day without retained detections.

Only after coverage succeeds does the command load R3's science configuration
and the existing static mask. It reuses clean.clean_files with publication
disabled, then static_mask.apply_mask and grid.aggregate_detections.
Historical detections, raw counts and filter logs are not overwritten.
The recent CSV retains cleaned, in-region observations from both passes; the
cell-day file keeps daynight so downstream statistics can select the daytime pass.

All output validation occurs in temporary storage. The raw NRT snapshot,
contracted NRT Parquet, exact-header recent CSV and manifest are published with
backups and rollback on replacement errors. The fetched_at timestamp is the
UTC local-refresh time, stored without a timezone as required by the contract.
The manifest labels actual local NRT input as source VIIRS_NOAA20_NRT and via
local. Historical staging preserves validated NRT entries, while historical
cleaning ignores NRT snapshots instead of treating them as country inputs.

Tests use fabricated local files and an injectable local-file loader. The
HTTP-shaped failure test injects an exception; it does not make a network call.
There is deliberately no API retry loop because new remote hotspot acquisition
is prohibited. All source/load/validation failures leave previous outputs intact.
Publication rollback is tested separately.

Actual local-data availability and acceptance output are recorded in
nowcast_acceptance.txt. The current source inventory contains no genuine local
NRT inputs, so no recent-data output was fabricated.

Operational handoff:
- Repeat the command at 07:15 and 18:00 America/New_York when genuine local NRT inputs become available.
- No timed jobs have been registered. A general scheduler and dated notification
  destination were not configured in this session.
- R1 status to relay: current recent US NOAA-20 NRT coverage is unavailable;
  the command exits nonzero and preserves previous files.
- R1 owns committing web/public/data; no generated web data is included in this code commit.

Handoff:
Built: local-only NRT validation, cleaning/masking, recent exports and failure rollback.
Run: use the commands above; no API key is read.
Reads/writes: genuine local NRT CSVs to staged raw data, NRT cell-days, recent hotspot CSV and manifest.
Limits: no current genuine NRT inputs; successful real export also needs science.yaml and static_mask.parquet.
Next: supply genuine recent inputs, run the checks at the operational times, and relay coverage status to R1.
