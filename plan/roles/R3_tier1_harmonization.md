# R3 · Tier 1 Harmonization and Validation (science owner)

## 1. Your mission
You build the series the whole product stands on: **the harmonized daily record** (Aqua where Aqua is trustworthy, translated VIIRS after) and the **proof that the translation works**. You also hold the pen on every scientific constant (`science.yaml`) and you sign every number that reaches a judge.

Your method is deliberately simple (a shrunken monthly ratio). Its strength is the evidence around it: leave-one-year-out error against two baselines, the drift chart that shows why we stop trusting Aqua in 2022, the satellite-agreement test, and planted-truth recovery.

## 2. You own / you never touch
- **Own:** `pipeline/harmonize/`, `pipeline/config/science.yaml`, `plan/03_SCIENCE_DECISIONS.md`.
- **Never touch:** anything else. If `common/timebins.py` seems wrong, tell R2; do not work around it.

## 3. Inputs and outputs
| You read | From | Contract |
|---|---|---|
| `data/grid/{region}/celldays.parquet` | R2 | §5.2 |
| `data/grid/{region}/coverage.parquet` | R2 | §5.3 |
| `data/grid/{region}/hotspot_counts_daily.parquet` | R2 | §5.4 |
| `data/raw/synthland/truth.json` (tests only) | R4 | §5.16 |

| You write | For | Contract |
|---|---|---|
| `pipeline/config/science.yaml` | everyone | §4.2 |
| `data/harmonized/{region}/daily.parquet` | R1, R4 | §5.8 |
| `data/harmonized/{region}/annual_bootstrap.parquet` | R1 | §5.9 |
| `data/harmonized/{region}/calibration.json` | R1, R4, web | §5.10 / §6.11 |
| `data/harmonized/{region}/validation_t1.json`, `naive_annual.parquet` | R1 | §5.11 |
| `data/harmonized/{region}/figures/*.png` | R2 (slides) | §5.19 |

Command you provide: `python -m pipeline.harmonize --region R`.

## 4. What the other five are doing
| Role | Doing | Touches you how |
|---|---|---|
| R1 | Calendar statistics, trend verdict, export | Reads your `daily.parquet` and bootstrap replicates; copies your validation rows into `methods.json` unchanged. Sends you the audit list to sign. |
| R2 | Ingest; later README and video | Gives you `celldays` and `coverage`; tells you `n20_first_full_year` and each sensor's last day (their "data profile"). Will ask you about any unknown satellite code. |
| R4 | Simulator and Tier 2 curve | Their `synthland` has a planted k you must recover. They read your `calibration.json` to compare k values, and your `daily.parquet` for the Tier 1 vs Tier 2 test. You decide with them whether Tier 2 is `validated` (SD-17). |
| R5 | Web app | Shows your eras and k table on the Methods page. |
| R6 | Charts | Draws your drift chart from `methods.json`. |

## 5. Tools
`uv`, DuckDB, pandas, numpy, scipy, matplotlib, pytest, ruff. Optional: a DuckDB MCP server or the DuckDB CLI to look at Parquet.

## 6. Your timeline
| Gate | You deliver |
|---|---|
| A · Sat 18:30 | `science.yaml` on main (by **17:15**, others need it); `calibrate.py` passing fabricated tests |
| B · Sat 23:00 | `pipeline.harmonize` end to end on `synthland` (planted k recovered) and on real `conus`; `daily.parquet`, `calibration.json`, bootstrap files written |
| C · Sun 10:00 | V1–V5 for three regions in `validation_t1.json`; drift and LOYO figures |
| D · Sun 14:00 | V6 backcast; direct vs chained NOAA-20; limitations text sent to R1; Tier 2 status agreed with R4 |
| E · Sun 17:00 | **Numbers audit signed** (`REPORTS.md` §7.3) |

## 7. Session primer (paste at the start of every AI session)
```text
You are assisting R3, the science owner, on the FireRosetta project. Before doing anything, read these files fully:
- AGENTS.md
- plan/03_SCIENCE_DECISIONS.md (all of it; I own it)
- plan/02_CONTRACTS.md sections 3, 4.2, 5 and 10
- plan/roles/R3_tier1_harmonization.md

I own only: pipeline/harmonize/, pipeline/config/science.yaml, plan/03_SCIENCE_DECISIONS.md. Never edit files elsewhere.
Use pipeline.common (paths, config, timebins, io, log, cli) for all paths, binning and file IO. Read constants from
science.yaml through common.config.load_science(); never hard-code a year, threshold or window.
Training and test years never mix. If a validation number looks too good, look for a leak before reporting it.
Reply first with a three-line restatement and the list of files you will create or change. Run the acceptance commands and
paste their real output. Finish with a five-line handoff note.
```

## 8. Prompts

### A1 · science.yaml (start 16:30, on main by 17:15)
```text
Task: create pipeline/config/science.yaml exactly as shown in plan/02_CONTRACTS.md section 4.2, and add
pipeline/harmonize/tests/test_science_yaml.py that loads it and asserts every key and value listed there
(so an accidental edit fails CI). Also add `seed: 7` at the top level and assert it.
Then re-read plan/03_SCIENCE_DECISIONS.md and list any constant mentioned there that is missing from the YAML.
Acceptance: uv run pytest pipeline/harmonize -q
```

### A2 · The calibration factor (17:15–18:30)
```text
Task: implement pipeline/harmonize/calibrate.py per SD-06. Pure functions, no file IO.

daily_counts(celldays, coverage, sensor, pass_="D") -> DataFrame[local_day, count, covered]
    count = number of distinct h3_r6 cells with that sensor and pass on that day; 0 on covered days with none;
    null where coverage says not covered.
fit_k(aqua_daily, viirs_daily, start, end, n0, exclude_years=()) -> DataFrame[month, k, aqua_celldays, viirs_celldays] plus k_annual
    uses only days where both are covered; k_ann = sum(A)/sum(V); k_m = (A_m + n0*k_ann)/(V_m + n0);
    if sum(V) == 0 raise a clear error.
fit_chained(k_snpp, snpp_daily, noaa20_daily, start, end, n0) -> same shape (k_snpp,m * r_m, r_m shrunk the same way)
choose_noaa20_method(n20_first_full_year, fit_end_year, min_years) -> "direct" | "chained"

Also create pipeline/harmonize/tests/fabricate.py: helpers that build small celldays and coverage tables with a planted
ratio (for example each Aqua cell-day accompanied by exactly two VIIRS cell-days), a planted seasonal cycle, planted
uncovered days, and a planted year-specific ratio. All later tests use it. No dependence on other people's code.

Tests:
- VIIRS exactly 2x Aqua every month, plenty of data -> every k_m = 0.5 within 1e-9, k_annual = 0.5;
- a month with 2 Aqua and 2 VIIRS cell-days while k_ann = 0.5 and n0 = 50 -> k_m = (2 + 25)/(2 + 50);
- days where either sensor is uncovered are ignored (plant an outage with wild values inside; k unchanged);
- exclude_years removes those years from the sums;
- chained: S-NPP 2x Aqua and NOAA-20 1.25x S-NPP -> chained k_noaa20 = 0.4;
- method rule: 4 full years -> direct; 2 -> chained.

Acceptance:
  uv run pytest pipeline/harmonize -q
  uv run ruff check pipeline/harmonize
```

### B1 · The daily series and calibration.json (start 18:30)
```text
Task: implement pipeline/harmonize/series.py and the stage entry point `python -m pipeline.harmonize --region R`.

Build data/harmonized/R/daily.parquet with every series in the table under contracts section 5.8, one row per series
per day from eras.record_start to the last local_day in coverage:
- aqua_raw, snpp_raw, noaa20_raw from daily_counts (kind observed, or missing with value null where not covered);
- viirs_raw: snpp through eras.snpp_through, noaa20 after;
- snpp_as_aqua, noaa20_as_aqua, viirs_as_aqua: raw x k of that day's month, lo/hi from the bootstrap k (prompt B2;
  until B2 exists set lo = hi = value), kind harmonized;
- harmonized per SD-05: aqua_raw (kind observed, source aqua) through eras.aqua_trusted_through; then the era's VIIRS
  x k (kind harmonized); on a day the era's source is not covered, use the other VIIRS x its own k if covered,
  otherwise missing. Record the sensor actually used in `source`. Aqua not covered before 2023 -> missing (no fallback
  before S-NPP exists; from 2012-01-20 to 2022-12-31 fall back to snpp_as_aqua and mark kind harmonized);
- viirs_equiv_t1: before eras.snpp_first_day = aqua_raw / k_snpp of the month (kind estimated; lo = aqua/k_hi,
  hi = aqua/k_lo); from that day on = viirs_raw (kind observed).
NOAA-20 fit window: from n20_first_full_year (computed here from celldays: first calendar year with NOAA-20 cell-days on
>= 300 distinct days; if none, NOAA-20 is treated as absent and the 2026 era falls back to S-NPP where covered) to the
end of tier1.snpp_fit. Apply choose_noaa20_method; compute BOTH direct and chained and keep both in memory for validation.

Write data/harmonized/R/calibration.json exactly as contracts section 6.11 (eras, fit_window, noaa20_method, k_annual,
k per month with cell-day sums). Validate with the JSON Schema in contracts/calibration.schema.json if it exists.

Tests (fabricated): the era switch happens on the right days; a planted Aqua outage in 2020 is filled from S-NPP x k and
marked harmonized/source snpp; a day with no sensor covered is missing with value null; viirs_equiv_t1 before 2012 equals
aqua/k; no value is ever negative or NaN; every series has exactly one row per day.

Acceptance:
  uv run pytest pipeline/harmonize -q
  uv run python -m pipeline.harmonize --region synthland
  uv run python -m pipeline.harmonize --region conus
Paste: k_annual and the 12 monthly k for both sensors, noaa20_method, and the count of missing days in `harmonized`.
```

### B2 · Uncertainty and the naive record
```text
Task: add pipeline/harmonize/bootstrap.py and pipeline/harmonize/naive.py, and wire both into the stage.

bootstrap.py (SD-06): year-block bootstrap with B = tier1.bootstrap_b and the seed from science.yaml. Each replicate
resamples the fit years with replacement and refits k (monthly, with shrinkage) for S-NPP and for NOAA-20 by the chosen
method. k lo/hi = 5th/95th percentile across replicates, written into calibration.json and used for lo/hi of every
translated series in daily.parquet. Also write annual_bootstrap.parquet (contracts 5.9): for each replicate and each
year from 2003 to the last complete year, the annual harmonized total computed with that replicate's k
(use common.timebins.aggregate with grain "year"); years fully inside the Aqua era are identical across replicates.
Vectorise: precompute per-year per-month sums once; a replicate is then a few array operations.

naive.py (SD-09): naive_annual.parquet with year, modis_count (Terra + Aqua, day + night, from
hotspot_counts_daily), snpp_count, and each one's covered fraction of the year (a day counts as covered for modis if
aqua OR terra is covered).

Tests: with a planted constant ratio and no noise the k interval has zero width; with year-to-year planted ratios
0.4..0.6 the interval covers 0.5 and is inside [0.4, 0.6]; replicates are reproducible with the same seed; annual totals
for Aqua-era years have zero variance across replicates; naive counts match a hand count on a 20-row fabricated table.

Acceptance:
  uv run pytest pipeline/harmonize -q
  uv run python -m pipeline.harmonize --region synthland     # must finish in under 2 minutes
  uv run python -m pipeline.harmonize --region conus        # paste the run time
```

### B3 · Planted-truth check for Tier 1 (before Gate B)
```text
Task: add pipeline/harmonize/tests/test_planted_truth.py, skipped when data/raw/synthland/truth.json or the synthland
celldays are absent. It runs the stage on synthland and asserts, using the tolerances stored in truth.json:
k_annual for snpp and noaa20; the 12 monthly k values (looser tolerance); the planted Aqua outage days are missing in
aqua_raw and filled in harmonized; noaa20_method is what truth.json expects; the drift planted after 2022 does NOT
contaminate k (k fitted on 2013-2022 matches the pre-drift truth).
Run it and paste the comparison table (quantity, truth, recovered, tolerance, pass).
```

### C1 · Validation V1, V2, V3 (start Sun 07:00)
```text
Task: implement pipeline/harmonize/validate.py; the stage writes data/harmonized/R/validation_t1.json
(contracts 5.11; ValidationRow in 6.13; test definitions in science section G).

V1 leave-one-year-out, forward: for each year Y in the S-NPP fit window, refit k without Y, predict Aqua daily counts
  in Y as snpp_raw x k on days both are covered, aggregate to weeks with common.timebins, compare with aqua_raw weeks.
  Pool all held-out weeks. Rows: loyo_weekly_wape (= sum|pred-obs| / sum obs), loyo_weekly_r (Pearson), loyo_bias
  (= sum(pred-obs)/sum obs). baselines: raw_viirs (k = 1) and annual_ratio (k_ann only, refit without Y).
V2 handoff: handoff_annual_mape = mean over fit years of |annual(LOYO prediction) - annual(aqua)| / annual(aqua).
  step_naive and step_harmonized: ratio of the mean of 2012-2014 to the mean of 2009-2011, for the naive index
  (naive_annual) and for the translated-from-2012 series (aqua_raw through 2011, viirs_as_aqua from 2012). In `note`
  give the 5th-95th percentile of the same 3-year/3-year ratio over all consecutive windows inside 2003-2011 (the
  normal year-to-year variation) and the sentence "totals match partly by construction; see LOYO".
V3 satellite agreement over n20_first_full_year..2025: sat_agreement_wape between weekly snpp_as_aqua and
  noaa20_as_aqua; k_direct_vs_chained_pct = 100 * (k_ann direct - k_ann chained) / k_ann chained (value null with a
  note if direct could not be fitted).
Every row carries n and years. Save figures to data/harmonized/R/figures/: loyo_scatter.png (pred vs obs weekly, 1:1
line), overlay_aqua_vs_translated.png (annual, 2012-2025).

Tests (fabricated): with a constant planted ratio LOYO WAPE < 0.01 and the raw_viirs baseline WAPE is about 1.0;
with a planted month-dependent ratio, monthly k beats the annual_ratio baseline; the held-out year is provably excluded
(plant an absurd ratio in year Y and show k without Y is unaffected).

Acceptance:
  uv run pytest pipeline/harmonize -q
  uv run python -m pipeline.harmonize --region conus
Paste the validation rows as a table. If WAPE is below 0.05 on real data, explain why it is not a leak before moving on.
```

### C2 · Drift, saturation, backcast (V4, V5, V6)
```text
Task: extend validate.py.

V4 drift: for each calendar year from 2013 to the last year with Aqua data, k_annual_y = sum(Aqua)/sum(S-NPP) on days both
  are covered (and the same against NOAA-20 from its first full year), with a 5th-95th range from resampling weeks
  within the year (200 resamples). Write as `drift` in validation_t1.json. Figure drift_k_by_year.png with a vertical
  line at eras.aqua_trusted_through. Each drift entry carries its sensor. Also write the top-level "drift_summary"
  (contracts 5.11): the mean k over the fit window and each later year's percent departure from it.
V5 saturation: peak week = the week of year with the largest mean Aqua cell-days over the fit window. For aqua and snpp:
  mean over fit years of (cells active per day in that week) / (number of region cells) at res 6 -> saturation_r6;
  the same with h3_r5 parents -> saturation_r5. One row per sensor (put the sensor in `note`).
V6 backcast (Tier 1): for each year Y in the fit window, refit k without Y, predict S-NPP weekly as aqua_raw / k,
  compare with snpp_raw weekly: backcast_weekly_wape, method tier1.

Tests: planted drift (ratio falling 5% per year after 2022) appears in `drift` with the right sign and size; a region
where every cell is active every day gives saturation 1.0; backcast on a constant ratio has WAPE < 0.01.

Acceptance:
  uv run pytest pipeline/harmonize -q
  uv run python -m pipeline.run --all-regions --from harmonize --to harmonize
Paste for each region: LOYO WAPE vs both baselines, drift summary, saturation r5 vs r6, backcast WAPE.
```

### D1 · Science review of the outputs (Sun 10:30, mostly reading)
```text
Task: act as a sceptical reviewer of our own results. I will paste calibration.json, validation_t1.json and R1's
trend.json for each region. For each region answer, citing the numbers:
1. Is k stable across months, and do the monthly sums (aqua_celldays, viirs_celldays) justify trusting each month?
2. Does the drift chart support stopping Aqua at 2022-12-31? If drift is not visible, say so plainly.
3. Do the three trend variants agree in direction? If not, the verdict must be "unclear": is that what trend.json says?
4. Is saturation at res 6 acceptable in the peak week (flag anything above 0.5)?
5. Do direct and chained NOAA-20 factors agree within 15%? If not, what does that imply for 2026 values and the nowcast?
Then draft 5 to 8 honest limitation sentences for the Methods page (plain language, no hedging filler), including:
day-pass only; cell-days measure the spread of detected burning, not burned area; NRT input for recent months;
static-source masking asymmetry; region-level k applied to sub-areas in the area lens; Tier 2 status.
I will send the limitations to R1 for methods_text.yaml. Do not change any number or constant.
```

### E1 · Numbers audit (Sun 16:00)
```text
Task: I will paste web/public/data/numbers_audit.md, the video script and the slide text. For every number in the
script and slides, find the matching audit line and JSON path. Produce a table: where it appears, the text as written,
the audit value, match yes/no. List any number or factual claim with no audit line or no entry in methods.json sources.
Also flag wording that breaks AGENTS.md (for example "number of fires", "real fires", missing units).
I will copy the table into REPORTS.md section 7.3 and sign it.
```

## 9. Standalone accuracy checks
| Check | Input | Expected |
|---|---|---|
| Exact ratio | VIIRS = 2 × Aqua | k = 0.5 to 1e-9 |
| Shrinkage | 2 vs 2 cell-days, k_ann 0.5, n0 50 | k_m = 27/52 |
| Outage immunity | wild values on uncovered days | k unchanged |
| Era switch | fabricated 2022–2026 | sources change on 2023-01-01 and 2026-01-01 |
| Fallback | Aqua outage in 2020 | filled by S-NPP × k, `kind: harmonized` |
| LOYO exclusion | absurd ratio planted in year Y | k without Y unaffected |
| Drift | planted −5 %/yr after 2022 | visible in `drift`, absent from k |
| Planted truth | `synthland` | all rows in the comparison table pass |
| Reproducibility | same seed twice | identical bootstrap files |

## 10. Science owner duties
- Any change to a locked decision: edit `03_SCIENCE_DECISIONS.md` and `science.yaml` in one commit, announce at the next stand-up, and tell R1 so `methods.json` picks up the new hash.
- Tier 2 status (SD-17) is your call with R4, by Sunday 13:30.
- You sign the audit table in `REPORTS.md` §7.3 before the video is recorded.

## 11. If things go wrong
- **`celldays` for a region is late:** develop on `synthland` and fabricated tables; nothing in your code is region-specific.
- **NOAA-20 has too few years for a direct fit:** the chained method is already specified; record `noaa20_method: chained`.
- **A month has almost no data:** shrinkage handles it; check the cell-day sums in `calibration.json` and mention the month in limitations.
- **LOYO error is worse than the annual-ratio baseline:** publish it, switch `harmonized` to annual k for that region (one config line you add: `tier1.monthly: false`), and say so on the Methods page.
- **Drift is not visible in V4:** keep the era decision (it rests on the orbit, not on our data) but do not claim our data shows it.
