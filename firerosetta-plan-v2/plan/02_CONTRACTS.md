# 02 · Contracts: every endpoint, input and output

**Version 1.0 · frozen at Gate A (Saturday 18:30).** After the freeze, a change needs R1's approval and a message to everyone whose folder reads or writes the file.

This file is the only place interfaces are defined. If your code needs something that is not here, stop and ask R1.

Contents: §1 external endpoints · §2 environment and secrets · §3 command-line entry points · §4 config files · §5 intermediate files (Parquet/JSON) · §6 website data files (JSON/CSV) · §7 website routes and URL parameters · §8 visualization component props · §9 shared enums · §10 shared Python library (`pipeline/common/`).

---

## 1. External endpoints (the only network calls in the project)

| # | Service | URL | Used by | When | Notes |
|---|---|---|---|---|---|
| E1 | FIRMS archive download | `https://firms.modaps.eosdis.nasa.gov/download/` | R2, by hand | Kickoff | Earthdata login or email code. Request per region bbox, per sensor, CSV. Files arrive by email. |
| E2 | FIRMS country yearly CSV | page `https://firms.modaps.eosdis.nasa.gov/country/` ; file pattern `https://firms.modaps.eosdis.nasa.gov/data/country/{product}/{YEAR}/{product}_{YEAR}_{Country}.csv` with `product` in `modis`, `viirs-snpp`, `viirs-jpss1` | R2 `download.py` | Kickoff, in parallel with E1 | **Confirm the pattern on the page before scripting.** No key. Clip to bbox immediately. |
| E3 | FIRMS Area API | `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{west,south,east,north}/{DAY_RANGE}/{YYYY-MM-DD}` | R2 `nowcast_fetch.py`, `download.py --via api` | Nowcast; gap filling | Returns `DATE … DATE + DAY_RANGE − 1`. **Use `DAY_RANGE ≤ 5`** (sources disagree on 5 vs 10). Limit 5 000 transactions per 10 minutes. Sleep 1 s between calls; retry 3× with backoff. |
| E4 | FIRMS data availability | `https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/{MAP_KEY}/all` | R2 | First hour | Tells you the first/last date of every source. Decides `n20_first_full_year` and whether `MODIS_NRT` still has Aqua. |
| E5 | FIRMS missing data | page `https://firms.modaps.eosdis.nasa.gov/api/missing_data/` | R2 | Saturday evening | Seeds `outages.yaml`. Exact path is on the page. |
| E6 | FIRMS MAP_KEY | `https://firms.modaps.eosdis.nasa.gov/api/map_key/` | R2 (and one backup person) | Kickoff | Free. Never committed. |
| E7 | Natural Earth admin-1 | `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson` | R2, once | Phase A | Public domain. Extract the region polygons, commit the small per-region files. Confirm the path; any Natural Earth mirror works. |
| E8 | Basemap style | `https://tiles.openfreemap.org/styles/liberty` | Browser (HexMap) | Runtime | Free, no key. **Progressive enhancement only:** the map must render outline + hexagons on a plain background if this fails. |
| E9 | GitHub Releases | `https://github.com/{org}/{repo}/releases/download/data-v1/{file}` | R2 uploads; browser links | Phase D | Hosts per-year hotspot CSV archives too large for git. Plain links, no fetch. |

`SOURCE` values we use for E3: `MODIS_SP`, `VIIRS_SNPP_SP`, `VIIRS_NOAA20_SP`, `VIIRS_NOAA20_NRT`. Check each with E4 first.

**The website makes no call to FIRMS.** Its only network reads are its own static files (§6) and, optionally, E8.

---

## 2. Environment and secrets

| Name | Where | Purpose |
|---|---|---|
| `FIRMS_MAP_KEY` | `.env` at repo root (git-ignored) or shell environment | E3, E4. Read only by `pipeline/ingest/`. |
| `FIREROSETTA_DATA_ROOT` | optional env var | Overrides the default `data/` folder (for people who keep raw files on another drive). |
| `VITE_BASE` | web build (CI sets it) | Base path for GitHub Pages, for example `/firerosetta/`. |

`.env.example` is committed with empty values. CI never needs the MAP_KEY: the nowcast is fetched on a laptop and its JSON is committed.

---

## 3. Command-line entry points

All run from the repo root, identically on Windows 11, Ubuntu and macOS. No shell scripts.

| Stage | Command | Owner | Reads | Writes |
|---|---|---|---|---|
| synth | `uv run python -m pipeline.synth --region synthland [--seed 7] [--size tiny\|full]` | R4 | `regions.yaml`, `science.yaml` | `data/raw/synthland/*.csv`, `data/raw/synthland/truth.json`, `MANIFEST.json` |
| download | `uv run python -m pipeline.ingest.download --region R [--via country\|api] [--years 2003:2025]` | R2 | E2/E3 | `data/raw/R/*.csv`, `MANIFEST.json` |
| ingest | `uv run python -m pipeline.ingest --region R [--steps clean,grid]` | R2 | `data/raw/R/` | §5.1–5.7 |
| nowcast fetch | `uv run python -m pipeline.ingest.nowcast_fetch --region R [--days 31]` | R2 | E3 | `data/raw/R/nrt_viirs_noaa20_{date}.csv`, §5.7, `web/public/data/R/hotspots_recent.csv` |
| harmonize | `uv run python -m pipeline.harmonize --region R` | R3 | §5.2–5.4 | §5.8–5.11 |
| eyesight | `uv run python -m pipeline.eyesight --region R` | R4 | §5.2, 5.3, 5.10 | §5.12–5.14 |
| stats | `uv run python -m pipeline.stats --region R` | R1 | §5.2, 5.5, 5.7, 5.8–5.14 | §6.2–6.12 |
| export | `uv run python -m pipeline.export [--sample] [--check]` | R1 | everything above | §6.1, 6.13, 6.14; `--check` validates every web file against `contracts/*.schema.json` and exits non-zero on any failure |
| all | `uv run python -m pipeline.run --region R [--from STAGE] [--to STAGE]` and `--all-regions` | R2 | — | Runs `ingest → harmonize → eyesight → stats`, then `export` once, as subprocesses (`synth` first for a synthetic region). **Skips a stage whose module is missing and says so**, so it works from day one. |

Common flags on every stage: `--region`, `--data-root` (default `data`), `--pass D|N` (default `D`), `--log-level`. Exit code 0 on success, non-zero with a one-line reason on failure. Every stage prints a final line `OK <stage> <region> rows=<n> seconds=<t>`.

Website commands (inside `web/`): `npm ci`, `npm run dev`, `npm run typecheck`, `npm run test`, `npm run build`, `npm run preview`, `npm run gen:types` (JSON Schema → TypeScript).

---

## 4. Config files

### 4.1 `pipeline/config/regions.yaml` (owner R2)
```yaml
regions:
  - id: punjab
    name: "Punjab and Haryana, India"
    country: IN
    firms_country_names: ["India"]          # for E2
    bbox: [73.8, 27.6, 77.6, 32.6]          # W,S,E,N — download only
    polygon: pipeline/config/regions/punjab.geojson
    fire_type: "Crop residue burning"
    story: "Farmers burn crop residue every April–May and October–November; the smoke reaches Delhi."
    synthetic: false
  - id: bc
    name: "British Columbia, Canada"
    country: CA
    firms_country_names: ["Canada"]
    bbox: [-139.1, 48.2, -114.0, 60.1]
    polygon: pipeline/config/regions/bc.geojson
    fire_type: "Forest wildfire"
    story: "Summer wildfire, including the record 2023 season."
    synthetic: false
  - id: litoral
    name: "Santa Fe and Entre Ríos, Argentina"
    country: AR
    firms_country_names: ["Argentina"]
    bbox: [-63.0, -34.5, -57.7, -27.9]
    polygon: pipeline/config/regions/litoral.geojson
    fire_type: "Wetland and pasture burning"
    story: "Paraná Delta wetland fires and pasture burning; a crisis in 2020–2022."
    synthetic: false
  - id: synthland
    name: "Synthland (planted-truth test)"
    country: ZZ
    bbox: [10.0, 10.0, 12.0, 12.0]
    polygon: null
    fire_type: "Simulated"
    story: "A simulated region where the right answer is known."
    synthetic: true
```

### 4.2 `pipeline/config/science.yaml` (owner R3) — every constant from `03_SCIENCE_DECISIONS.md`
```yaml
seed: 7
reference: {sensor: aqua, pass: D}
filters: {modis_min_confidence: 30, viirs_keep: [n, h]}
grid: {count_res: 6, map_res: 5, mask_res: 8}
eras: {record_start: "2003-01-01", aqua_trusted_through: "2022-12-31", snpp_through: "2025-12-31", snpp_first_day: "2012-01-20"}
tier1: {n0: 50, bootstrap_b: 500, snpp_fit: ["2013-01-01", "2022-12-31"], n20_min_fit_years: 3, monthly: true}
timebins: {week_min_covered_days: 5, month_min_covered_frac: 0.8, year_min_covered_frac: 0.9}
static_mask: {min_static_detections: 3, dilate_rings: 1}
climatology: {baseline_years: [2003, 2025], smooth_weeks: 3}
anomaly: {low_activity_threshold: 5, extreme_pct: 95, above_pct: 75, below_pct: 25}
season: {critical_share: 0.8, max_windows: 2, min_window_share: 0.15, extend_weeks: 4, min_year_celldays: 20}
trend: {years: [2003, 2025], bootstrap_b: 1000, artifact_gap_points: 10}
tier2: {fit: ["2013-01-01", "2022-12-31"], frp_floor_mw: 0.1, bootstrap_b: 200, max_band_at_10mw: 0.30, max_reliability_err: 0.05, max_wape_ratio_vs_t1: 1.10}
```

### 4.3 `pipeline/config/outages.yaml` (owner R2)
```yaml
# Seed list. R2 verifies each entry against FIRMS notices (E5) on Saturday evening and adds its URL.
outages:
  - {sensor: aqua,  start: "2020-08-16", end: "2020-09-02", note: "Aqua formatter anomaly", url: ""}
  - {sensor: snpp,  start: "2022-07-26", end: "2022-08-10", note: "S-NPP anomaly",          url: ""}
  - {sensor: snpp,  start: "2026-07-10", end: null,          note: "S-NPP non-nominal state; fire data ended 2026-11-02", url: ""}
```

### 4.4 Sensor name normalisation (`pipeline/common/sensors.py`, owner R2)
Raw `satellite`/`instrument` values vary by file source. Map them, case-insensitively; **raise an error on any unknown value** (never guess).

| Canonical `sensor` | Accept from MODIS files | Accept from VIIRS files |
|---|---|---|
| `aqua` | `A`, `Aqua` | — |
| `terra` | `T`, `Terra` | — |
| `snpp` | — | `N`, `NPP`, `Suomi-NPP`, `Suomi NPP`, `SNPP` |
| `noaa20` | — | `N20`, `NOAA-20`, `J1`, `1` |
| `noaa21` | — | `N21`, `NOAA-21`, `J2`, `2` (parsed, then dropped in v1) |

VIIRS `confidence` arrives as `l/n/h` or `low/nominal/high`: keep the first letter, lower-case. `acq_time` arrives as `HHMM` text or an integer: left-pad to four digits.

---

## 5. Intermediate files (pipeline ↔ pipeline)

All under `data/` (git-ignored). Parquet with zstd compression. Dates are `date32`; timestamps are UTC without time zone. Paths come from `pipeline/common/paths.py`; never build a path by hand.

| # | Path | Writer → readers | Columns |
|---|---|---|---|
| 5.1 | `data/clean/{region}/detections_{sensor}.parquet` (`sensor` in aqua, terra, snpp, noaa20) | R2 → R2 | `latitude f64, longitude f64, acq_datetime_utc ts, local_day date, daynight str(D/N), frp f32, confidence_raw str, scan f32, track f32, sensor str, product str(SP/NRT), type i8 null, h3_r6 str, h3_r5 str, h3_r8 str, in_region bool`. Only rows that passed SD-02. |
| 5.2 | `data/grid/{region}/celldays.parquet` | R2 → R3, R4, R1 | `sensor str, local_day date, daynight str, h3_r6 str, h3_r5 str, n_det i32, frp_sum f32, frp_max f32`. One row per sensor × cell × day × pass. `in_region` rows only. |
| 5.3 | `data/grid/{region}/coverage.parquet` | R2 → R3, R4, R1 | `sensor str, local_day date, covered bool, reason str` with `reason` in `ok, before_start, after_end, outage_list, no_raw_rows`. One row per sensor per day from 2003-01-01 to the last data day. |
| 5.4 | `data/grid/{region}/hotspot_counts_daily.parquet` | R2 → R3 | `sensor str, local_day date, n_det_all i32` (day + night, SD-02 applied, in region). For the naive series. |
| 5.5 | `data/grid/{region}/region_cells.parquet` | R2 → R1, R4 | `h3_r6 str, h3_r5 str, lat f64, lon f64` and file metadata `membership = polygon\|bbox`. |
| 5.6 | `data/grid/{region}/static_mask.parquet` | R2 → R2 | `h3_r8 str`. |
| 5.7 | `data/grid/{region}/celldays_nrt.parquet` | R2 → R1 | Same columns as 5.2 plus `fetched_at ts`. NOAA-20 near-real-time, last 31 days. |
| 5.8 | `data/harmonized/{region}/daily.parquet` | R3 → R1, R4 | `local_day date, series str, value f64 null, lo f64 null, hi f64 null, kind str, source str, covered bool`. Series list below. One row per series per day, 2003-01-01 → last data day. |
| 5.9 | `data/harmonized/{region}/annual_bootstrap.parquet` | R3 → R1 | `replicate i32 (0..499), year i32, harmonized f64`. |
| 5.10 | `data/harmonized/{region}/calibration.json` | R3 → R1, R4, web | Same shape as §6.11. |
| 5.11 | `data/harmonized/{region}/validation_t1.json` and `naive_annual.parquet` | R3 → R1 | JSON: `{"validation":[ValidationRow…], "drift":[{"year","sensor","k_annual","lo","hi"}], "drift_summary":{"mean_k_fit_window", "departure_pct_by_year":{…}}}` (ValidationRow in §6.13; saturation results are ValidationRows). Parquet: `year i32, modis_count f64, snpp_count f64, modis_covered_frac f64, snpp_covered_frac f64`. |
| 5.12 | `data/eyesight/{region}/curve.json` | R4 → R1 | The `eyesight` entry of §6.13 for this region. |
| 5.13 | `data/eyesight/{region}/daily_t2.parquet` | R4 → R1 | Same columns as 5.8. Series: `harmonized_t2`, `viirs_equiv_t2`. |
| 5.14 | `data/eyesight/{region}/validation_t2.json` | R4 → R1 | `{"validation":[ValidationRow…]}`. |
| 5.15 | `data/raw/{region}/MANIFEST.json` | R2, R4 → R1 | `[{"file","source","via","downloaded_at","rows","sha256","first_date","last_date"}]`. |
| 5.16 | `data/raw/synthland/truth.json` | R4 → everyone's tests, R1 | Planted parameters and expected answers (see R4's document). |
| 5.17 | `data/clean/{region}/filter_log.json` | R2 → R1 | `[{"sensor","step","rows_in","rows_dropped"}]`. |
| 5.18 | `data/clean/{region}/raw_daily_counts.parquet`, `static_candidates.parquet` | R2 → R2 (internal) | `sensor str, utc_date date, n_raw_rows i64` (before any filter; feeds coverage) and `h3_r8 str, n_static i32` (feeds the static mask). |
| 5.19 | `data/harmonized/{region}/figures/*.png`, `data/eyesight/{region}/figures/*.png` | R3, R4 → R2 | Diagnostic figures for slides and the README. R2 copies the ones used into `docs/figures/`. |

**Raw file naming** (`data/raw/{region}/`): the file name must start with the source so `clean` can route it: `modis_*.csv`, `viirs_snpp_*.csv`, `viirs_noaa20_*.csv`, `nrt_viirs_noaa20_*.csv`. Rename emailed archive files on arrival.

**Series in 5.8 `daily.parquet`** (unit: fire cell-days per day, res 6, daytime):

| series | Meaning | kind |
|---|---|---|
| `aqua_raw` | Aqua observed, whole Aqua lifetime | observed / missing |
| `snpp_raw`, `noaa20_raw` | each VIIRS observed | observed / missing |
| `viirs_raw` | primary VIIRS: S-NPP through 2025-12-31, NOAA-20 after | observed / missing |
| `snpp_as_aqua`, `noaa20_as_aqua` | each VIIRS × its k (SD-07), every covered day of that sensor | harmonized / missing |
| `viirs_as_aqua` | primary VIIRS × k for the whole VIIRS era (the overlay that proves the translation) | harmonized / missing |
| `harmonized` | SD-05: Aqua through 2022-12-31, translated VIIRS after, with fallback | observed / harmonized / missing |
| `viirs_equiv_t1` | VIIRS-equivalent: `aqua_raw ÷ k_m` for 2003-01-01 → 2012-01-19 (estimated), `viirs_raw` after (observed) | estimated / observed / missing |

`source` holds the sensor actually used that day (`aqua`, `snpp`, `noaa20`).

---

## 6. Website data files (pipeline → web)

All under `web/public/data/`. **Only R1's code writes here, with one exception: `{region}/hotspots_recent.csv` is written by R2's nowcast fetch. Only R1 commits this folder** (R2 tells R1 after each fetch). Each file validates against `contracts/{name}.schema.json`. Numbers are rounded to 3 decimals. Every object that reaches the screen carries `kind`. A missing value is JSON `null`, never 0.

Every JSON file starts with: `"schema_version": "1.0", "generated_at": "<UTC ISO>", "code_version": "<git sha or 'sample'>"`.

Static URL of every file: `{BASE}data/<path>` (so `GET {BASE}data/punjab/weekly.json`).

### 6.1 `regions.json`
```json
{"schema_version":"1.0","generated_at":"…","code_version":"…",
 "regions":[{"id":"punjab","name":"Punjab and Haryana, India","country":"IN",
   "bbox":[73.8,27.6,77.6,32.6],"centroid":[75.7,30.1],
   "fire_type":"Crop residue burning","story":"…","n_cells_r6":5600,
   "membership":"polygon","last_data_day":"2026-11-13","synthetic":false,
   "files":["weekly","monthly","daily","climatology","season","trend","ruler","nowcast","hex","calibration","outline"],
   "optional_files":["cells_monthly","downloads","hotspots_recent"]}]}
```
`files` lists what exists for that region; the web hides a section whose file is absent. `synthetic: true` regions are hidden unless the URL has `?debug=1`.

### 6.2 `{region}/weekly.json`
```json
{"schema_version":"1.0","region":"punjab",
 "series_meta":{
   "aqua_raw":{"label":"MODIS Aqua, as recorded","unit":"fire cell-days per week"},
   "viirs_raw":{"label":"VIIRS, as recorded","unit":"fire cell-days per week"},
   "viirs_as_aqua":{"label":"VIIRS translated to the Aqua scale","unit":"Aqua-equivalent fire cell-days per week"},
   "harmonized":{"label":"Harmonized record","unit":"Aqua-equivalent fire cell-days per week"},
   "viirs_equiv":{"label":"What VIIRS would have seen","unit":"VIIRS-equivalent fire cell-days per week","method":"tier1"}},
 "rows":[{"year":2015,"week":43,"series":"harmonized","value":812.0,"lo":812.0,"hi":812.0,"kind":"observed","source":"aqua"}]}
```
- `series` is one of `aqua_raw, viirs_raw, viirs_as_aqua, harmonized, viirs_equiv`.
- `viirs_equiv` comes from Tier 2 when `eyesight.status == "validated"`, else Tier 1; `series_meta.viirs_equiv.method` says which (`tier1` or `tier2`).
- One row per series × year × week (1–52) from 2003. Weeks in the future are omitted.
- The "naive splice" lens is built in the browser: `aqua_raw` before 2012, `viirs_raw` from 2012.

### 6.3 `{region}/monthly.json`
Same as 6.2 with `"month": 1–12` instead of `week`, and units "… per month".

### 6.4 `{region}/daily.json` (columnar, for date-range analytics and CSV export)
```json
{"schema_version":"1.0","region":"punjab","start":"2003-01-01","n_days":8718,
 "series":{
   "harmonized":{"unit":"Aqua-equivalent fire cell-days per day","value":[0,2.0,null],"lo":[0,2.0,null],"hi":[0,2.0,null]},
   "aqua_raw":{"unit":"fire cell-days per day","value":[0,2,null]},
   "viirs_raw":{"unit":"fire cell-days per day","value":[null,null,null]}},
 "kind_runs":[{"series":"harmonized","from":"2003-01-01","to":"2022-12-31","kind":"observed","source":"aqua"},
              {"series":"harmonized","from":"2023-01-01","to":"2025-12-31","kind":"harmonized","source":"snpp"},
              {"series":"harmonized","from":"2026-01-01","to":"2026-11-13","kind":"harmonized","source":"noaa20"}]}
```
Index `i` is day `start + i`. `null` means missing (`kind: missing` overrides the run).

### 6.5 `{region}/climatology.json`
```json
{"schema_version":"1.0","region":"punjab","baseline_years":[2003,2025],
 "unit_week":"Aqua-equivalent fire cell-days per week","unit_month":"Aqua-equivalent fire cell-days per month",
 "weeks":[{"week":1,"min":0,"p10":0,"p25":0,"p50":0,"p75":0,"p90":0,"max":0,"n_years":23}],
 "months":[{"month":1,"min":0,"p10":0,"p25":0,"p50":0,"p75":0,"p90":0,"max":0,"n_years":23}]}
```

### 6.6 `{region}/season.json`
```json
{"schema_version":"1.0","region":"punjab",
 "definition":"The fewest weeks that hold 80% of a typical year's burning",
 "critical_weeks":[17,18,19,42,43,44,45,46],
 "windows":[{"id":"w1","label":"mid-October to mid-November","start_week":42,"peak_week":44,"end_week":46,"share":0.71,
   "by_year":[{"year":2003,"start_doy":288,"centroid_doy":304,"end_doy":322,"total":1234.0,"kind":"observed"}],
   "shift_days_per_decade":{"start":{"value":0,"lo":0,"hi":0},"centroid":{"value":0,"lo":0,"hi":0},"end":{"value":0,"lo":0,"hi":0}},
   "sentence":"…"}]}
```
`windows` has 1 or 2 entries, ordered by `share` descending.

### 6.7 `{region}/trend.json`
```json
{"schema_version":"1.0","region":"punjab","years":[2003,2025],
 "annual":[{"year":2003,"harmonized":1234.0,"lo":1234.0,"hi":1234.0,"kind":"observed","naive_count":5678.0,"naive_source":"modis"}],
 "harmonized":{"pct_per_decade":0,"lo":0,"hi":0,"direction":"no_clear_change"},
 "naive":{"pct_per_decade":0,"lo":0,"hi":0,"direction":"rising"},
 "robustness":[{"variant":"aqua_only_2003_2022","pct_per_decade":0,"lo":0,"hi":0,"direction":"no_clear_change"},
               {"variant":"translated_from_2012","pct_per_decade":0,"lo":0,"hi":0,"direction":"no_clear_change"}],
 "sentence_id":"artifact_flat","sentence":"…"}
```

### 6.8 `{region}/ruler.json`
```json
{"schema_version":"1.0","region":"punjab","index_base_years":[2003,2011],
 "jump_multiple":{"value":0,"lo":0,"hi":0,"years":[2013,2022],
   "definition":"Mean yearly S-NPP VIIRS hotspot count divided by mean yearly MODIS (Terra + Aqua) hotspot count, same years, same place"},
 "rows":[{"year":2003,"naive_index":1.0,"harmonized_index":1.0,"naive_source":"modis","kind":"observed"}],
 "sentence":"…"}
```

### 6.9 `{region}/nowcast.json`
```json
{"schema_version":"1.0","region":"punjab","as_of":"2026-11-15T12:00:00Z","source":"VIIRS_NOAA20_NRT",
 "window":{"start":"2026-11-08","end":"2026-11-14","days_covered":7},
 "value":0,"lo":0,"hi":0,"unit":"Aqua-equivalent fire cell-days per 7 days",
 "percentile":0,"status":"normal","baseline_years":[2003,2025],
 "history":[{"year":2003,"value":0,"kind":"observed"}],
 "month_to_date":{"month":11,"through_day":14,"value":0,"median":0,"ratio":null,"percentile":0},
 "kind":"harmonized","input_note":"Near-real-time input; calibration fitted on science-quality data.","sentence":"…"}
```

### 6.10 `{region}/hex.json`
```json
{"schema_version":"1.0","region":"punjab","resolution":5,
 "unit":"VIIRS fire cell-days per year","source":"snpp","years":[2013,2025],"kind":"observed",
 "cells":[{"h3":"85…","critical":12.3,"all_year":20.1}]}
```
`critical` = mean yearly count of res-6 fire cell-days inside the res-5 cell during the critical weeks; `all_year` = the same over the whole year.

### 6.11 `{region}/calibration.json`
```json
{"schema_version":"1.0","region":"punjab","reference":"aqua_day","count_resolution":6,"shrinkage_n0":50,
 "eras":[{"from":"2003-01-01","to":"2022-12-31","source":"aqua","kind":"observed"},
         {"from":"2023-01-01","to":"2025-12-31","source":"snpp","kind":"harmonized"},
         {"from":"2026-01-01","to":null,"source":"noaa20","kind":"harmonized"}],
 "fit_window":{"snpp":["2013-01-01","2022-12-31"],"noaa20":["2019-01-01","2022-12-31"]},
 "noaa20_method":"direct",
 "k_annual":{"snpp":{"k":0.5,"lo":0.45,"hi":0.55},"noaa20":{"k":0.5,"lo":0.45,"hi":0.55}},
 "k":{"snpp":[{"month":1,"k":0.5,"lo":0.4,"hi":0.6,"aqua_celldays":123,"viirs_celldays":246}],
      "noaa20":[{"month":1,"k":0.5,"lo":0.4,"hi":0.6,"aqua_celldays":60,"viirs_celldays":120}]}}
```

### 6.12 Optional per-region files
- `{region}/outline.geojson` — the region polygon (FeatureCollection, one feature).
- `{region}/cells_monthly.csv` — area-of-interest lens. Header `h3_r5,ym,aqua,viirs`. `ym` = `YYYYMM`; `aqua` = Aqua daytime res-6 fire cell-days inside that res-5 cell that month; `viirs` = the same for the primary VIIRS. Rows with both zero are omitted.
- `{region}/hotspots_recent.csv` — last 31 days of cleaned NOAA-20 near-real-time detections. Header `latitude,longitude,acq_date,acq_time,satellite,confidence,frp,daynight,local_day,h3_r6`.
- `{region}/downloads.json` — `{"schema_version":"1.0","region":"punjab","hotspot_archives":[{"year":2024,"sensor":"snpp","url":"https://…/hotspots_punjab_snpp_2024.csv.gz","rows":0,"bytes":0}]}`.

### 6.13 `methods.json` (one file, all regions)
```json
{"schema_version":"1.0","generated_at":"…","code_version":"…",
 "decisions":{"reference":"MODIS Aqua, daytime","count_resolution":6,"aqua_trusted_through":"2022-12-31",
              "snpp_through":"2025-12-31","baseline_years":[2003,2025],"science_yaml_sha256":"…"},
 "validation":[{"region":"punjab","test":"loyo_weekly_wape","method":"tier1","value":0,
                "baselines":{"raw_viirs":0,"annual_ratio":0},"n":520,"years":[2013,2022],"note":""}],
 "drift":[{"region":"punjab","sensor":"snpp","year":2013,"k_annual":0.5,"lo":0.45,"hi":0.55}],
 "eyesight":[{"region":"punjab","status":"validated","params":{"a":0,"b":0,"c":0,"a_lo":0,"a_hi":0,"b_lo":0,"b_hi":0,"c_lo":0,"c_hi":0},
              "g":1.0,"n_celldays":0,"curve":[{"frp_mw":1,"p":0,"lo":0,"hi":0}],
              "binned":[{"frp_mw":1,"p_obs":0,"n":0}],
              "k_compare":[{"month":1,"k_tier1":0.5,"k_tier2":0.5}]}],
 "planted_truth":[{"quantity":"k_annual_snpp","truth":0.5,"recovered":0.49,"tolerance":0.03,"pass":true}],
 "inputs":[{"source":"MODIS_SP","region":"punjab","rows":0,"first_date":"…","last_date":"…","downloaded":"…","via":"archive"}],
 "filters":[{"region":"punjab","sensor":"aqua","step":"confidence","rows_in":0,"rows_dropped":0}],
 "sources":[{"claim_id":"snpp_end","text":"…","url":"…","checked":"2026-11-15"}],
 "limitations":["…"],"ai_use":"…"}
```
**ValidationRow** = `{"region","test","method","value","baselines"?,"n","years","note"}` with `method` in `tier1, tier2, none` and `test` in:
`loyo_weekly_wape, loyo_weekly_r, loyo_bias, handoff_annual_mape, step_naive, step_harmonized, sat_agreement_wape, k_direct_vs_chained_pct, backcast_weekly_wape, t1_t2_wape, reliability_err, saturation_r5, saturation_r6`.

`eyesight[].status` is `validated`, `exploratory` or `absent`.

`sources[].claim_id` uses these fixed ids so the web and the pitch can look them up: `snpp_end`, `snpp_anomaly_2026`, `aqua_drift`, `aqua_end_science`, `submission_rules`. A claim without a verified URL is left out of the file and therefore out of the pitch.

Also written next to `methods.json`: `numbers_audit.md` (every headline number with its JSON path; produced by `python -m pipeline.export.audit`).

### 6.14 `manifest.json`
`{"schema_version":"1.0","generated_at":"…","code_version":"…","contains_sample":false,"files":[{"path":"punjab/weekly.json","sha256":"…","bytes":0,"kinds":["observed","harmonized","missing"]}]}`. The website shows the **SAMPLE DATA** banner when `contains_sample` is true or any loaded row has `kind: "sample"`.

---

## 7. Website routes and URL parameters

Hash routing (works on GitHub Pages without server rules).

| Route | Screen | Data files |
|---|---|---|
| `#/` | 1 · The broken ruler (landing) | `regions`, `{default}/ruler` |
| `#/pick` | 2 · Place picker | `regions`, each `outline` |
| `#/r/:region` | Region story: 3 verdict · 4 calendar · 5 critical weeks · 6 this week · 7 where | `ruler, trend, weekly, monthly, daily, climatology, season, nowcast, hex, calibration, outline` (+ optional) |
| `#/r/:region/brief` | 8 · Season Brief (print layout) | same as above |
| `#/methods` | 9 · Methods and honesty | `methods`, `manifest` |
| `#/gallery` | Component gallery (development only) | sample data |

Query parameters on `#/r/:region` (all optional, all reflected in the URL so a view can be shared):

| Param | Values | Default |
|---|---|---|
| `from`, `to` | `YYYY-MM-DD` | `2003-01-01`, last data day |
| `lens` | `harmonized`, `aqua_raw`, `viirs_raw`, `naive_splice`, `viirs_as_aqua`, `viirs_equiv` | `harmonized` |
| `view` | `clock`, `weeks`, `months` | `clock` |
| `mode` | `activity`, `anomaly` | `activity` |
| `aoi` | comma-separated res-5 H3 indexes | none (whole region) |
| `debug` | `1` | off |

Downloads offered on `#/r/:region` (the challenge's "download analytics and visualizations"):
1. **Series CSV** for the selected range and lens, built in the browser from `daily.json`: columns `date,series,value,lo,hi,kind,source,unit`.
2. **Calendar CSV**: the month × year or week × year table on screen.
3. **Chart image**: PNG and SVG of the current chart.
4. **Hotspot CSV**: `hotspots_recent.csv` (last 31 days) and, when `downloads.json` exists, links to the yearly archives overlapping the selected range.
5. **Season Brief**: print to PDF.

---

## 8. Visualization components (R6 builds, R5 uses)

Exported from `web/src/viz/index.ts`. Pure presentational React components: props in, SVG/canvas out. **No fetching, no routing, no global state inside `viz/`.** Types come from `web/src/data/types.gen.ts`.

```ts
type SeriesId = "harmonized" | "aqua_raw" | "viirs_raw" | "naive_splice" | "viirs_as_aqua" | "viirs_equiv";
type DateRange = { from: string; to: string };            // YYYY-MM-DD
type CellRef = { year: number; week?: number; month?: number };

BrokenRuler      (props: { ruler: RulerJson; animate?: boolean })
FireYearClock    (props: { weekly: WeeklyJson; climatology: ClimatologyJson; season?: SeasonJson; lens: SeriesId;
                           mode: "activity" | "anomaly"; range: DateRange; currentYear: number;
                           onSelect?: (c: CellRef) => void })
CalendarHeatmap  (props: { grain: "week" | "month"; weekly?: WeeklyJson; monthly?: MonthlyJson;
                           climatology: ClimatologyJson; season?: SeasonJson; lens: SeriesId;
                           mode: "activity" | "anomaly"; range: DateRange; onSelect?: (c: CellRef) => void })
SeasonShiftChart (props: { season: SeasonJson })
TrendBars        (props: { trend: TrendJson })
PercentileStrip  (props: { nowcast: NowcastJson })
HexMap           (props: { hex: HexJson; outline?: GeoJSON.FeatureCollection; metric: "critical" | "all_year";
                           selectedCells?: string[]; drawEnabled?: boolean;
                           onAoiChange?: (cellsR5: string[]) => void })
EyesightCurve    (props: { eyesight: MethodsJson["eyesight"][number] })
DriftChart       (props: { drift: MethodsJson["drift"]; region: string; trustedThrough: string })
KindBadge        (props: { kind: Kind })
Legend           (props: { scale: "activity" | "anomaly"; unit: string })
Gallery          (props: {})                                    // development page, mounted by R5 at #/gallery

percentileRank(value: number, others: number[]): number        // SD-11 formula; the only statistics helper viz exports
```

Shared behaviour for every chart: renders with a `ref` to its root `<svg>` (for export); respects `prefers-reduced-motion`; every data mark has an accessible name; `kind: missing` is hatched, `estimated` is dashed and lighter, `sample` shows nothing special (the banner is R5's).

---

## 9. Shared enums

| Enum | Values |
|---|---|
| `kind` | `observed`, `harmonized`, `estimated`, `missing`, `sample` |
| `sensor` | `aqua`, `terra`, `snpp`, `noaa20`, `noaa21` |
| `status` (nowcast) | `unavailable`, `low_activity`, `below_normal`, `normal`, `above_normal`, `extreme` |
| `direction` (trend) | `rising`, `falling`, `no_clear_change` |
| `sentence_id` | `artifact_flat`, `artifact_rising`, `artifact_falling`, `agree`, `unclear` |
| `eyesight.status` | `validated`, `exploratory`, `absent` |
| `membership` | `polygon`, `bbox` |
| stage names | `synth`, `download`, `ingest`, `harmonize`, `eyesight`, `stats`, `export` |

---

## 10. Shared Python library `pipeline/common/` (owner R2, used by R1, R3, R4)

The only Python code shared between stages. Its function signatures are part of the contract and are frozen at Gate A.

```python
# paths.py — the single source of file locations (honours --data-root and FIREROSETTA_DATA_ROOT)
data_root() -> Path
raw_dir(region) -> Path;  clean_dir(region) -> Path;  grid_dir(region) -> Path
harmonized_dir(region) -> Path;  eyesight_dir(region) -> Path
web_data_dir(region: str | None = None) -> Path          # web/public/data[/region]
detections(region, sensor) -> Path;  celldays(region) -> Path;  coverage(region) -> Path   # ...one function per file in section 5

# config.py
load_regions() -> list[Region]          # dataclass: id, name, country, bbox, polygon, fire_type, story, synthetic, firms_country_names
get_region(region_id) -> Region
load_science() -> dict                  # parsed science.yaml, read-only
region_centroid(region) -> tuple[float, float]   # lon, lat

# sensors.py
normalise_sensor(raw_value: str, family: Literal["modis", "viirs"]) -> str      # raises ValueError on unknown
normalise_viirs_confidence(raw) -> Literal["l", "n", "h"]

# timebins.py — SD-03 and SD-08, nothing else may implement these rules
local_day(acq_datetime_utc, longitude) -> date                      # vectorised over pandas Series too
week_of_year(d: date) -> int                                        # min(52, (doy-1)//7 + 1)
days_in_week(year: int, week: int) -> int                           # 7, or 8/9 for week 52
aggregate(daily: DataFrame, grain: Literal["week", "month", "year"],
          value_cols: Sequence[str] = ("value", "lo", "hi")) -> DataFrame
    # input: one row per local_day with value columns (null = not covered) and optional kind, source
    # output: year, week|month (absent for "year"), the value columns coverage-scaled per SD-08,
    #         n_days, n_covered, missing (bool), kind (majority of covered days), source (majority)
doy_window(daily: DataFrame, end_doy: int, n_days: int, year: int,
           value_cols: Sequence[str] = ("value",)) -> dict        # coverage-scaled sum of an n-day window ending at end_doy

# io.py
write_parquet(df, path, schema_name: str) -> None       # checks columns and dtypes against the section-5 table, zstd
read_parquet(path, schema_name: str) -> DataFrame       # same check on read
write_json(obj, path) -> None                           # sorted keys, 3-decimal rounding, UTF-8, trailing newline, NaN -> error
code_version() -> str                                   # short git sha, or "unknown"

# log.py
get_logger(stage: str) -> logging.Logger
finish(stage: str, region: str, rows: int, t0: float) -> None       # prints "OK <stage> <region> rows=<n> seconds=<t>"
```

Every stage's `__main__` uses the same argument parser helper: `common.cli.stage_parser(stage_name)` returning `--region`, `--data-root`, `--pass`, `--log-level`.
