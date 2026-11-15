# R4 · Planted-Truth Simulator and Tier 2 Eyesight Curve

## 1. Your mission
You build two things that make our science checkable.

1. **The simulator (`synthland`).** A small fake world of fires observed by fake MODIS and VIIRS sensors, written in exactly the FIRMS file format, with every "right answer" recorded. It gives the whole team data in the first two hours and gives the Methods page a planted-truth test almost no other team will have.
2. **The eyesight curve (Tier 2).** The chance that Aqua detects a fire cell-day VIIRS saw, as a function of fire strength, with a ceiling for the times Aqua was not looking. It is our signature figure and an independent route to the same calibration factor Tier 1 measures.

You are never blocked: you create your own data first.

## 2. You own / you never touch
- **Own:** `pipeline/synth/`, `pipeline/eyesight/`.
- **Never touch:** anything else. In particular the simulator writes raw CSVs only; R2's `ingest` turns them into cell-days like any real region.

## 3. Inputs and outputs
| You read | From | Contract |
|---|---|---|
| `pipeline/config/science.yaml`, `regions.yaml` | R3, R2 | §4 |
| `data/grid/{region}/celldays.parquet`, `coverage.parquet` | R2 | §5.2, 5.3 |
| `data/harmonized/{region}/calibration.json`, `daily.parquet` | R3 | §5.10, 5.8 |

| You write | For | Contract |
|---|---|---|
| `data/raw/synthland/modis_synth.csv`, `viirs_snpp_synth.csv`, `viirs_noaa20_synth.csv`, `MANIFEST.json` | R2 | §5 raw naming, §5.15 |
| `data/raw/synthland/truth.json` | everyone's planted-truth tests, R1 | §5.16 and §9 below |
| `data/eyesight/{region}/curve.json` | R1 | §5.12 (= one `eyesight` entry of §6.13) |
| `data/eyesight/{region}/daily_t2.parquet` | R1 | §5.13 |
| `data/eyesight/{region}/validation_t2.json`, `figures/*.png` | R1, R2 | §5.14, 5.19 |

Commands you provide: `python -m pipeline.synth --region synthland [--seed 7] [--size tiny|full]` and `python -m pipeline.eyesight --region R`.

## 4. What the other five are doing
| Role | Doing | Touches you how |
|---|---|---|
| R2 | Scaffold, ingest | Their `clean` must read your CSVs unchanged, so your columns must be exactly FIRMS's. They need the tiny files by **18:00 Saturday**. |
| R3 | Tier 1 k and validation; science owner | Must recover your planted k. Their k is the comparison for your curve. Decides Tier 2 status with you (SD-17). |
| R1 | Statistics and export | Recovers your planted trend and season; compares outputs with `truth.json` for the Methods page; uses `daily_t2` only when status is `validated`. |
| R5 | Web app | Shows the planted-truth table and your curve's status. |
| R6 | Charts | Draws `EyesightCurve` from your `curve.json` shape; agree the binned points with them early. |

## 5. Tools
`uv`, numpy, pandas, DuckDB, scipy (`optimize.minimize`, `special.expit`), `h3` v4, matplotlib, pytest, ruff.

## 6. Your timeline
| Gate | You deliver |
|---|---|
| A · Sat 18:30 | `pipeline.synth --size tiny` writes valid FIRMS-format files + `truth.json` (**files in R2's hands by 18:00**) |
| B · Sat 23:00 | Matching + three-parameter fit recover the planted curve on `synthland`; `curve.json` written; `--size full` available |
| C · Sun 10:00 | Curve fitted on real `us` with bootstrap bands and figures |
| D · Sun 14:00 | Forward and backward translation, V6/V8, reliability, status decided with R3 by 13:30 |
| E · Sun 17:00 | Planted-truth run green end to end; sensitivity note sent to R1 |

## 7. Session primer (paste at the start of every AI session)
```text
You are assisting R4 on the FireRosetta project. Before doing anything, read these files fully:
- AGENTS.md
- plan/03_SCIENCE_DECISIONS.md (SD-16 and SD-17 are mine; also SD-01 to SD-08 and section G)
- plan/02_CONTRACTS.md sections 3, 4, 5 and 10, and the eyesight part of 6.13
- plan/roles/R4_tier2_eyesight.md (section 9 defines the simulator)

I own only: pipeline/synth/ and pipeline/eyesight/. Never edit files elsewhere.
Use pipeline.common for paths, config, time bins and file IO. Constants come from science.yaml.
The simulator must be deterministic for a given seed. The eyesight code must never look at truth.json (only tests do).
Reply first with a three-line restatement and the list of files you will create or change. Run the acceptance commands and
paste their real output. Finish with a five-line handoff note.
```

## 8. Prompts

### A1 · The simulated world and FIRMS-format writer (start 16:30; tiny files to R2 by 18:00)
```text
Task: implement pipeline/synth (world.py, sensors.py, write_firms.py, __main__.py) exactly per section 9 of
plan/roles/R4_tier2_eyesight.md.

Order of work: (1) write_firms.py first with the exact FIRMS column names and formats from section 9.4, and a test that
writes 10 rows per file; (2) world.py: fires per day with the planted seasonality and trend; (3) sensors.py: VIIRS and
MODIS detection with the planted probabilities, coverage gaps, static sources; (4) truth.json.
Vectorise with numpy; --size tiny must finish in under 60 seconds and produce under 400,000 rows in total.
Do not use h3 inside the simulator except to compute truth quantities at the end.

Tests (pipeline/synth/tests):
- same seed -> byte-identical files; different seed -> different;
- headers equal the lists in section 9.4 exactly, acq_time is 4 characters, dates are YYYY-MM-DD;
- no S-NPP rows before 2012-01-20 or after 2026-07-09; no NOAA-20 rows before 2018-01-01; no Aqua rows in the planted
  outage or after 2026-08-26;
- static sources appear on at least 95% of covered days and have type 2 in SP rows;
- rows dated after 2026-06-30 have no type value and version ending in "NRT";
- the monthly distribution of fires peaks in the planted weeks.

Acceptance:
  uv run pytest pipeline/synth -q
  uv run python -m pipeline.synth --region synthland --size tiny
Tell R2 the files are in data/raw/synthland/ (and attach them in chat, since data/ is not in git).
```

### A2 · truth.json expected answers
```text
Task: complete truth.json (section 9.5). Compute every "expected" entry inside the simulator from its internal fire
table with an independent code path (do not import pipeline.harmonize or pipeline.stats): k_annual and monthly k for
snpp and noaa20 at res-6 cell-day level, daytime, over 2013-2022, using only days both sensors were up;
g; the planted curve parameters; the cell-day-level empirical detection rate in 8 FRP bins; the true trend in percent
per decade of Aqua-scale annual cell-days 2003-2025; the two peak weeks and their shares; outage day list; number of
static sources; row counts per file. Give each a tolerance as listed in section 9.5.
Test: truth.json validates against a small schema you write in pipeline/synth/truth_schema.json and every tolerance is > 0.
Acceptance: uv run pytest pipeline/synth -q
```

### B1 · Matching at cell-day level (start 18:30)
```text
Task: implement pipeline/eyesight/match.py per SD-16.

build_matched(celldays, coverage, fit_start, fit_end, pass_="D", neighbour=False) -> DataFrame with one row per S-NPP
fire cell-day in the window on days Aqua is covered: local_day, year, month, h3_r6, frp_sum (S-NPP), n_det (S-NPP),
x = log10(max(frp_sum, tier2.frp_floor_mw)), y = 1 if Aqua has a daytime row for the same h3_r6 and local_day else 0.
With neighbour=True, y = 1 if Aqua detected in the cell or any of its 6 neighbours (h3.grid_disk(cell, 1)).
Also return counts: aqua_celldays_total, aqua_celldays_matched (Aqua cell-days whose cell also has an S-NPP row that day),
so g = total / matched.
Do the join in DuckDB. Never use Aqua columns as predictors.

Tests on a fabricated celldays table (write pipeline/eyesight/tests/fabricate.py; no dependence on other stages):
- 4 S-NPP cell-days, Aqua present on 2 of them -> y = [1,1,0,0] in the right rows;
- an Aqua-only cell-day raises aqua_celldays_total but not matched (g > 1);
- uncovered Aqua days are excluded entirely;
- neighbour mode flips a 0 to 1 when Aqua is in the adjacent cell;
- frp_sum of 0 or null is floored, not dropped.

Acceptance:
  uv run pytest pipeline/eyesight -q
```

### B2 · The three-parameter fit
```text
Task: implement pipeline/eyesight/fit.py per SD-16.

fit_curve(x, y) -> dict(a, b, c, nll, converged): maximise the Bernoulli likelihood of p = c * expit(a + b*x) with
scipy.optimize.minimize (L-BFGS-B), bounds c in [0.05, 1.0], a in [-15, 15], b in [-5, 15]; start from c = 0.9 and a
logistic-regression-like initial guess; clip p to [1e-9, 1 - 1e-9] in the log-likelihood; try 3 starting points and keep
the best.
bootstrap_curve(matched, B, seed) -> parameter draws by resampling whole years with replacement.
curve_points(params, draws) -> list of {frp_mw, p, lo, hi} at 25 log-spaced FRP values from 0.5 to 2000 MW (5th/95th).
binned(matched, n_bins=8) -> [{frp_mw (bin geometric centre), p_obs, n}] using quantile bins of x.
band_width_at(draws, frp_mw=10) -> hi - lo.

Tests:
- simulate 200,000 points from a known (a, b, c) = (-2.0, 2.2, 0.88): recovered a and b within 0.15, c within 0.02;
- when the truth has c = 1, the fit returns c > 0.97;
- constant y (all ones) does not crash and reports converged with b near 0 or flags it;
- bootstrap is reproducible with a seed and its band contains the true curve at 1, 10 and 100 MW.

Acceptance:
  uv run pytest pipeline/eyesight -q
```

### B3 · Stage entry point and curve.json on synthland (before Gate B)
```text
Task: implement `python -m pipeline.eyesight --region R` (steps: match, fit, bootstrap, write).
Write data/eyesight/R/curve.json in exactly the shape of one `eyesight` entry in contracts section 6.13:
region, status (for now "exploratory"), params with lo/hi, g, n_celldays, curve, binned, k_compare (empty list for now).
Save figures/eyesight_curve.png (binned points with n-proportional size, fitted curve, band, log x axis).
If there are fewer than 2,000 matched rows or the fit does not converge, write status "absent" with a reason field in
the log (not in the JSON) and exit 0.

Add tests/test_planted_truth.py (skipped if synthland celldays are missing): reliability, i.e. the sum of fitted p over
all matched rows is within 3% of the number of y = 1; and the binned empirical rates match truth.json's cell-day-level
rates within its tolerances.

Acceptance:
  uv run python -m pipeline.run --region synthland --to ingest      # needs R2's ingest; else use a celldays table
                                                                    # written by your fabricate helper
  uv run python -m pipeline.eyesight --region synthland
  uv run pytest pipeline/eyesight -q
Paste a, b, c with their ranges, g, n_celldays and the reliability error.
```

### C1 · Real data (Sun 07:00)
```text
Task: run the stage on us and make it robust to what real data throws at it.
- Print before fitting: matched rows per year, share with y = 1 per year, FRP quantiles (5, 25, 50, 75, 95).
- If a region has fewer than 2,000 matched rows in some years, keep those years but report them.
- Check for year effects: fit the curve separately for each year and plot the 10 curves faintly behind the pooled one
  (figures/eyesight_by_year.png). A fan that widens is real information; do not hide it.
- Paste for each region: params with ranges, g, band width at 10 MW, reliability error.
Do not change the model, the predictor or the fit window to improve the numbers. If something looks wrong, report it.

Acceptance:
  uv run python -m pipeline.eyesight --region us
```

### C2 · Forward and backward translation
```text
Task: implement pipeline/eyesight/translate.py and write data/eyesight/R/daily_t2.parquet (contracts 5.13; SD-16).

- harmonized_t2 (forward): for every covered day of the primary VIIRS (S-NPP through eras.snpp_through, NOAA-20 after),
  value = g * sum over that day's daytime VIIRS fire cell-days of p(x), with x from that sensor's frp_sum. lo/hi from the
  5th/95th percentile across bootstrap draws (draw both the curve and g). kind harmonized; missing where not covered.
  NOAA-20 uses the S-NPP-fitted curve (state this in the log and in a "note" row of validation_t2.json).
- k_T2 per month = g * mean p over the fit-window matched rows of that month; and per (month, year) for the band.
- viirs_equiv_t2 (backward): before eras.snpp_first_day, value = aqua_raw / k_T2,month (read aqua_raw from R3's
  daily.parquet), lo/hi from the 5th/95th percentile of the yearly k_T2,month,year values, kind estimated;
  from that day on, viirs_raw from R3's daily.parquet, kind observed.
- Fill curve.json k_compare with {month, k_tier1 (R3's calibration.json snpp), k_tier2}. Figure
  figures/k_tier1_vs_tier2.png: 12 points per region against the 1:1 line.

Tests (fabricated): if every fire has the same FRP, forward equals VIIRS cell-days * g * p exactly; backward times
k_T2 returns aqua_raw; no negative values; one row per series per day.

Acceptance:
  uv run pytest pipeline/eyesight -q
  uv run python -m pipeline.eyesight --region synthland && uv run python -m pipeline.eyesight --region us
```

### D1 · Validation and the status decision (by Sun 13:00)
```text
Task: implement pipeline/eyesight/validate.py and write data/eyesight/R/validation_t2.json (ValidationRow, contracts 6.13).

For each held-out year Y in the fit window (refit the curve and g without Y):
- reliability_err: |sum p - observed Aqua co-detections| / observed, pooled over held-out years;
- loyo_weekly_wape (method tier2): weekly Aqua cell-days predicted by the forward translation vs aqua_raw weekly;
- backcast_weekly_wape (method tier2): weekly S-NPP cell-days predicted as aqua_raw / k_T2 vs snpp_raw weekly;
- t1_t2_wape: weekly WAPE between harmonized_t2 and R3's viirs_as_aqua over the fit window.
Then apply SD-17 mechanically using R3's loyo_weekly_wape (read data/harmonized/R/validation_t1.json) and the thresholds
in science.yaml tier2.*, and set curve.json status to "validated" or "exploratory". Print which condition failed.
Add the neighbour-match sensitivity: refit with neighbour=True and report the change in c and in k_T2 as a `note` on
the reliability row. It is reported, never used.

Tests: on fabricated data from the model itself, status is validated; if I corrupt y for one year, reliability_err rises
and status flips to exploratory; held-out years are provably excluded from the refit.

Acceptance:
  uv run pytest pipeline/eyesight -q
  uv run python -m pipeline.run --all-regions --from eyesight --to eyesight
Paste a table per region: status, the four metrics, which SD-17 conditions passed. Send it to R3 for the decision.
```

### D2 · Plain-language text for the Methods page (Sun 13:30, 20 min)
```text
Task: from the real curve.json files I paste, draft for R1's methods_text.yaml: (1) a four-sentence explanation of the
eyesight curve for a land manager (what the curve is, what the ceiling means, how we know it is right, what it is used
for); (2) one sentence per region reading its curve ("At 10 megawatts Aqua sees about {p}% of the fire cell-days VIIRS
sees; at 100 megawatts, {p}%"), with placeholders in braces naming the JSON path to fill, not typed numbers;
(3) the honest status line for each region. No number may be typed by hand.
```

### E1 · Planted truth, full run (Sun 15:00)
```text
Task: run the full planted-truth test and help me read it.
  uv run python -m pipeline.synth --region synthland --size full
  uv run python -m pipeline.run --region synthland
  uv run pytest -q -k planted_truth
I will paste methods.json planted_truth. For any failing row, work out whether the simulator's expected value or the
pipeline stage is wrong, by recomputing the quantity by hand from the simulator's internal table for one month.
Report findings; fix only code in pipeline/synth or pipeline/eyesight. For a failure in another stage, write a
three-line bug report for that owner with the smallest reproducing numbers.
```

## 9. Simulator specification (`synthland`)

### 9.1 World
- Region: bbox 10.0, 10.0, 12.0, 12.0. Days: 2003-01-01 → 2026-11-13.
- **Fires per day** ~ Poisson(λ(d)), `λ(d) = base × season(doy) × trend(year)`.
  - `season(doy)`: sum of two Gaussian bumps in week space, **peak weeks 44 (weight 0.70, σ 2.5 weeks)** and **18 (weight 0.30, σ 2.0 weeks)**, circular, plus a floor of 2 % of the peak.
  - `trend(year) = 1 + 0.015 × (year − 2003)` → **+15 % per decade** relative to 2003 in fire numbers.
  - `base`: `tiny` → mean 25 fires/day at the main peak; `full` → 120.
- Each fire: uniform location in the bbox; **FRP ~ lognormal(median 8 MW, σ_ln 1.2)**; lasts one day; burns in the afternoon. 20 % of fires also burn at night with FRP × 0.4.

### 9.2 Sensors
| Sensor | Up | Daytime detection of a fire with FRP `f` (MW) | Pixels per detection | Local time |
|---|---|---|---|---|
| S-NPP VIIRS | 2012-01-20 → 2026-07-09 | `0.97 × sigmoid(2.5 + 3.0·log10 f)` | `1 + Poisson(0.6·√f)`, jittered ≤ 400 m, FRP split evenly | 13:30 ± 20 min |
| NOAA-20 VIIRS | 2018-01-01 → end | same law, independent draw | same | 12:40 ± 20 min |
| Aqua MODIS | 2003-01-01 → 2026-08-26, **outage 2020-08-16 → 2020-09-02** | **in view with probability c = 0.88** (one draw per fire-day); if in view, `sigmoid(a + b·log10 f)` with **a = −2.0, b = 2.2**; **from 2023-01-01, `a` falls by 0.25 per year** (orbit drift) | 1 pixel, jittered ≤ 700 m, FRP × lognormal noise (σ 0.3) | 13:35 ± 15 min (drifting 25 min later per year from 2023) |
| Terra MODIS | 2003-01-01 → end | in view 0.88; `sigmoid(−2.6 + 2.2·log10 f)` (morning, weaker) | 1 pixel | 10:30 ± 15 min |

- Night passes: same laws applied to the night fires, local time +12 h, `daynight = N`.
- **Confidence:** MODIS integer `min(100, 20 + 35·log10(f + 1) + noise)`; VIIRS `l` (10 %, weakest), `n` (75 %), `h` (15 %, strongest).
- **Static sources:** 5 fixed points, each detected by every up sensor every day with probability 0.97, FRP 15–40 MW, `type = 2` in standard rows.
- **Standard vs near-real-time:** rows dated ≤ 2026-06-30 have `type` (0 for fires) and `version` `6.1` (MODIS) / `2` (VIIRS); later rows have an empty `type` and `version` `6.1NRT` / `2.0NRT`.

### 9.3 Size targets
`tiny`: under 400 000 rows in total, under 60 s. `full`: under 3 million rows, under 5 min.

### 9.4 File format (must equal real FIRMS archive CSVs)
- `modis_synth.csv` header: `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type`
- `viirs_snpp_synth.csv`, `viirs_noaa20_synth.csv` header: `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type`
- `acq_date` `YYYY-MM-DD`; `acq_time` 4-character `HHMM` **UTC** (convert from local solar time with the fire's longitude); `satellite` `Terra`/`Aqua`, `N`, `N20`; `instrument` `MODIS`/`VIIRS`; `scan`,`track` 1.0–1.2 (MODIS) or 0.39–0.45 (VIIRS); brightness columns plausible constants plus noise (unused downstream).
- When R2 posts real headers on Saturday evening, **change these to match the real files exactly** and tell R2.

### 9.5 `truth.json`
```json
{"seed": 7, "size": "full",
 "planted": {"curve": {"a": -2.0, "b": 2.2, "c": 0.88}, "trend_pct_per_decade_fires": 15.0,
             "season": {"peak_weeks": [44, 18], "weights": [0.7, 0.3]},
             "outages": [{"sensor": "aqua", "start": "2020-08-16", "end": "2020-09-02"}],
             "static_sources": 5, "aqua_drift_from": "2023-01-01",
             "noaa20_first_full_year": 2018, "expected_noaa20_method": "direct"},
 "expected": [
   {"quantity": "k_annual_snpp",   "truth": 0.0, "tolerance": 0.03, "source_file": "calibration.json", "path": "k_annual.snpp.k"},
   {"quantity": "k_annual_noaa20", "truth": 0.0, "tolerance": 0.04, "source_file": "calibration.json", "path": "k_annual.noaa20.k"},
   {"quantity": "k_month_snpp_max_abs_err", "truth": 0.0, "tolerance": 0.08, "source_file": "calibration.json", "path": "k.snpp[*].k"},
   {"quantity": "g",               "truth": 0.0, "tolerance": 0.03, "source_file": "curve.json", "path": "g"},
   {"quantity": "reliability_err", "truth": 0.0, "tolerance": 0.05, "source_file": "validation_t2.json", "path": "reliability_err"},
   {"quantity": "trend_pct_per_decade", "truth": 0.0, "tolerance": 5.0, "source_file": "trend.json", "path": "harmonized.pct_per_decade"},
   {"quantity": "peak_week_main",  "truth": 44, "tolerance": 1, "source_file": "season.json", "path": "windows[0].peak_week"},
   {"quantity": "peak_week_second","truth": 18, "tolerance": 1, "source_file": "season.json", "path": "windows[1].peak_week"},
   {"quantity": "aqua_outage_days_missing", "truth": 18, "tolerance": 0, "source_file": "coverage.parquet", "path": "aqua covered=false in outage"},
   {"quantity": "static_rows_surviving", "truth": 0, "tolerance": 0, "source_file": "celldays.parquet", "path": "cells of the 5 static points"}],
 "binned_rates": [{"frp_mw": 0.0, "p_true": 0.0, "tolerance": 0.04}],
 "counts": {"modis_rows": 0, "viirs_snpp_rows": 0, "viirs_noaa20_rows": 0}}
```
The zeros are filled by the simulator from its own internal tables (prompt A2). `trend_pct_per_decade` truth is the Theil–Sen slope of the simulator's true Aqua-scale annual cell-days, not simply 15, because detection and cell merging change it slightly.

## 10. Standalone accuracy checks
| Check | Input | Expected |
|---|---|---|
| Determinism | same seed | identical bytes |
| Format | generated CSV | headers equal §9.4 |
| Matching | 4 fabricated cell-days | y in the right rows |
| Fit recovery | 200 000 simulated points | a, b within 0.15; c within 0.02 |
| Ceiling | truth c = 1 | fitted c > 0.97 |
| Reliability | `synthland` | \|Σp − observed\| < 3 % |
| Forward identity | equal FRP everywhere | VIIRS × g × p exactly |
| Status logic | corrupted year | flips to `exploratory` |

## 11. If things go wrong
- **Real FIRMS headers differ from §9.4:** change the simulator to match the real files, never the other way round.
- **Fit does not converge on a region:** status `absent`, Tier 1 everywhere; report the matched-row counts.
- **Band at 10 MW is wide or reliability fails:** status `exploratory`; the curve still goes on the Methods page with that label. This is a planned outcome, not a failure.
- **Tier 1 and Tier 2 monthly k disagree:** plot them (that figure is the point), report the months that differ, let R3 decide the wording.
- **R2's ingest of `synthland` is not ready at 20:00:** fit on a cell-day table produced by your fabricate helper from the simulator's internal fire table; swap to the real path when ingest lands.
