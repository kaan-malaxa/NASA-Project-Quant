# Integration notes · 15 Nov 2026

Branch `integration/all-roles` joins all six roles on top of `main`. This page tells each owner what was changed in their folder and why, and lists what is still open. No number on this page is a result; results are in `web/public/data/` and `web/public/data/numbers_audit.md`.

## What was merged

| Branch | Role | Merged |
|---|---|---|
| `main` (PRs 1–13) | R5 | all of it |
| `r1/contracts-stats-export` | R1 | all 7 commits |
| `r6/visualization` | R6 | both commits |
| `r2/data-delivery` | R2 | all 11 commits |
| `r3/science-config` | R3 | all 3 commits |
| `r4/synth` | R4 | all 5 commits |

Every branch is an ancestor of `integration/all-roles`, so no commit was dropped.

## Decisions taken at integration (scope owner)

1. **One real region, id `us`:** the whole United States, Alaska and Hawaii included. It replaces `conus` (R1, contracts), `united_states` (R3) and `usa` (R4).
2. **`synthland` is a configured region again**, marked `synthetic: true`. R2 and R3 had each limited the pipeline to a single real region, which made the planted-truth run (M7) impossible.
3. **Layout:** everything that was under `firerosetta-plan-v2/` is now at the repo root, as `01_ARCHITECTURE.md` §4 describes. Run every command from the repo root.
4. **`data/`:** the three raw FIRMS folders stay tracked. Everything else under `data/` is pipeline output and is git-ignored.

## How to run

```text
uv sync
uv run python -m pipeline.run --region synthland     # simulate, ingest, harmonize, eyesight, stats, export
uv run python -m pipeline.run --region us            # the same on the real CSVs under data/
uv run python -m pipeline.export --check             # every web file against contracts/
uv run pytest -q
cd web && npm ci && npm run test && npm run build && npx playwright test
```

## What changed in each owner's folder

### R2 · `pipeline/common/`, `pipeline/config/`, `pipeline/ingest/`, `pipeline/run.py`, root files
- `regions.yaml` lists `us` and `synthland`. `config.load_regions()` accepts exactly one real region plus simulated ones; `config.real_region()` is new.
- `paths.source_data_root()` is `data/` at the repo root (it was one level above the old project folder).
- `io` gained `read_json`, `sha256` and `write_figure` (harmonize calls them). `write_parquet` accepts same-kind numeric widths through a checked cast. `naive_annual` counts may be null for a year a sensor did not cover.
- **Bug fixed in `ingest/clean.py`:** `h3_r5` was taken from the detection's coordinates. H3 cells do not nest exactly, so some cell-days were split across two rows and counted twice. `h3_r5` is now the parent of `h3_r6`. A regression test covers it.
- `ingest` cleans a simulated region from its simulator manifest, and stages the local US CSVs on a first run instead of stopping.
- `run.py` passes `--synth-size` to the simulator, default `full` (the size the planted-truth test is defined on).
- `pyproject.toml`: pytest uses `--import-mode=importlib`, because several stages have test files with the same name.
- `.gitignore`, `.gitattributes`: derived data, `.claude/`, caches; raw CSVs are not line-ending normalised.

### R3 · `pipeline/harmonize/`, `science.yaml`
- `scope` is `{region_id: us, country: US, planted_truth_region_ids: [synthland]}`.
- `calibration.json` now carries `generated_at` and `code_version` (the contract requires them) and is validated with the contract schemas' cross-references resolved.
- Removed: `pipeline/ingest/us.py`, its test, and `pipeline/common/tests/test_common.py`. They were a stand-in ingest and tests for a stand-in copy of `pipeline/common/`; R2's ingest and library replace them. They remain in the `r3/science-config` history.
- `test_us_planted_truth` skips: it expects a planted-truth file for the real US region, which cannot exist. The planted-truth check runs on `synthland` through `methods.json → planted_truth`.

### R4 · `pipeline/synth/`, `pipeline/eyesight/`
- Stage timers use the clock the shared logger subtracts from (the final line printed a negative duration).
- Committed `__pycache__` files and the outputs under `data/raw`, `data/grid`, `data/eyesight` are no longer tracked. The pipeline rebuilds them.
- The Alaska/Hawaii guard in `eyesight/stage.py` is tied to the id `usa` and does not fire for `us`, which includes both states by decision 1.

### R1 · `contracts/`, `pipeline/stats/`, `pipeline/export/`, `web/public/data/`, `plan/`
- Region id `us` in the contract text, examples and tests. The sample generator keeps its own fixed region record and its original random-stream key, so sample numbers are unchanged.
- `pipeline.export` accepts `--data-root`, `--pass` and `--log-level`, which `pipeline.run` passes to every stage.
- `web/public/data/` holds real output for `us` and `synthland`. The sample `conus/` folder is gone and `manifest.json → contains_sample` is false.

### R5 · `web/`
- The site validates with `contracts/*.schema.json` instead of the temporary copies in `src/data/schemas-temp/` (only `outline.schema.json` remains there, because the contracts have no schema for it). Test fixtures were made contract-valid.
- "This week" and the Season Brief omit the as-of line when `nowcast.as_of` is null.
- `GalleryScreen` no longer repeats the heading R6's gallery renders. The Methods test expects R6's real chart.

### R6 · `web/src/viz/`, `design/`
- `CalendarHeatmap` and `FireYearClock` use `role="img"` when they have no data. They kept `role="grid"` with no rows, which axe reports as critical.

## Answers to R5's questions for R1
- `nowcast.month_to_date.value` and `.median` are Aqua-equivalent fire cell-days: the coverage-scaled sum (SD-08) from the first of the month through `through_day`; `median` is the same span in each baseline year. `ratio` is value ÷ median and has no unit.
- `trend.json → annual[].kind` is the majority kind of that year's covered days (`observed`, `harmonized`), or `missing` when the year does not meet the coverage rule.

## Still open

| Item | Owner | Note |
|---|---|---|
| Near-real-time input | R2 | No NOAA-20 NRT file is under `data/`, so `nowcast.json` has status `unavailable` and `hotspots_recent.csv` is absent. The raw record ends on 2025-12-31. |
| `methods.json → sources` is empty | R2, R3 | Every entry in `docs/methods_sources_draft.yaml` is still marked UNVERIFIED. A person has to open each URL before it may be listed. |
| Numbers audit sign-off | R3 | `numbers_audit.md` is regenerated from the real files; it is not signed. |
| Tier 2 status on `us` | R4 | The curve is `exploratory`: it fails one SD-17 condition. Reported as is. |
| Hotspot archives (`downloads.json`) | R2 | Not produced. |
| README, slides, video, submission text | R2 | Written before integration; numbers are still placeholders. |
| `CODEOWNERS` | R2 | Still has placeholder handles. |
| Size of `us/cells_monthly.csv` and `us/outline.geojson` | R1, R2 | Large for a phone connection. They load, but simplifying the outline would help. |
| Cross-OS reproducibility check | R2 + one other | Not run. |
