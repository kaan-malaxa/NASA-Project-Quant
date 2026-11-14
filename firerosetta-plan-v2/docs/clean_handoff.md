# Clean-step handoff

Implemented `pipeline.ingest.clean` and the `python -m pipeline.ingest --steps clean` entry point.
Runtime cleaning loads scientific constants exclusively from R3's science configuration.
It revalidates staged US inputs against the original local country CSVs before consuming them.
No source observations are modified or fetched from the network.

The cleaner reads CSVs with DuckDB as varchar, casts fields explicitly, normalizes sensor/confidence aliases,
and logs coordinate/date, duplicate, bbox, type and confidence filters in that order.
Duplicate keys span all staged input files. Raw UTC-date counts include duplicate and rejected rows.
It computes solar dates through common.timebins and H3 indexes from the configured resolutions.
Polygon membership uses H3 cell centres; bbox geometry is the fallback when no polygon exists.
Null types remain null for later static masking. Static SP candidates are saved before the type filter
so the future grid step can build its mask without losing those rows.

Contracted detection outputs are written for each supported sensor, including typed empty tables,
using common.io. Raw counts and static candidates use their contracted schemas.
Temporary normalized Parquet files let DuckDB gather individual sensors rather than concatenating
all source files in Python. DuckDB has a memory limit and a spill directory under the configured data root.

Fabricated tests cover the requested CSV pair, unknown satellites, absent type,
NRT version/prefix classification, cross-file duplicates, invalid times, raw counts,
empty outputs, static candidates, bbox H3 membership and the CLI.
These fixtures are isolated from real observations.

The real US source inspection found the expected MODIS and VIIRS headers.
MODIS satellite values were Aqua/Terra, instrument MODIS, version 61.03, and confidence every integer
from 0 through 100. VIIRS values were N/N20, instrument VIIRS, version 2, and confidence h/l/n.
Both products had D/N passes and types 0/1/2/3. The inspected files covered the complete requested
calendar year. The original source files were preserved.

Current acceptance limitations:
- R3's `pipeline/config/science.yaml` is absent. The US clean command stops with a clear error.
  No real cleaning result, elapsed successful run, or real filter_log.json is claimed.
- Runtime configuration contains only us. The synthland acceptance command reports an unknown region.
  Synthetic/fabricated validation remains isolated in tests; no synthetic inputs were substituted for US observations.
- Grid/static-mask application is a future step; rows with null type are not yet masked.
- Adding the ingest entry point means the all-stage runner now attempts cleaning rather than skipping ingest.
  Until science configuration exists, that runner correctly fails at ingest.

Actual acceptance command output is in `docs/clean_acceptance.txt`.
No science configuration, dependency, source CSV, or R1/R3/R4-owned file was created or edited.

Handoff:
Built: cleaning implementation, ingest CLI and fabricated-input tests.
Run: uv run python -m pipeline.ingest --region us --steps clean after R3 supplies science.yaml.
Reads/writes: verified staged local US CSVs to contracted detection Parquet, raw counts, static candidates and filter log.
Limits: real acceptance blocked by absent science configuration and absent synthland setup.
Next: obtain R3's configuration, then rerun acceptance and inspect the generated filter log.
