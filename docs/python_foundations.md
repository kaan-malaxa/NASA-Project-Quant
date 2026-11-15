# Python foundations

Run commands from the repository root:

```text
uv sync
uv run ruff check pipeline
uv run pytest -q
uv run python -m pipeline.run --region us
```

The runner skips absent stage modules, stops on the first failed subprocess,
and exports once after processing the selected regions. With no stage modules,
a successful runner invocation verifies orchestration only.

R3 supplies `pipeline/config/science.yaml`. The shared configuration loader
raises an explicit error until that file exists. Tests inject fabricated
coverage thresholds without creating or changing the project science file.
The seed outage entries are copied from the contract and still need verification.

All file locations are in `pipeline.common.paths`. The sole hotspot source
is the existing US country files under `data/`.
`--data-root` overrides `PROMETHEUS_TORCH_DATA_ROOT` for derived output storage
only; neither setting can redirect hotspot inputs. The runtime region is
`us`; fabricated and synthetic examples are isolated test fixtures.

Parquet schema names are the file stems in `pipeline.common.io.SCHEMAS`,
with `detections` used for every sensor's cleaned detections file.
Writers validate column order, numeric widths, nullability of values and enums,
then write the contracted Arrow schema with zstd compression.
Pandas large strings are normalized to Arrow strings on write. Readers return
Arrow-backed pandas columns to preserve nullable integer widths and date types.
Set `df.attrs["membership"]` to `"polygon"` or `"bbox"` before writing
`region_cells`; the reader restores that attribute.

Time aggregation uses full calendar-bin denominators, including days absent
from the input. Week 52's total is normalized to a seven-day value.
Coverage thresholds are loaded from science configuration. Majority ties use
pandas' sorted mode for deterministic selection. Rolling day-of-year windows
may cross the year boundary and use the weekly covered fraction.

The chosen project folder is currently nested inside the Git repository.
The requested `.github/workflows/pipeline.yml` and `CODEOWNERS` are placed
at the project root; GitHub will discover them only when that folder becomes
the repository root (or those files are placed at the Git root by the team).
The workflow has the requested Ubuntu, Windows and macOS matrix.
Only Windows acceptance checks have been executed locally.

Real source headers inspected before implementation:

- MODIS: `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type`
- S-NPP and JPSS-1 VIIRS: `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type`

These are the United States country files in the sibling `data/` directory.
The local acquisition command stages copies into the contracted raw layout
without modifying originals. Remote acquisition is disabled.

Handoff:
Built: Python configuration, common helpers, strict file IO, runner, tests and CI definition.
Run: execute the commands above from the selected project root.
Reads/writes: reads local US country CSVs and configuration; writes derived outputs through shared path helpers.
Limits: stage modules and R3 science configuration remain to be supplied; CI needs repository-root placement.
Next: obtain science configuration from R3 and implement R2 ingest against inspected region files.
