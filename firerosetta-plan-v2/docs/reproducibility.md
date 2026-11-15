# Compare outputs across operating systems

Run from the Python project root, `NASA-Project-Quant/firerosetta-plan-v2`. Both people need the same commit, local US source CSVs, science configuration and outage configuration. Complete the integrated pipeline on each computer:

```text
uv sync
uv run python -m pipeline.run --region us
uv run python -m pipeline.ingest.repro_check --region us --output docs/repro_local.json
```

The checker prints the same JSON that it saves. Using `--output` writes UTF-8 directly, including on Windows PowerShell. The report contains no timestamp, elapsed time or absolute machine path. Keep each person's report under a distinct name when exchanging them.

The report lists every website data file, sorted by its relative POSIX path, with its SHA-256 over the original bytes. It also reports the US cell-day Parquet byte hash, row count, integer sum of `n_det`, and sum of `frp_sum` rounded once to a decimal place. The float sum uses `math.fsum` to reduce dependence on row order. `value_sha256` hashes the compact, sorted-key JSON containing those row-count and sum fields. These are whole-file integrity checksums across all stored sensors and passes, not activity measures for the product. Compensating changes can preserve sums; retain the individual file hashes and use the value diagnosis below.

Missing website data or missing cell-day output fails explicitly. An empty website directory also fails. No missing output is represented as a zero-valued result. The current checkout lacks these integrated outputs, so a real cross-machine pass is still pending.

## Find the first difference

If the reports differ, obtain the other person's actual output files. A checksum cannot reveal the original differing value. Place their `web/public/data/` and `data/grid/us/celldays.parquet` under a separate project-root directory, then compare:

```text
uv run python -m pipeline.ingest.repro_check --region us --compare-root "PEER_PROJECT_ROOT" --output docs/repro_comparison.json
```

Replace `PEER_PROJECT_ROOT` with that directory. If the other person's derived data lives elsewhere, add `--compare-data-root "PEER_DATA_DIRECTORY"`. The current computer's `--data-root` or `FIREROSETTA_DATA_ROOT` override remains independent.

The comparison exits successfully when all file hashes and cell-day summary fields match. On a mismatch it exits nonzero and reports the first relative filename in lexical order, the hashes from both sides, the first differing byte offset, and the first decoded value when supported. A missing file is reported as missing. US cell-days participate under the stable logical label `data/grid/us/celldays.parquet`, even when a derived-data directory override is used. A summary discrepancy is also reported if the underlying byte hashes agree.

JSON and GeoJSON comparisons descend through sorted object keys and ordered arrays. CSV comparisons use parsed rows, including the header, then columns. Cell-days are sorted by their contracted columns before comparing row values, so Parquet metadata or row-order differences can be distinguished from data changes. Other supported text files compare decoded lines. Binary files report the first differing byte. Indexes and byte offsets are zero-based. Diagnostic values are strings containing their JSON representation so small floating-point differences remain visible without rounding them away.

Byte differences always fail the comparison, including generated timestamps, code-version fields, line endings or JSON formatting. No fields are ignored. When decoded values match but bytes differ, the report says so and retains the byte offset. The checker reads inputs only and refuses to save its own report inside either website data tree or over a cell-day input.

Exit codes: matching or report-only success is `0`; a comparison difference is `1`; missing, malformed or unreadable inputs are `2`. Keep the reports and diagnosis for the team; a local fabricated test is not a cross-OS validation result.
