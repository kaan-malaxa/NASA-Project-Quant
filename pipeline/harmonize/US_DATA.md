The production pipeline uses only the local NASA FIRMS United States exports
under workspace-root `data/MODIS_data/`, `data/VIIRS-SNPP_data/`, and
`data/VIIRS-JPSS_data/`. It performs no downloads and rejects other region ids.

From `firerosetta-plan-v2/`:

```text
uv sync
uv run python -m pipeline.run --region united_states
uv run pytest pipeline -q
```

Ingestion creates the US cell-days, coverage and hotspot-count tables, plus
source and output hashes. Harmonization verifies these hashes before reading
the tables. A changed source, config or derived input requires rerunning ingest.
`--data-root` and `FIREROSETTA_DATA_ROOT` move derived outputs only; they never
redirect the raw US source files.

Results are in workspace-root `data/harmonized/united_states/`. Unit tests use
explicit fabricated tables; their values are never substituted for real US
inputs. The supplied country exports do not include a polygon, centroid or
planted truth. Country-file membership is retained without inventing those
missing inputs. A US polygon is still needed for a full-region cell denominator
and the V5 saturation diagnostic. Calendar availability comes from the files,
so no current-year detections or missing days are invented.
