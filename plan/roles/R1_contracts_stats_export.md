# R1 · Contracts, Calendar Statistics, Export (and scope owner)

> Current integration scope: one real whole-US polygon plus planted-truth Synthland; runtime web code is JavaScript with generated JSDoc declarations. Selectable analysis years and exact dates are separate. The authorized interfaces and requirement statuses are in `../02_CONTRACTS.md` and `../REQUIREMENTS_MATRIX.md`. Earlier multi-region, TypeScript-runtime and provisional stand-in instructions are superseded.


## 1. Your mission
You turn the harmonized daily series into **every number the website shows**: the calendar, the climatology, the trend verdict, the critical weeks, this week's status, the Methods data. You also own the **contracts** (the JSON Schemas everyone builds against) and the **sample data** that lets the web team start in hour two. As scope owner you call the cuts at each gate.

You are on the critical path twice: at Gate A (schemas + sample data unblock R5 and R6) and at Gate C (real JSON turns the site real).

## 2. You own / you never touch
- **Own:** `contracts/`, `pipeline/stats/`, `pipeline/export/`, `web/public/data/` (generated; only you commit here; R2's nowcast fetch drops `hotspots_recent.csv` into it and tells you), `plan/` (except `03_SCIENCE_DECISIONS.md`).
- **Never touch:** anything else. `pipeline/common/` is R2's; ask R2 for helpers.

## 3. Inputs and outputs
| You read | From | Contract |
|---|---|---|
| `data/harmonized/{region}/daily.parquet`, `annual_bootstrap.parquet`, `calibration.json`, `validation_t1.json`, `naive_annual.parquet` | R3 | §5.8–5.11 |
| `data/eyesight/{region}/curve.json`, `daily_t2.parquet`, `validation_t2.json` (may be absent) | R4 | §5.12–5.14 |
| `data/grid/{region}/celldays.parquet`, `coverage.parquet`, `region_cells.parquet`, `celldays_nrt.parquet` | R2 | §5.2, 5.3, 5.5, 5.7 |
| `data/raw/{region}/MANIFEST.json`, `data/clean/{region}/filter_log.json`, `data/raw/synthland/truth.json` | R2, R4 | §5.15–5.17 |
| `pipeline/config/science.yaml`, `regions.yaml`; `pipeline/common/timebins.py` | R3, R2 | §4 |

| You write | For | Contract |
|---|---|---|
| `contracts/*.schema.json`, `contracts/examples/` | everyone | §6 |
| `web/public/data/regions.json`, `methods.json`, `manifest.json` | R5, R6 | §6.1, 6.13, 6.14 |
| `web/public/data/{region}/weekly, monthly, daily, climatology, season, trend, ruler, nowcast, hex, calibration .json`, `outline.geojson`, `cells_monthly.csv` | R5, R6 | §6.2–6.12 |

Commands you provide: `python -m pipeline.stats --region R`, `python -m pipeline.export [--sample] [--check]` (§3 of the contracts).

## 4. What the other five are doing
| Role | Doing | Touches you how |
|---|---|---|
| R2 | Downloads FIRMS files, cleans, grids, computes coverage; later README, video, submission | Gives you `celldays`, `coverage`, `region_cells`, NRT cell-days, `timebins.py`. Needs your headline-number list for the video (prompt E1). |
| R3 | Fits Tier 1 k, builds `daily.parquet`, runs validation; signs off numbers | Your main input. Their `validation_t1.json` goes into your `methods.json` unchanged. |
| R4 | Builds the simulator (`synthland`) and the eyesight curve | `truth.json` is your planted-truth check; `daily_t2` feeds the `viirs_equiv` lens if validated. |
| R5 | Web shell, data loading, screens, downloads | Reads every file you write. Generates TypeScript types from your schemas. |
| R6 | Charts and design tokens | Builds charts against your sample data from hour two. |

## 5. Tools
Python 3.11 via `uv`, DuckDB, pandas, numpy, scipy (`scipy.stats.theilslopes`), `jsonschema`, pytest, ruff. Optional: DuckDB CLI or a DuckDB MCP server to inspect Parquet.

## 6. Your timeline
| Gate | You deliver |
|---|---|
| A · Sat 18:30 | All JSON Schemas; `export --sample` writes a complete, plausible sample site for `us`; `export --check` works; **contracts frozen** |
| B · Sat 23:00 | `pipeline.stats` produces weekly, monthly, daily, climatology, trend, ruler, season (critical weeks) from a real or simulated `daily.parquet`; planted trend and season recovered on `synthland` |
| C · Sun 10:00 | Nowcast; `methods.json` with real validation; real JSON for the approved whole-US region and separate simulator committed; SAMPLE gone |
| D · Sun 14:00 | Season shift, hex, `cells_monthly.csv`, Tier 2 selection (SD-17) |
| E · Sun 17:00 | Numbers audit list for R2 and R3; final regeneration; manifest hashes match on a second OS |

## 7. Session primer (paste at the start of every AI session)
```text
You are assisting R1 on the FireRosetta project. Before doing anything, read these files fully:
- AGENTS.md
- plan/02_CONTRACTS.md (all of it; I own section 6 and the export/stats commands in section 3)
- plan/03_SCIENCE_DECISIONS.md (sections C, D, E, G and H matter most to me)
- plan/roles/R1_contracts_stats_export.md

I own only: contracts/, pipeline/stats/, pipeline/export/, web/public/data/, plan/. Never edit files elsewhere.
All scientific constants come from pipeline/config/science.yaml. All time binning goes through pipeline/common/timebins.py.
Reply first with a three-line restatement of the task and the list of files you will create or change. Then do the work,
run the acceptance commands, and paste their real output. Finish with a five-line handoff note.
```

## 8. Prompts

### A1 · JSON Schemas and the checker (start 16:30, 45 min)
```text
Task: create the JSON Schemas for every website data file and a checker.

Create contracts/<name>.schema.json (JSON Schema draft 2020-12) for: regions, weekly, monthly, daily, climatology, season,
trend, ruler, nowcast, hex, calibration, downloads, methods, manifest. Follow plan/02_CONTRACTS.md section 6 exactly:
same field names, enums from section 9, "additionalProperties": false on every object, value/lo/hi nullable where the
contract says missing is null, required fields required. Put shared definitions (kind, sensor, status, direction,
ValidationRow, the three header fields) in contracts/common.schema.json and $ref them.

Create pipeline/export/check.py and wire `python -m pipeline.export --check`:
- validates every file under web/public/data against its schema (map by file name),
- also checks: cells_monthly.csv and hotspots_recent.csv headers match section 6.12; every region listed in regions.json
  has each file named in its "files" list; no NaN or Infinity anywhere; any row with kind "sample" implies
  manifest.contains_sample is true,
- prints one line per file (OK/FAIL + reason) and exits non-zero on any failure.

Also copy the JSON examples from section 6 into contracts/examples/ as valid minimal files and add a pytest that
validates each example against its schema.

Acceptance:
  uv run pytest pipeline/export -q
  uv run ruff check pipeline/export
```

### A2 · Sample data generator (45 min, must be merged by 18:15)
```text
Task: implement `python -m pipeline.export --sample`, which writes a complete, realistic-looking sample site into
web/public/data for region us, so the web team can build every screen today.

Requirements:
- Every file of section 6 (including optional ones: outline.geojson as the bbox rectangle, cells_monthly.csv,
  hotspots_recent.csv, downloads.json with two fake entries pointing at "#").
- Every data row has kind "sample"; code_version is "sample"; manifest.contains_sample is true.
- Shapes must look like the real thing so charts can be designed against them:
  us: a spring burning season (peak week 14) and a larger summer-autumn wildfire season (peak week 33) whose
  timing moves earlier, and one extreme year (2020).
  Add year-to-year noise from a seeded generator (seed 7). viirs_raw exists only from 2012 and is about 2.5x aqua_raw.
  Include at least: 3 missing weeks in harmonized (value null), the estimated viirs_equiv band for 2003-2011 with lo < value < hi,
  a harmonized era switch at 2023 and 2026 (kind_runs), nowcast status "above_normal".
- trend.json: give us sentence_id "artifact_flat", with sentences built from the
  SD-15 templates (implement the template function now in pipeline/stats/sentences.py; the sample generator calls it).
- methods.json: 10 curve points, 6 binned points, drift 2013-2025 with a visible departure after 2022,
  planted_truth with 6 rows, at least 8 validation rows, 3 sources, 3 limitations.
- Deterministic: running twice produces identical bytes.

Acceptance:
  uv run python -m pipeline.export --sample
  uv run python -m pipeline.export --check        # every line OK
  uv run pytest pipeline/export -q                # include a test that runs --sample twice into tmp dirs and compares hashes
Then remind me to commit web/public/data manually(DO NOT COMMIT YOURSELF) and tell R5 and R6 the sample data is on main.
```

### B1 · Calendar core: weekly, monthly, daily, climatology (start 18:30)
```text
Task: implement the first half of `python -m pipeline.stats --region R`.

Read data/harmonized/R/daily.parquet (schema: contracts section 5.8) and write weekly.json, monthly.json, daily.json and
climatology.json for the region (sections 6.2 to 6.5), using pipeline/common/timebins.py for all week/month/year
aggregation and coverage scaling (SD-08). Do not re-implement binning.

Details:
- Series mapping from daily.parquet to the web: aqua_raw, viirs_raw, viirs_as_aqua, harmonized pass through;
  viirs_equiv = viirs_equiv_t1 for now (series_meta.viirs_equiv.method = "tier1").
- A weekly/monthly row takes kind "missing" with value null when timebins says so; otherwise the kind of the majority of
  its covered days (ties: harmonized over observed). lo/hi aggregate the same way as value.
- Climatology per SD-10: baseline years from science.yaml, quantiles by numpy linear interpolation over non-missing years,
  then a 3-week circular moving average on each weekly curve; months unsmoothed; n_years recorded.
- daily.json is columnar (section 6.4) with kind_runs compressed from consecutive days of equal kind and source.
- Round to 3 decimals, sort keys, write UTF-8 with a trailing newline.

Tests (pipeline/stats/tests, fabricated daily tables, no other stage needed):
- constant 2.0 cell-days every covered day -> every weekly value 14.0, including week 52 and leap years;
- a week with 3 uncovered days -> missing; with 2 uncovered -> scaled by 7/5;
- climatology of 23 identical years equals that year; smoothing is circular (week 52 uses week 1);
- kind_runs reproduce the per-day kinds exactly.

Acceptance:
  uv run pytest pipeline/stats -q
  uv run python -m pipeline.stats --region synthland   # once R3's daily.parquet for synthland exists; until then run the
                                                       # tests and a fabricated daily.parquet written by a test helper
  uv run python -m pipeline.export --check
```

### B2 · Trend, naive record, broken ruler, verdict sentence
```text
Task: add trend.json and ruler.json to pipeline.stats (contracts 6.7, 6.8; science SD-09, SD-14, SD-15).

- Annual harmonized totals via timebins (coverage-scaled, missing if <90% covered).
- Theil-Sen slope with scipy.stats.theilslopes on 2003-2025; pct_per_decade = 100*10*slope/median(annual).
- Range: 1000 replicates (seed from science.yaml or 7). Each replicate resamples years with replacement and, for years
  after aqua_trusted_through, takes that year's value from a random replicate in annual_bootstrap.parquet. 5th/95th pct.
- Naive: same method on naive annual counts built from naive_annual.parquet (modis_count through 2011, snpp_count
  2012-2025, each divided by its covered fraction).
- Robustness variants "aqua_only_2003_2022" and "translated_from_2012" computed from daily.parquet series
  (aqua_raw; aqua_raw through 2011 + viirs_as_aqua from 2012).
- direction per SD-14. sentence_id and sentence per the SD-15 table in pipeline/stats/sentences.py; if the variants
  disagree in direction with the primary, force sentence_id "unclear". Numbers in sentences are rounded to whole percent.
- ruler.json: indices = each annual line divided by its own 2003-2011 mean; jump_multiple per SD-09 with lo/hi = min/max
  of yearly ratios over 2013-2022; sentence: "In {region}, VIIRS reports about {J} times as many hotspots as MODIS for
  the same years. Spliced naively, the record jumps in 2012; harmonized, it does not."

Tests on fabricated data:
- planted +20%/decade linear trend, no noise -> pct_per_decade within 1 point, direction rising;
- flat series with noise -> no_clear_change;
- naive = harmonized before 2012 and 3x after -> naive rising, sentence_id artifact_flat, jump_multiple 3.0;
- every branch of the sentence table is reachable and contains no unformatted braces.

Acceptance:
  uv run pytest pipeline/stats -q
  uv run python -m pipeline.export --check
```

### B3 · Critical weeks (Must) and season windows
```text
Task: add season.json (contracts 6.6; science SD-13).

Step 1 (Must, finish tonight): critical_weeks and windows (start_week, peak_week, end_week, share, label) from the
smoothed weekly p50 in the climatology. Windows are circular runs; merge one-week gaps; keep at most two with share >= 0.15.
Label windows in plain words from their start/end dates ("mid-October to mid-November").
Step 2 (Should, do in Phase D if time): by_year timing and shift_days_per_decade with Theil-Sen and a 1000-resample
bootstrap, plus a sentence: "The {label} season now starts about {n} days {earlier|later} per decade ({lo} to {hi})."
or, when the range includes 0, "No clear shift in the timing of the {label} season."
Until step 2 is done write by_year as [] and the shift values as null with sentence "".

Tests: a single-peak fabricated climatology -> one window centred on the peak; a two-peak one (70/30) -> two windows
ordered by share; a season wrapping the year end -> one window, start_week > end_week; a planted shift of -5 days per
decade in by_year timing is recovered within 1.5 days.

Acceptance:
  uv run pytest pipeline/stats -q
  uv run python -m pipeline.export --check
```

### C1 · This week and this month (start Sun 07:00)
```text
Task: add nowcast.json (contracts 6.9; science SD-11, SD-12).

Inputs: data/grid/R/celldays_nrt.parquet (NOAA-20 NRT, daytime), calibration.json (k for noaa20 by month),
daily.parquet (harmonized history), coverage.parquet, regions.yaml (centroid).
- Window = last 7 complete local days ending yesterday at the centroid's solar time, but never later than the last
  local day fully present in the NRT file. Record window.start, window.end, days_covered.
- value = sum over the window of (NRT fire cell-days that day x k_noaa20 of that day's month); lo/hi with k lo/hi.
- history = same day-of-year window in each baseline year from harmonized daily values, coverage-scaled;
  years with <5 covered days are skipped.
- percentile and status exactly per SD-11 (first match wins), including low_activity and unavailable.
- month_to_date: harmonized total for the current month through window.end vs the median of the same span in baseline years.
- sentence templates: normal / above_normal / extreme / below_normal: "In the 7 days to {end}, {region} had {value}
  Aqua-equivalent fire cell-days: higher than {percentile}% of the same week in {n} past years."; low_activity:
  "Too little burning at this time of year in {region} to rank this week."; unavailable: "No recent satellite data."
- as_of = the fetched_at of the NRT file (UTC).

Tests: fabricated history where the current value exceeds 22 of 23 years -> percentile 95.7 -> extreme; ties handled;
all-zero history and value 2 -> low_activity; empty NRT -> unavailable with value null.

Acceptance:
  uv run pytest pipeline/stats -q
  uv run python -m pipeline.stats --region us && uv run python -m pipeline.export --check
```

### C2 · Assemble regions.json, methods.json, manifest; go real
```text
Task: implement `python -m pipeline.export` (no flags) in pipeline/export/assemble.py.

- regions.json from regions.yaml plus n_cells_r6 and membership from region_cells.parquet, last_data_day from daily.parquet,
  and "files"/"optional_files" from what actually exists in web/public/data/<region>/. Synthetic regions keep synthetic true.
- methods.json: decisions from science.yaml (with its sha256); validation = concatenation of every region's
  validation_t1.json and validation_t2.json rows, unchanged; drift from validation_t1.json; eyesight from each
  curve.json or {"status":"absent"}; planted_truth by comparing synthland outputs with data/raw/synthland/truth.json
  using the tolerances in truth.json; inputs from MANIFEST.json files; filters from filter_log.json;
  sources/limitations/ai_use read from pipeline/export/methods_text.yaml (create it; R2 and R3 will send you entries).
- manifest.json with sha256, bytes and the set of kinds per file; contains_sample true if any file has kind "sample".
- Copy calibration.json from data/harmonized/<region>/ into the web folder after schema validation.
- Refuse to run (non-zero exit, clear message) if a real region still contains sample files mixed with real ones.

Then run the real thing:
  uv run python -m pipeline.run --all-regions --from stats
  uv run python -m pipeline.export --check
Commit web/public/data. Tell the team the site is on real data.

Tests: assemble on a temp tree made by --sample plus one fabricated real region; mixed sample/real is rejected.
```

### D1 · Where it burns: hex.json, outline, cells_monthly.csv (Should)
```text
Task: add pipeline/stats/spatial.py (contracts 6.10, 6.12).

- hex.json: from celldays.parquet, sensor snpp, daytime, years 2013-2025: for each res-5 parent, mean yearly count of
  res-6 fire cell-days during season.critical_weeks ("critical") and over the whole year ("all_year").
- outline.geojson: copy the region polygon from regions.yaml (FeatureCollection, one feature); bbox rectangle if null.
- cells_monthly.csv: h3_r5, ym, aqua, viirs (primary VIIRS per SD-05: snpp through 2025-12, noaa20 after), daytime,
  rows with both zero omitted.
- Add "cells_monthly" to the region's optional_files.

Cross-check test (the most important one): summing cells_monthly over all cells and applying the eras and monthly k
from calibration.json must reproduce monthly.json "harmonized" for every fully covered month within 0.5%.
Write this test against synthland outputs and against a fabricated mini-region.

Acceptance:
  uv run pytest pipeline/stats -q && uv run python -m pipeline.export --check
```

### D2 · Tier 2 selection and the viirs_equiv lens
```text
Task: apply SD-17. If data/eyesight/R/curve.json exists with status "validated", build the web series viirs_equiv from
daily_t2.parquet series viirs_equiv_t2 and set series_meta.viirs_equiv.method "tier2"; otherwise keep tier1.
Never use Tier 2 for trend.json. Put curve.json into methods.json eyesight unchanged, including k_compare.
Add a test for both branches. Re-run stats and export for all regions and run --check.
```

### E1 · Numbers audit list (by Sun 16:00)
```text
Task: create `python -m pipeline.export.audit`, which prints and writes web/public/data/numbers_audit.md
(public on purpose, linked from the Methods page) listing every headline number with its JSON path: per region jump_multiple, harmonized and
naive pct_per_decade with ranges and sentence, critical windows, nowcast value/percentile/status/as_of, LOYO WAPE vs
baselines, eyesight status and params, planted-truth pass count. One line each: "<label>: <value>  <file>#<json path>".
R2 uses this to fill the video script and slides; R3 signs it. No number may appear in the pitch that is not on this list.
```

## 9. Standalone accuracy checks
| Check | Input | Expected |
|---|---|---|
| Week scaling | constant 2.0/day | 14.0 every week |
| Missing rule | 3 uncovered days | week `missing`, value `null` |
| Trend recovery | planted +20 %/decade | within 1 point |
| Verdict branches | fabricated N and H | all five `sentence_id`s reachable |
| Two seasons | 70/30 two-peak climatology | two windows, correct order |
| Percentile | value above 22 of 23 | 95.7 → `extreme` |
| Off-season | history all zero, value 2 | `low_activity` |
| AOI cross-check | all cells summed | equals `monthly.json` within 0.5 % |
| Planted truth | `synthland` | trend, peak weeks within `truth.json` tolerances |
| Determinism | run twice | identical hashes |

## 10. Scope owner duties
- At each gate, fill the gate row in `REPORTS.md` §7.1 and announce cuts.
- Keep `02_CONTRACTS.md` true: if a contract changes, edit it in the same pull request as the schema.
- Sunday 16:00: confirm with R3 that the audit list is signed.

## 11. If things go wrong
- **R3's `daily.parquet` is late:** build and test against a fabricated table and `synthland`; your code does not change when real data arrives.
- **Real data for a region is missing at Gate C:** ship the regions that are real; leave the missing region out of `regions.json`. Never ship sample data without its banner.
- **Bootstrap too slow:** optimize the implementation while retaining the locked bootstrap count.
