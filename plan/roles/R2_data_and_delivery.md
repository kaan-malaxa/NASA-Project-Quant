# R2 · Data Engineering, then Delivery

## 1. Your mission
**Saturday:** you get NASA's fire detections onto our laptops and turn them into clean, gridded, coverage-aware tables that the three science roles build on. You also lay the repo's foundations so six people on three operating systems run the same commands.
**Sunday:** once the data flows, you become the team's storyteller: README, slides, the 30-second video and the submission page.

Your first hour decides the schedule. **Archive requests go out before any code is written.**

## 2. You own / you never touch
- **Own:** `pyproject.toml`, `uv.lock`, root dotfiles (`.gitattributes`, `.gitignore`, `.editorconfig`, `.env.example`, `.python-version`, `CODEOWNERS`, `LICENSE`), `pipeline/__init__.py`, `pipeline/run.py`, `pipeline/common/`, `pipeline/config/` (except `science.yaml`), `pipeline/ingest/`, `data/` (local), `docs/`, `README.md`, `.github/workflows/pipeline.yml`.
- **Never touch:** `pipeline/harmonize/`, `pipeline/eyesight/`, `pipeline/synth/`, `pipeline/stats/`, `pipeline/export/`, `web/`, `contracts/`, `science.yaml`.

## 3. Inputs and outputs
| You read | From |
|---|---|
| FIRMS archive files, country CSVs, Area API (contracts §1 E1–E6) | NASA FIRMS |
| `data/raw/synthland/*.csv` (same format as FIRMS) | R4 |
| `pipeline/config/science.yaml` | R3 |

| You write | For | Contract |
|---|---|---|
| `pipeline/common/*` | R1, R3, R4 | §10 |
| `detections_{sensor}.parquet`, `filter_log.json` | yourself, R1 | §5.1, 5.17 |
| `celldays.parquet`, `coverage.parquet`, `hotspot_counts_daily.parquet`, `region_cells.parquet`, `static_mask.parquet` | R3, R4, R1 | §5.2–5.6 |
| `celldays_nrt.parquet`, `web/public/data/{region}/hotspots_recent.csv` (the one web file you write) | R1, R5 | §5.7, 6.12 |
| `MANIFEST.json` per region | R1 | §5.15 |
| `README.md`, `docs/slides/`, `docs/video/`, `docs/submission.md` | judges | — |

## 4. What the other five are doing
| Role | Doing | Touches you how |
|---|---|---|
| R1 | Schemas, sample data, calendar statistics, export | Uses `common/timebins.py` and `io.py` heavily. Gives you the numbers audit list for the video. |
| R3 | Tier 1 calibration and validation | First consumer of `celldays` and `coverage`. Owns `science.yaml`. Signs your numbers. |
| R4 | Simulator, eyesight curve | Their simulated raw CSVs are your first test input (ready about 18:00). Reads `celldays`. |
| R5 | Web app and deploy | Shows `hotspots_recent.csv`; needs the live URL in your README and slides. |
| R6 | Charts | Provides screenshots and the figure style for slides. |

## 5. Tools
`uv`, DuckDB (CSV → Parquet), pandas, `h3` v4, `requests`, pytest, ruff, GitHub Actions. Sunday: Marp (slides from Markdown), OBS Studio (screen recording), Shotcut or Kdenlive (editing), ffmpeg (burn-in subtitles), the GitHub CLI `gh` for release uploads. All free on Windows, Ubuntu and macOS.

## 6. Your timeline
| Gate | You deliver |
|---|---|
| Kickoff 16:00–16:30 | Archive requests submitted (by hand); MAP_KEY; country downloads started; `data_availability` saved |
| A · Sat 18:30 | Repo scaffold, `common/`, `run.py`, CI on three OSes, `regions.yaml` + polygons on main |
| B · Sat 23:00 | `ingest` passes on `synthland` and on real `conus` (one recent year first); data profile posted; overnight job running for the full `conus` record |
| C · Sun 10:00 | All three regions ingested; nowcast fetched; outages verified |
| D · Sun 14:00 | README draft, slide skeleton, `docs/submission.md` draft; hotspot archives (Should) |
| E · Sun 17:00 | Cross-OS reproducibility check done; video script filled from the audit list |
| 19:00 / 22:00 | Video recorded; project submitted |

## 7. Kickoff checklist (you, by hand, before any prompt)
1. Open `https://firms.modaps.eosdis.nasa.gov/download/`, sign in, and create archive requests **per region bbox** (contracts §4.1), **CSV**, for: MODIS (Collection 6.1) 2003-01-01 → today; VIIRS S-NPP 2012-01-20 → today; VIIRS NOAA-20 earliest available → today. Three requests (one per sensor) for `conus`.
2. Get a MAP_KEY at `https://firms.modaps.eosdis.nasa.gov/api/map_key/`; put it in `.env` as `FIRMS_MAP_KEY=…`. Send it privately to one backup teammate.
3. Open `https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/<MAP_KEY>/all` and save the result as `docs/data_availability_2026-11-14.csv`. Post in chat: first/last date of `MODIS_SP`, `MODIS_NRT`, `VIIRS_SNPP_SP`, `VIIRS_NOAA20_SP`, `VIIRS_NOAA20_NRT`.
4. Open `https://firms.modaps.eosdis.nasa.gov/country/` and check how the yearly country files are linked. Note the exact URL pattern for one MODIS and one VIIRS file.
5. When archive emails arrive, rename files to start with `modis_`, `viirs_snpp_` or `viirs_noaa20_` and place them in `data/raw/<region>/`.

## 8. Session primer (paste at the start of every AI session)
```text
You are assisting R2 on the FireRosetta project. Before doing anything, read these files fully:
- AGENTS.md
- plan/02_CONTRACTS.md (sections 1 to 5 and 10 are mine to implement)
- plan/03_SCIENCE_DECISIONS.md (SD-02, SD-03, SD-04, SD-08, SD-18, SD-19 matter most to me)
- plan/01_ARCHITECTURE.md sections 4, 6 and 7
- plan/roles/R2_data_and_delivery.md

I own only: root config files, pipeline/common/, pipeline/config/ (not science.yaml), pipeline/ingest/, pipeline/run.py,
docs/, README.md, .github/workflows/pipeline.yml. Never edit files elsewhere.
Everything must run unchanged on Windows 11, Ubuntu and macOS: pathlib, UTF-8, UTC, no shell scripts.
Never invent column names or satellite codes: inspect the real file header first and report what you find.
Reply first with a three-line restatement and the list of files you will create or change. Run the acceptance commands and
paste their real output. Finish with a five-line handoff note.
```

## 9. Prompts

### A1 · Repo scaffold and shared library (start 16:30, must be on main by 17:45)
```text
Task: create the Python side of the repository and the shared library, exactly as specified.

1. Root files: pyproject.toml (project "firerosetta", python >=3.11,<3.13, dependencies and dev dependencies exactly as
   listed in plan/01_ARCHITECTURE.md section 6.2; ruff config line-length 110; pytest testpaths ["pipeline"]),
   .python-version (3.11), .gitattributes ("* text=auto eol=lf" plus binary rules for parquet/png/woff2),
   .gitignore (data/, .env, .venv, node_modules, dist, __pycache__), .editorconfig, .env.example (FIRMS_MAP_KEY=),
   LICENSE (MIT), CODEOWNERS (from the ownership table in AGENTS.md; leave @handles as placeholders R1..R6).
2. pipeline/common/: paths.py, config.py, sensors.py, timebins.py, io.py, log.py, cli.py with the exact signatures in
   plan/02_CONTRACTS.md section 10. io.py holds one dict of parquet schemas transcribed from the section 5 table and
   enforces it on read and write. timebins.py implements SD-03 and SD-08 exactly.
3. pipeline/config/regions.yaml and outages.yaml exactly as in contracts section 4. Do not create science.yaml (R3 does);
   config.load_science() must give a clear error if it is missing.
4. pipeline/run.py: `python -m pipeline.run --region R [--from STAGE] [--to STAGE]` and `--all-regions`
   (all regions with synthetic false). Stage order: ingest, harmonize, eyesight, stats, then export once at the end.
   For a region with synthetic: true, run stage synth first (it writes the raw CSVs that ingest reads).
   Each stage runs as a subprocess of the current interpreter (sys.executable -m pipeline.<stage>). If a stage's module
   does not exist (importlib.util.find_spec is None) print "SKIP <stage>: not implemented yet" and continue.
   Stop on the first non-zero exit and report which stage failed.
5. .github/workflows/pipeline.yml: on push and pull_request touching pipeline/** or pyproject.toml; matrix
   ubuntu-latest, windows-latest, macos-latest; install uv; `uv sync`; `uv run ruff check pipeline`; `uv run pytest -q`.

Tests (pipeline/common/tests):
- week_of_year: Jan 1 -> 1, Dec 31 -> 52 in normal and leap years, day 357 -> 51, day 358 -> 52;
- aggregate: constant 2.0 daily -> 14.0 weekly for every week including 52; 3 nulls in a week -> missing; 2 nulls -> 14.0;
  month with 80% coverage is not missing, 79% is; year totals scale by covered fraction;
- local_day: 20:00 UTC at longitude 75 -> next day; 01:00 UTC at longitude -120 -> previous day;
- normalise_sensor: every alias in contracts section 4.4, and ValueError on "X";
- write_json: NaN raises, keys sorted, 3-decimal rounding; io schema check rejects a missing column;
- run.py with no stage modules present exits 0 and prints one SKIP line per stage (six for synthland, five for a real region).

Acceptance:
  uv sync
  uv run ruff check pipeline
  uv run pytest -q
  uv run python -m pipeline.run --region synthland
```

### A2 · Download helpers and region polygons (17:45–18:30, then leave downloads running)
```text
Task: implement pipeline/ingest/download.py and the region polygons.

download.py (`python -m pipeline.ingest.download --region R --via country|api [--years 2003:2025] [--sources ...]`):
- via country: for each year and each product in (modis, viirs-snpp, viirs-jpss1) download the yearly country CSV for the
  region's firms_country_names using the URL pattern I will give you (I checked it on the FIRMS country page:
  <PASTE THE PATTERN YOU NOTED AT KICKOFF>). Stream to disk, then immediately filter to the region bbox with DuckDB and
  save as data/raw/R/<modis|viirs_snpp|viirs_noaa20>_country_<year>.csv, deleting the unclipped file. Skip files that
  already exist. A 404 for a product-year is logged and skipped, not fatal.
- via api: loop the Area API in windows of 5 days (contracts E3) for the requested sources and date span, sleeping 1 s
  between calls, retrying 3 times with backoff, never printing the key; append to one CSV per source per year.
- Always update data/raw/R/MANIFEST.json (contracts 5.15) with rows, first/last date and sha256.

Region polygons: write a one-off script pipeline/ingest/make_region_polygons.py that reads a local copy of the Natural
Earth admin-1 GeoJSON (I will download it once; contracts E7), selects by name: conus = United States of America, every state except Alaska and Hawaii (the lower 48 plus the
District of Columbia); and writes
pipeline/config/regions/<id>.geojson as a FeatureCollection with one (Multi)Polygon feature, coordinates rounded to
3 decimals. Print each region's bbox so I can compare with regions.yaml. If a name does not match, list the candidate
names for that country and stop; do not guess.

Tests: bbox filter keeps boundary points; manifest is updated idempotently; api window generator covers a date span
with no gap or overlap (pure function, no network).

Acceptance:
  uv run pytest pipeline/ingest -q
  uv run python -m pipeline.ingest.download --region conus --via country --years 2023:2023     # real smoke test
```

### B1 · Clean (start 18:30; test on R4's synthland files first)
```text
Task: implement pipeline/ingest/clean.py, step "clean" of `python -m pipeline.ingest --region R`.

Before writing code: open one real MODIS file and one real VIIRS file from data/raw/conus/ (and the synthland files),
print their headers, the distinct values of satellite, instrument, version, confidence, daynight and type, and the
min/max acq_date. Paste that. If anything is not covered by contracts section 4.4, stop and tell me.

Then, with DuckDB reading the CSVs directly (all varchar first, cast explicitly):
- route files by name prefix (modis_, viirs_snpp_, viirs_noaa20_, nrt_viirs_noaa20_); product = NRT if the file prefix
  is nrt_ or the version value contains "NRT" or the type column is absent/null, else SP;
- normalise sensor and confidence (pipeline.common.sensors), build acq_datetime_utc from acq_date + zero-padded acq_time,
  local_day per SD-03, h3_r6/h3_r5/h3_r8 from latitude/longitude (h3 v4: latlng_to_cell);
- apply the SD-02 filters in order, logging rows_in/rows_dropped per step to data/clean/R/filter_log.json;
- rows without type: keep for now and mark type null (the static mask is applied in grid);
- drop exact duplicates on (sensor, latitude, longitude, acq_datetime_utc);
- in_region = h3_r6 is in the region's cell set (h3.geo_to_cells on the polygon at res 6; bbox polygon if none);
- write data/clean/R/detections_<sensor>.parquet for aqua, terra, snpp, noaa20 (contracts 5.1) via common.io;
- write data/clean/R/raw_daily_counts.parquet: sensor, utc_date, n_raw_rows (BEFORE any filter) for the coverage step.
Set DuckDB memory_limit 4GB and a temp directory under data/tmp.

Tests on a fabricated 12-row CSV pair: confidence 29 dropped and 30 kept; VIIRS "low" dropped, "n" and "High" kept;
type 2 dropped; a row at 20:30 UTC, longitude 75 lands on the next local day; duplicates collapse; unknown satellite
value raises; NRT rows keep type null.

Acceptance:
  uv run pytest pipeline/ingest -q
  uv run python -m pipeline.ingest --region synthland --steps clean
  uv run python -m pipeline.ingest --region conus --steps clean      # paste filter_log.json and the run time
```

### B2 · Grid, static mask, coverage
```text
Task: implement the "grid" step: static_mask.py, grid.py, coverage.py (contracts 5.2 to 5.6; SD-04, SD-08, SD-18).

- static mask: from SP rows of all sensors BEFORE the type filter (re-read raw type values during clean and save them to
  data/clean/R/static_candidates.parquet: h3_r8, n_static), cells with n_static >= 3, dilated by one ring
  (h3.grid_disk). Write static_mask.parquet. Then drop every detection with type null whose h3_r8 is in the mask,
  REWRITE detections_<sensor>.parquet without those rows (so every later reader sees fully filtered data), and
  append that step to filter_log.json.
- region_cells.parquet: h3_r6, h3_r5 (h3.cell_to_parent), lat, lon, metadata membership=polygon|bbox.
- celldays.parquet: group in_region detections by sensor, local_day, daynight, h3_r6 -> n_det, frp_sum, frp_max, h3_r5.
- hotspot_counts_daily.parquet: sensor, local_day, n_det_all (day + night).
- coverage.parquet: one row per sensor (aqua, terra, snpp, noaa20) per day from 2003-01-01 to the latest local_day in
  any sensor. covered=false with reason: before_start / after_end (from the sensor's first and last day in
  raw_daily_counts across ALL real regions present on disk, except snpp first day fixed by science.yaml);
  outage_list (outages.yaml); no_raw_rows (zero unfiltered rows for that sensor on that UTC date summed over all real
  regions on disk). For region synthland use only synthland's own counts. Otherwise covered=true, reason ok.

Tests (fabricated): two VIIRS pixels of one fire in one cell make one cell-day with n_det 2; a detection in a masked
r8 cell with type null is dropped but the same cell with type 0 is kept; an outage in outages.yaml produces
covered=false; a day with zero raw rows everywhere is no_raw_rows; days before the first data day are before_start.

Acceptance:
  uv run pytest pipeline/ingest -q
  uv run python -m pipeline.ingest --region synthland
  uv run python -m pipeline.ingest --region conus
Then post the data profile (prompt B3).
```

### B3 · Data profile (post in chat before Gate B)
```text
Task: write pipeline/ingest/profile.py (`python -m pipeline.ingest.profile --region R`) that prints, and saves to
docs/profile_<region>.md: rows per sensor per year; first and last local_day per sensor; share of rows that are NRT per
year; number of uncovered days per sensor by reason; number of region cells; n20_first_full_year (first calendar year
with NOAA-20 detections on >= 300 distinct days); the peak week by Aqua cell-days; file sizes. Run it for conus and
paste the output. R3 needs n20_first_full_year and the last Aqua and S-NPP days tonight.
```

### C1 · Nowcast fetch and recent hotspots (Sun 07:00)
```text
Task: implement pipeline/ingest/nowcast_fetch.py (`python -m pipeline.ingest.nowcast_fetch --region R --days 31`).

- Call the Area API (contracts E3) for VIIRS_NOAA20_NRT over the region bbox in 5-day windows covering the last 31 days;
  save the concatenated raw rows to data/raw/R/nrt_viirs_noaa20_<UTC date>.csv and update MANIFEST.json.
- Clean with the same functions as clean.py (filters SD-02, static mask SD-18, in_region), then write
  data/grid/R/celldays_nrt.parquet (contracts 5.7) with fetched_at, and
  web/public/data/R/hotspots_recent.csv with the header in contracts 6.12 (cleaned, in-region rows only).
- If the API fails after retries, exit non-zero and leave the previous files untouched.
- Never log the MAP_KEY; mask it in any printed URL.

Tests (no network; inject a fake fetch function): windows cover 31 days exactly once; an HTTP error keeps old files;
the CSV header matches the contract.

Acceptance:
  uv run pytest pipeline/ingest -q
  uv run python -m pipeline.ingest.nowcast_fetch --region conus
Run for all three regions at 07:15 and again at 18:00; tell R1 each time.
```

### C2 · Verify outages and external facts (Sun 08:00, 45 min, mostly reading)
```text
Task: help me verify facts; do not invent anything.
1. I will paste the content of the FIRMS missing_data page and any FIRMS notices I find. From them, update
   pipeline/config/outages.yaml: correct the seed dates, add missing outages for aqua, snpp and noaa20, add each URL.
   Remove any seed entry I could not confirm.
2. Draft the `sources` entries for R1's pipeline/export/methods_text.yaml (I will send them to R1): one entry per
   external claim used in our pitch: S-NPP end of fire data delivery; S-NPP July 2026 anomaly; Aqua free drift and
   crossing time; Aqua MODIS end of science; Space Apps submission rules. Each has claim_id, the exact sentence we will
   say, the URL, and today's date. If I did not give you a URL for a claim, mark it UNVERIFIED and I will cut it.
Re-run `python -m pipeline.ingest --region <each> --steps grid` after changing outages.yaml and tell R3.
```

### D1 · README, slides, submission text (Sun 10:00–14:00)
```text
Task: draft three documents from the repo itself. Use only numbers present in web/public/data/numbers_audit.md (ask me
to paste it); where a number is not there yet, leave the placeholder {{audit:<label>}}. Never write a number yourself.

1. README.md: one-paragraph pitch; live site and video links (placeholders); "What it answers" (three questions);
   how it works in five steps; the four proof points (drift-aware calibration, planted truth, two routes agree,
   verdict with ranges); how to run (uv sync; python -m pipeline.run --region synthland; cd web && npm ci && npm run dev);
   data sources with links (NASA FIRMS products used, Natural Earth, OpenFreeMap/OpenStreetMap attribution);
   limitations (copy from methods.json limitations); AI use statement (which assistants, for what, human review);
   team and roles; licence. No NASA logo.
2. docs/slides/deck.md in Marp format, exactly seven slides: title (team, members, challenge); the broken ruler;
   the ruler was bending too (drift chart); the product (verdict + calendar screenshots); proof (validation table,
   planted truth); who uses it (four users, Season Brief); data, next steps, QR code and links, closing line.
3. docs/submission.md: the Space Apps project page fields as plain text: title, high-level summary (<= 150 words),
   project details, NASA data used, space agency partner data (none), references, use of AI, links.

Acceptance: I read all three aloud once; every number has an {{audit:}} placeholder or matches the audit file.
```

### D2 · Yearly hotspot archives on GitHub Releases (Should; only if Gate C passed)
```text
Task: implement pipeline/ingest/hotspots_export.py (`python -m pipeline.ingest.hotspots_export --region R`), which writes
data/exports/hotspots_<region>_<sensor>_<year>.csv.gz from detections_<sensor>.parquet (in-region rows; columns as in
hotspots_recent.csv plus type and product) and prints a downloads.json fragment (contracts 6.12) with rows and bytes,
using the URL prefix I pass with --url-prefix. I will upload the files with `gh release create data-v1 data/exports/*`
and send the JSON to R1. Test: row counts equal the parquet's in-region counts for one sensor-year.
```

### E1 · Video script filled from the audit list (Sun 17:00)
```text
Task: fill docs/video/script.md. Six shots, 30 seconds total, with on-screen action, voice-over and subtitle text.
Shot order: (1) team name + broken ruler; (2) naive line jumps, "{{jump_multiple}} times"; (3) drift chart then the
harmonized line: "we calibrate only where the old satellite was steady, and prove it on a simulated world";
(4) pick the US (conus): verdict sentence (verbatim from trend.json) and the calendar; (5) this week: status sentence verbatim
from nowcast.json with its as_of date; (6) "Data: NASA FIRMS" + URL + QR.
Replace every placeholder with the exact value from web/public/data/numbers_audit.md that I paste. Count the words:
at most 75 spoken words. Also write docs/video/subtitles.srt with timings.
Then give me the ffmpeg command to burn the subtitles into video.mp4 that works on Windows, macOS and Linux.
```

### E2 · Cross-OS reproducibility (Sun 15:00, with one teammate on a different OS)
```text
Task: write pipeline/ingest/repro_check.py that prints the sha256 of every file under web/public/data and of each
region's celldays.parquet row count and value checksum (sum of n_det, sum of frp_sum rounded to 1 decimal).
Two of us will run `python -m pipeline.run --region conus` from the same raw files on different operating systems and
diff the outputs. If hashes differ, find the first differing file and the first differing value.
```

## 10. Standalone accuracy checks
| Check | Input | Expected |
|---|---|---|
| Week rule | every day of 2023 and 2024 | weeks 1–52 only; week 52 has 8 and 9 days |
| Local day | 20:30 UTC at 75°E | next calendar day |
| Filters | fabricated rows | exactly the rows listed in the test survive |
| Cell-day | two pixels, one cell, one day | one row, `n_det = 2` |
| Static mask | type-null row in a static cell | dropped |
| Coverage | planted outage in `synthland` (see `truth.json`) | those days `covered = false` |
| Planted truth | `synthland` | static sources removed; detections per sensor match `truth.json` counts within 1 % |
| Idempotence | run `ingest` twice | identical Parquet row counts and checksums |

## 11. Delivery checklist (Sunday)
- 18:00 final nowcast refresh → tell R1 → R1 regenerates → site redeploys.
- 19:00 record from the **live** site with OBS at 1920×1080; trim to ≤ 30.0 s; burn subtitles; upload as a public or unlisted link; open it logged-out.
- 21:00 paste `docs/submission.md` into the project page; test every link in a private window and on a phone.
- 22:00 submit; screenshot the confirmation into the team chat.
- Read the **2026** Project Submission Guide before recording (the limits we planned around come from the 2025 edition).

## 12. If things go wrong
- **No archive email by 19:00:** go with country files (already downloading); use `--via api` for 2026.
- **Country URL pattern is wrong:** download the United States years by hand from the country page tonight; fix the script after.
- **A region's clean step takes more than 20 minutes:** tighten the bbox to the polygon's bounds; if still slow, tell R1 so the region can be dropped.
- **API rate limit:** one pull per region at 07:15 and 18:00 only; the cached file is fine, the site shows `as_of`.
- **Unknown satellite code in a file:** do not map it by guess; print the distinct values and ask R3.
