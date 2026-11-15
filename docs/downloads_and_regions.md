# Local data, regions and download artifacts

The real region is `us`, the approved whole-US polygon including Alaska and Hawaii. `synthland` is the
separate simulator region. Historical observations come from the existing local NASA FIRMS country CSVs
in data/MODIS_data/, data/VIIRS-SNPP_data/ and data/VIIRS-JPSS_data/. Originals are never rewritten.
Filename years, actual headers, sensor identities and observation dates are checked rather than guessed.

`uv run python -m pipeline.ingest.download --region us --via country` verifies and stages those originals.
The full runner stages on first use, then cleans, grids, harmonizes, fits the eyesight model, calculates
statistics and publishes. There are no successful SKIP fallbacks for missing pipeline modules.

The manifest labels original country inputs with their relative source path. Mandatory provenance binds
original and staged bytes, science/configuration, outages and polygon fingerprints. See source_fingerprints.md
and source_fingerprint_reconciliation.json for the historical LF/CRLF reconciliation. Historical inventory
reports remain historical records; current acceptance is in repair_acceptance.md.

Use --data-root / FIREROSETTA_DATA_ROOT for intermediates and --web-output-dir / FIREROSETTA_WEB_DATA_DIR
for the static publication. Scoped exports validate and preserve compatible other published regions without
their intermediates. All outputs are staged and checked first. The manifest is installed last, with rollback
of replaced and removed files if publication fails.

`uv run python -m pipeline.ingest.hotspots_export --region us --local` prepares compressed hotspot archives
and data/exports/hotspot_inventory.json. These are local artifacts; no release URL is invented. External
hosting and final submission links remain human completion items. The existing raw monthly CSV remains a
compatibility download; AOI calculations use authoritative yearly spatial shards instead.

Recent products require genuine NOAA-20 NRT inputs and independent fetched-window/daily coverage metadata.
The supplied historical files do not establish recent coverage. Current products remain unavailable until
those inputs exist; no observations, URLs or API credentials are fabricated.
