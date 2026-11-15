# 03 · Science Decision Register (locked)

**Purpose.** Every scientific choice in FireRosetta is decided here, once. Nobody (human or AI) re-decides these during the build. If a decision turns out to be impossible with the real data, the only person who may change it is **R3 (science owner)**, by editing this file and `pipeline/config/science.yaml` in the same commit and telling the team at the next stand-up.

**How to read.** Each decision has an ID (`SD-xx`), the locked value, the reason in one or two lines, and the config key that carries it. Code must read constants from `pipeline/config/science.yaml`, never hard-code them.

Supersedes the "Science method" section of the Draft v1 charter wherever they differ. The reasons for each change are in `REPORTS.md` (section 2).

---

## A. What we count

### SD-01 · Reference scale
- **Locked:** MODIS **Aqua**, **daytime** detections (`daynight == "D"`). Every harmonized value is "what Aqua's afternoon pass would have recorded".
- **Why:** Aqua and all VIIRS satellites share the early-afternoon slot, so they sample the same part of the daily fire cycle.
- **Night detections** are kept in the cleaned data (column `daynight`) and flow through the same code with `--pass N`, but **v1 products use day only**. State this on the Methods page as a limitation.
- Config: `reference.sensor: aqua`, `reference.pass: D`.

### SD-02 · Detection filters (applied in this order, each logged with rows in / rows dropped)
1. Valid coordinates and date; exact duplicate rows removed.
2. Inside the region's download bounding box.
3. **Type:** keep `type == 0` when the column exists (standard-processing files). Rows without a `type` column (near-real-time) go through the static mask in SD-18 instead.
4. **Confidence:** MODIS keep `confidence >= 30`. VIIRS keep nominal or high (first letter of the value, lower-cased, in `{n, h}`).
- Config: `filters.modis_min_confidence: 30`, `filters.viirs_keep: [n, h]`.

### SD-03 · Local solar day
- **Locked:** `local_datetime = acq_datetime_utc + (longitude / 15) hours`; `local_day = date(local_datetime)`.
- No time-zone libraries, no machine-local time anywhere.

### SD-04 · Counting grid and unit
- **Locked unit: the fire cell-day** = one **H3 resolution-6** cell (about 36 km²) on one local day with at least one daytime detection from a given sensor that passed SD-02.
- Resolution 5 (about 253 km²) is stored as the parent cell for maps and the area-of-interest lens only.
- **Why res 6, not the charter's res 5:** at 253 km² the busiest regions light up almost every cell every day in peak season on both sensors. The count then saturates, the ratio between sensors drifts toward 1, and "extreme" weeks become indistinguishable from "normal" ones. Res 6 still merges the many VIIRS pixels of one fire into one or two cells.
- **Required diagnostic (V5):** report the share of region cells active per day in the peak week at res 5 and res 6 for both sensors.
- **Region membership:** a cell belongs to a region if its centre is inside the region polygon (`h3.geo_to_cells(polygon, 6)`). The bounding box is used only for downloading. If no polygon file exists, fall back to the bounding box and record `membership: bbox` in the outputs.
- Config: `grid.count_res: 6`, `grid.map_res: 5`, `grid.mask_res: 8`.

### SD-19 · United States local-data scope
- **Scope:** the configured real region is `us` (country `US`, the whole United States). No other real region may be selected. The simulated `synthland` region (`scope.planted_truth_region_ids`) runs through the same code for the planted-truth test only and is never mixed with real data.
- **Only sources:** workspace-root `data/MODIS_data/modis_*_United_States.csv`, `data/VIIRS-SNPP_data/viirs-snpp_*_United_States.csv`, and `data/VIIRS-JPSS_data/viirs-jpss1_*_United_States.csv`.
- These are the supplied NASA FIRMS country exports. There is no local US polygon or authoritative download bounding box. Keep their country membership; do not invent a polygon, centroid, or full-region cell denominator. SD-04 cell-centre polygon membership and saturation denominators require a supplied US polygon before they can be evaluated.
- Source and derived-input hashes are recorded at ingestion and verified before harmonization. Alternate output roots do not redirect the raw source directory. Unknown satellites, mismatched file years, stale derived inputs and non-US region requests fail.
- The user's US-only instruction supersedes the previous showcase-region list. Country-file membership is an explicit limitation, not a claim that cell centres were checked against a US boundary.
- Existing SD-02/SD-03 constants are now carried explicitly by `filters.keep_type: 0`, `timebins.solar_degrees_per_hour: 15`, `timebins.week_days: 7`, `timebins.weeks_per_year: 52`, and `static_mask.types: [1, 2, 3]`. Numeric decisions are unchanged.

---

## B. Which sensor is trusted when

### SD-05 · Eras of the harmonized series (the most important decision in this file)

| Period | Source of `harmonized` | `kind` | Why |
|---|---|---|---|
| 2003-01-01 → 2022-12-31 | **Aqua observed** | `observed` | Aqua's equator crossing stayed inside its historical 13:30–13:45 band until February 2023. |
| 2023-01-01 → 2025-12-31 | **S-NPP VIIRS × k_snpp** | `harmonized` | Aqua is in free drift (crossing roughly 15:30–15:50 by mid-2026), so it no longer samples the same hour. |
| 2026-01-01 → today | **NOAA-20 VIIRS × k_noaa20** | `harmonized` | S-NPP entered a non-nominal state in July 2026 and stopped delivering fire data on 2 Nov 2026. |

Rules:
- **We never replace good observed Aqua data with translated data.** The translation is *proved* on 2013–2022, where both exist, then *used* from 2023.
- **Fallback on an uncovered day** (SD-08 coverage): if the era's source sensor is not covered that day, use the other VIIRS (S-NPP ↔ NOAA-20) with its own k if it is covered; otherwise the day is `missing`.
- **Aqua outages inside the Aqua era:** from 2012-01-20 an uncovered Aqua day is filled with S-NPP × k_snpp (`kind: harmonized`, `source: snpp`). Before that date there is nothing to fill with, so the day is `missing`.
- **Aqua after 2022** appears only in the sensor lens (`aqua_raw`) and in the drift diagnostic (V4). It is never part of `harmonized`.
- **Terra** is never part of `harmonized`. It appears only inside the naive count (SD-09).
- **NOAA-21** is not used in v1. Using it would require its own calibration (hard rule: never use an uncalibrated sensor).
- Config: `eras.aqua_trusted_through: 2022-12-31`, `eras.snpp_through: 2025-12-31`, `eras.record_start: 2003-01-01`.

### SD-06 · Tier 1 calibration factor k
For each region, each VIIRS sensor `s`, each calendar month `m`, daytime only:

```
A_m  = Aqua fire cell-days in month m, summed over the fit window, on days both sensors are covered
V_m  = sensor-s fire cell-days in month m, same days
k_ann = sum(A_m) / sum(V_m)
k_m   = (A_m + n0 * k_ann) / (V_m + n0)        with n0 = 50 cell-days
```

- **Fit window, S-NPP:** 2013-01-01 → 2022-12-31 (ten complete years; 2012 is partial and is kept as an out-of-sample check).
- **Fit window, NOAA-20:** first full calendar year of NOAA-20 data in our files (`n20_first_full_year`, the first year with detections on ≥ 300 distinct days somewhere in our regions) → 2022-12-31.
- **NOAA-20 method rule:** if that window has **≥ 3 complete years**, use the **direct** fit. Otherwise use the **chained** factor `k_noaa20,m = k_snpp,m × r_m`, where `r_m` = S-NPP cell-days ÷ NOAA-20 cell-days over `n20_first_full_year` → 2025-12-31 with the same shrinkage. Always compute both and report their difference (V3). Record `noaa20_method: direct|chained`.
- **Uncertainty:** year-block bootstrap, B = 500 (resample fit years with replacement, refit). `lo`/`hi` = 5th / 95th percentile, configured as `tier1.interval_percentiles: [5, 95]` (R3-approved config extension; R3 coordinates with R1).
- **Annual bootstrap and Aqua outages:** years made entirely from observed Aqua have identical totals across replicates. An Aqua-era year containing translated S-NPP outage fills inherits those fills' calibration uncertainty; the observed Aqua contribution remains fixed. This clarifies SD-05 and SD-14: the deterministic-year check applies to years with no translated fills.
- Config: `tier1.n0: 50`, `tier1.bootstrap_b: 500`, `tier1.snpp_fit: [2013-01-01, 2022-12-31]`, `tier1.n20_min_detection_days: 300` (the locked full-year threshold above).
- **Unavailable NOAA-20 calibration:** if no year meets that threshold, keep NOAA-20 uncalibrated and use covered, calibrated S-NPP as the harmonized fallback. In `calibration.json`, use `noaa20_method: null`, `fit_window.noaa20: null`, null NOAA-20 annual `k`/`lo`/`hi`, and an empty NOAA-20 monthly list. Raw NOAA-20 observations remain available in the sensor lens. This missing-calibration representation and the new config key were approved by R3; R3 coordinates the contract/schema update with R1.
- **Pre-approved fallback:** if leave-one-year-out error (V1) with monthly k is worse than with the annual ratio for a region, R3 sets `tier1.monthly: false` (annual k only) and says so on the Methods page.

### SD-07 · Daily translated value
`value(d) = VIIRS fire cell-days on day d × k_month(d)`; `lo`/`hi` use `k_lo`/`k_hi`. Observed Aqua days have `lo = hi = value`.

---

## C. Time bins and missing data

### SD-08 · Coverage, weeks, months, years
- **Coverage (per sensor, per day).** A sensor-day is **not covered** when any of these holds:
  1. before the sensor's first data day or after its last (S-NPP first day 2012-01-20; lasts are read from the data);
  2. it is inside an entry of `pipeline/config/outages.yaml` (seeded from the FIRMS `missing_data` service and known anomalies);
  3. the sensor has **zero unfiltered raw rows across all configured real regions** on that UTC date (static heat sources are detected daily, so a true zero means no data).
- **Missing is never zero.** Uncovered days carry `value = null`, `kind = missing`.
- **Week of year:** `week = min(52, (day_of_year − 1) // 7 + 1)`. Week 52 holds 8 days (9 in leap years).
- **Weekly value** = (sum over covered days) × 7 ÷ (number of covered days). `missing` if fewer than 5 covered days.
- **Monthly value** = (sum over covered days) × (days in month) ÷ (covered days). `missing` if covered days < 80 % of the month.
- **Annual value** = (sum over covered days) × (days in year) ÷ (covered days). `missing` if covered days < 90 %.
- All binning goes through `pipeline/common/timebins.py`. Nobody re-implements it.

### SD-18 · Static-source mask for rows without `type`
- Build once per region from standard-processing rows of every sensor: an **H3 res-8** cell is static if it holds **≥ 3 detections with `type` in {1, 2, 3}** over the whole record. Dilate by one ring of neighbours.
- Any row without a `type` value whose res-8 cell is in the mask is dropped (near-real-time data and the most recent archive months).
- State the asymmetry on the Methods page: standard rows are filtered per detection, near-real-time rows per cell.

---

## D. The naive record (the thing we correct)

### SD-09 · Naive series and the jump multiple
- **Naive annual count** = hotspot detections passing SD-02, **day and night**: MODIS **Terra + Aqua** for years ≤ 2011; **S-NPP VIIRS** for 2012–2025 (annualised for coverage per SD-08). This is what a newcomer gets by switching to the "better" sensor when it arrives. It is a **splice, never a sum**.
- **Jump multiple** `J` = mean annual S-NPP hotspot count ÷ mean annual MODIS (Terra + Aqua) hotspot count, **same years 2013–2022, same place**. `lo`/`hi` = min / max of the yearly ratios. This is the only source for any "×" number in the pitch.
- **Broken-ruler chart** plots unit-free **indices**: each line divided by its own 2003–2011 mean. Naive index vs harmonized index.
- The naive count is in hotspots; the harmonized series is in fire cell-days. They are never drawn on the same raw axis.

---

## E. Calendar statistics

### SD-10 · Climatology
- Baseline years: **2003–2025** (23 complete years).
- Per week of year: `min, p10, p25, p50, p75, p90, max` of harmonized weekly values (linear-interpolated quantiles, missing weeks excluded), then each curve smoothed with a **3-week circular moving average**.
- Per calendar month: same statistics on monthly values, no smoothing.

### SD-11 · Anomaly percentile and status
```
percentile = 100 × ( count(past < x) + 0.5 × count(past == x) ) / N
```
| Status | Rule (first match wins) |
|---|---|
| `unavailable` | value is missing |
| `low_activity` | x < 5 **and** the window's p90 < 5 (cell-days per 7 days). Copy: "Too little burning at this time of year to rank." |
| `extreme` | percentile ≥ 95 |
| `above_normal` | percentile > 75 |
| `below_normal` | percentile < 25 |
| `normal` | otherwise |

The `low_activity` rule exists because off-season weeks have a median of zero; without it a single detection would read as "extreme".

### SD-12 · "This week" (nowcast)
- Window: the **last 7 complete local days**, ending yesterday at the region centroid's solar time.
- Value: NOAA-20 near-real-time daytime fire cell-days in the window × `k_noaa20` of each day's month (SD-07), after SD-02 and SD-18.
- Baseline: the **same day-of-year window** in every year 2003–2025 taken from the harmonized daily series (coverage-scaled as in SD-08). Not the fixed-week climatology.
- Output percentile and status per SD-11. Always show `as_of`. Label the input as near-real-time.
- **This month** (challenge wording): month-to-date harmonized total vs the median of the same month-to-date span in 2003–2025, shown as a ratio and a percentile.

### SD-13 · Critical weeks and season shift
- **Critical weeks** = the smallest set of weeks whose smoothed p50 values sum to **≥ 80 %** of the year's smoothed p50 total (add weeks in descending order).
- **Windows** = runs of consecutive critical weeks, circular across the year end, merging gaps of one week. Keep at most **two** windows, each with share ≥ 15 %. Each has `start_week`, `peak_week`, `end_week`, `share`.
- **Per-year timing inside a window** (window extended by ±4 weeks; years with < 20 cell-days there are skipped): `start_doy` = day the cumulative total reaches 10 %, `end_doy` = 90 %, `centroid_doy` = activity-weighted mean day.
- **Shift** = Theil–Sen slope across 2003–2025, in days per decade, with a 5th–95th percentile range from 1 000 bootstrap resamples of years.
- Wording rule: if the range includes 0, the sentence says "no clear shift".
- **Why not the charter's 10 %/90 % of the whole year:** a region can have multiple burning seasons; one whole-year window could bridge unrelated seasons.

### SD-14 · Trend
- Theil–Sen slope of **annual harmonized totals, 2003–2025**. `pct_per_decade = 100 × 10 × slope ÷ median(annual totals)`.
- Range: 5th–95th percentile over 1 000 replicates; each replicate resamples years and uses one of R3's bootstrap replicates of the translated years (`annual_bootstrap.parquet`), so **harmonization uncertainty is inside the range**.
- Same calculation on the naive annual count (SD-09).
- **Robustness variants** (reported on the Methods page): (a) Aqua only, 2003–2022; (b) translated from 2012 (Aqua ≤ 2011, S-NPP × k for 2012–2025). If the three disagree in direction, the verdict sentence uses the "no clear change" branch.
- `direction`: `rising` if lo > 0, `falling` if hi < 0, else `no_clear_change`.

### SD-15 · Verdict sentence (templates, filled by the pipeline)
Let H = harmonized, N = naive (percent per decade with ranges).
| sentence_id | Condition | Template |
|---|---|---|
| `artifact_flat` | H no_clear_change, N rising, N.lo > H.hi | "The raw record suggests burning rose {N}% per decade. After correcting for the sensor change, there is no clear change ({H.lo} to {H.hi}% per decade)." |
| `artifact_rising` | H rising, N rising, N.value − H.value ≥ 10 | "Burning activity did rise, by about {H}% per decade ({H.lo} to {H.hi}). The raw record overstates it at {N}%." |
| `artifact_falling` | H falling, N rising or no_clear_change | "The raw record hides a decline: corrected burning activity fell about {abs(H)}% per decade ({H.lo} to {H.hi})." |
| `agree` | same direction, \|N − H\| < 10 | "Raw and corrected records agree: {direction phrase}, about {H}% per decade ({H.lo} to {H.hi})." |
| `unclear` | anything else, or robustness variants disagree | "The record does not show a clear long-term change here ({H.lo} to {H.hi}% per decade)." |

Language rules: say "satellite-detected burning activity", never "number of fires"; never say "real fire" for a harmonized estimate.

---

## F. Tier 2 · the eyesight curve

### SD-16 · Model, fitted at cell-day level
- **Population:** S-NPP daytime fire cell-days (res 6) in 2013–2022, on days Aqua is covered.
- **Outcome:** `y = 1` if Aqua has ≥ 1 daytime detection in the **same cell and local day**.
- **Predictor:** `x = log10(max(total S-NPP FRP in the cell-day, 0.1))`, FRP in MW.
- **Model:** `p(x) = c × sigmoid(a + b·x)`, three parameters per region, maximum likelihood (`scipy.optimize.minimize`, L-BFGS-B, `c` bounded to [0.05, 1]).
  - `sigmoid(a + b·x)` is the **eyesight**: how the chance of detection rises with fire strength.
  - `c` is the **ceiling**: how often Aqua was looking at all (swath gaps, timing, cloud).
- **Uncertainty:** year-block bootstrap, B = 200.
- **Aqua-only factor:** `g = (all Aqua fire cell-days) ÷ (Aqua fire cell-days where S-NPP also detected)`, over the fit window. `g ≥ 1`.
- **Forward (VIIRS → Aqua-equivalent):** `A_equiv(day) = g × Σ p(x)` over that day's VIIRS fire cell-days. The NOAA-20 era uses the same curve (same instrument design); state that assumption.
- **Curve-predicted ratio:** `k_T2,m = g × mean p` over month m's fit-window cell-days. Plotting `k_T2,m` against Tier 1 `k_m` is the "two independent routes agree" figure.
- **Backward (Aqua → VIIRS-equivalent), 2003–2011:** `V_equiv(day) = Aqua cell-days(day) ÷ k_T2,m`. Band = 5th–95th percentile of the yearly values of `k_T2,m,y` across fit years. Always `kind = estimated`.
- **Not used (charter flaws):** MODIS `scan`/`track` as a predictor (only known when Aqua detected, so it leaks the outcome); 1.5 km pixel matching (tighter than MODIS pixels at the swath edge); the "Aqua detection within 100 km" in-view proxy (replaced by the ceiling `c`).
- **Sensitivity run (reported, not used):** `y = 1` if Aqua detected in the same cell **or one of its six neighbours**.

### SD-17 · When Tier 2 results may be shown
- `status = validated` only if all hold: the fit converged with `b > 0`; the band width of `p` at 10 MW is < 0.30; reliability error |Σp − observed| ÷ observed < 5 % on held-out years; Tier 2 leave-one-year-out weekly WAPE ≤ 1.10 × Tier 1's.
- Otherwise `status = exploratory`: the curve is drawn on the Methods page with that label, and every product uses Tier 1.
- **The trend verdict always uses Tier 1.** Tier 2 is the cross-check, the signature figure, and (when validated) the source of the `viirs_equiv` lens. When Tier 2 is not validated, `viirs_equiv` uses Tier 1 (`Aqua ÷ k_m`), labelled `estimated`.

---

## G. Validation suite (results published, good or bad)

| ID | Test | Owner | Metric | Read as |
|---|---|---|---|---|
| V1 | Leave one year out, forward: fit k without year Y (2013–2022), predict Aqua weekly cell-days from S-NPP | R3 | **WAPE** = Σ\|pred − obs\| ÷ Σ obs (headline), Pearson r, bias; baselines: raw VIIRS (k = 1) and annual-only k | lower than both baselines |
| V2 | Handoff: Aqua observed vs S-NPP × k, annual totals 2013–2022; and the size of the 2012 step in the naive index vs the translated-from-2012 index, relative to normal year-to-year change before 2012 | R3 | mean abs % difference; step ratios | note on the page that the totals match partly by construction |
| V3 | Satellite agreement: S-NPP × k vs NOAA-20 × k, weekly, overlap through 2025; direct vs chained k_noaa20 | R3 | WAPE, r, % difference | a few percent is expected (50-minute offset); > 15 % means investigate |
| V4 | **Drift diagnostic:** k_ann fitted separately for each year 2013–2025 | R3 | yearly k with range | flat to 2022, departing after: the evidence for SD-05 |
| V5 | Saturation: share of cells active per day in the peak week, res 5 vs res 6 | R3 | fraction | justifies SD-04 |
| V6 | Backcast: hide S-NPP in year Y, predict VIIRS weekly cell-days from Aqua | R3 (Tier 1), R4 (Tier 2) | WAPE | validates the `viirs_equiv` lens |
| V7 | **Planted truth:** run recovery checks only on explicitly fabricated unit inputs; local US observations are not planted truth | R4 + all | pass/fail per quantity | shown on the Methods page |
| V8 | Tier 1 vs Tier 2 forward, held-out years | R4 | WAPE between them | feeds SD-17 |

V2 uses `validation.step_window_years: 3` (R3-approved config extension; R3 coordinates R1):
compare the three calendar years beginning in the year of `eras.snpp_first_day` with the
three immediately preceding years. Report the `tier1.interval_percentiles` endpoints of
the same adjacent three-year/three-year ratio for every consecutive six-year window
from `eras.record_start` through the year before that splice. Missing annual totals
invalidate a comparison window; no missing year is replaced by zero. Both step notes
state: "totals match partly by construction; see LOYO". V1 and its annual-only baseline
refit every component, including the shrinkage target, without the held-out year.

V4 uses `validation.drift_bootstrap_b: 200` (R3-approved config extension; R3
coordinates R1), the configured `seed`, and `tier1.interval_percentiles`. Resample
observed calendar-week blocks within each year; sum their **unscaled** paired
counts before taking the annual Aqua/VIIRS ratio. This preserves the raw annual
ratio, including the longer final calendar week. Zero-VIIRS draws have undefined
ratios and are excluded from the percentile calculation. The scalar
`drift_summary.mean_k_fit_window` is the arithmetic mean of valid yearly **S-NPP**
ratios inside `tier1.snpp_fit`; `departure_pct_by_year` reports each later year's
percentage departure from that mean. NOAA-20 has separate sensor-labeled drift
entries from its first full year. These diagnostics never change calibration.
V5 requires an R2-attested US region-cell inventory; absent that input, report
null saturation with a reason, never use the union of detected cells as its
denominator. Average covered-day activity within the peak week per fit year,
then average those annual fractions. V6 uses V1's independently held-out factors
in reverse; zero factors give unavailable predictions rather than division by zero.

Rules: training and test years never mix; any split is by year. A result that looks too good is treated as a leak until proven otherwise. Use WAPE, not MAPE, as the headline (MAPE explodes on near-zero weeks).

---

## H. Wording locks

- A hotspot is a detection of heat in a pixel. Never call a count "number of fires".
- "24-year record" means 2003–2026. "23-year baseline" means 2003–2025. Do not mix them.
- Units are always written out: "fire cell-days", "Aqua-equivalent", "VIIRS-equivalent".
- Dates of satellite shutdowns and anomalies in any text come from `methods.json → sources`, each with a URL and a checked date.
