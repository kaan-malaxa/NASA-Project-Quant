# Grid-step handoff

The ingest entry point defaults to `clean,grid`. Use `--steps grid` to
regenerate grid/coverage from existing cleaning outputs, or `--steps clean`
to run cleaning alone.

Implemented:
- SD-18: sum static candidate counts, select seeds using science configuration,
  dilate with H3 grid_disk, save the mask, rewrite each sensor's cleaned file
  removing only masked rows with null type, and record the mask filter.
- SD-04: region cells from polygon-centre membership, with bbox fallback and
  membership metadata; H3 parents and cell-centre coordinates.
- Sensor-specific cell-days with detection count, summed/max radiative power,
  and daily hotspot counts across both passes. Sensors remain separate.
- SD-08: coverage based only on this region's own raw UTC-date counts, bounded
  by the configured record start and latest cleaned local day. S-NPP uses its
  configured fixed first day. Outages include both endpoints and open-ended
  intervals. Missing raw rows never become covered zero activity.

The grid step uses common.io for every contracted Parquet file, including
empty tables. Filter-log updates preserve the original drop counts on repeated
grid runs rather than appending duplicate mask entries. Original country CSVs
are never written. If the mask definition changes, rerun clean,grid so rows
previously removed by the old mask can be reconstructed from original inputs.

Fabricated tests exercise two pixels in one cell-day, null-only masking,
threshold and neighbour dilation, raw-count gaps and date bounds, outages,
fixed S-NPP start, absent sensors, excluded region rows, membership metadata,
schema round trips, rewritten detections, repeat-run behavior and CLI ordering.

Current real-run limitations:
- R3's science.yaml is still absent. No scientific constants were substituted
  and no science configuration was created.
- The runtime configuration is US-only, so the requested synthland command
  reports an unknown region. Synthetic validation remains in isolated tests.
- No successful real clean/grid outputs exist. The B3 processed-data profile
  cannot yet be generated or posted; no profile measurements have been invented.
  After R3 provides configuration and real acceptance succeeds, produce the
  sensor/year counts, sensor date bounds, NRT shares, uncovered-day reasons,
  region-cell count, NOAA-20 qualification diagnostic, Aqua peak week and sizes.
- The seed outages remain unverified external facts copied from the contract.

See grid_acceptance.txt for the actual commands, output and exit codes.

Handoff:
Built: static masking, region grids, cell-day/daily aggregation and per-sensor coverage.
Run: uv run python -m pipeline.ingest --region us after R3 supplies science.yaml.
Reads/writes: cleaned US detections/candidates/raw counts to rewritten detections, mask, grid, coverage and filter log.
Limits: real runs and the B3 profile remain blocked by missing science configuration; synthland is not configured.
Next: supply R3 configuration, rerun acceptance, then generate the real B3 profile.
