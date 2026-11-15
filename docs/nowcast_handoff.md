# Recent-data handoff

Run `uv run python -m pipeline.ingest.nowcast_fetch --region us --days 31` only when genuine local
NOAA-20 NRT files exist. Every row must authenticate that source using its actual satellite/version fields.
Historical science-quality country files are never relabelled as recent observations.

Optional independent input coverage is data/raw/us/nrt_input_coverage.json. It names VIIRS_NOAA20_NRT,
the fetched clock, and each requested local day as covered or missing with a reason. The fetch stage
persists data/grid/us/nrt_coverage.json independently of retained detections. Without explicit metadata,
the conservative raw-day validation is retained. A covered day may legitimately retain zero detections
after confidence, polygon or static-source filtering. A missing day stays null.

Ingestion and statistics share last_complete_local_day, checking both the centroid and western edge.
Statistics use the persisted clock, not the computer's current time. Missing NOAA-20 calibration produces
unavailable values. Weekly history uses the same day-of-year window, clamping a leap-year endpoint in a
shorter comparison year. Month-to-date history uses calendar month spans, clamping February's last day.

All fetch outputs are staged and validated, with backups and rollback on publication failure. The recent
CSV preserves its contracted header. Statistics label actual source, coverage, comparison years and input
clock. Current supplied observations do not contain genuine recent inputs, so the published recent cards
remain explicitly unavailable. See repair_acceptance.md for regression evidence.

The recent CSV is staged privately at `data/grid/us/hotspots_recent.csv`. Ingestion verifies the grid,
attests NRT source files, mask, coverage, manifest entries and outputs as the `nowcast` stage, and does not
write the live website. Statistics require that attestation and carry the CSV into the complete regional
export. Historical provenance compares the historical manifest entries separately, so adding NRT entries
does not invalidate unchanged history. Existing verified historical stamps are migrated during refresh.
Empty retained tables, including a header-only source with independent covered-day metadata, preserve
covered zero activity. Non-boolean coverage flags are rejected rather than treated as truthy values.
