# 01 · Architecture and Implementation Plan

> Integration repair supersedes the original multi-region and TypeScript-runtime plans: whole United States (Alaska and Hawaii included), plus synthetic validation; JavaScript with generated declarations; selectable complete analysis years and separate exact dates. See `02_CONTRACTS.md` and `REQUIREMENTS_MATRIX.md`.


FireRosetta · NASA Space Apps 2026 · Harmonization of MODIS and VIIRS Hot Spots
Plan v2, written Saturday 14 Nov 2026, 15:30 EST. Submission closes Sunday 15 Nov, 23:59 local; we submit by 22:00.

This plan replaces the Draft v1 charter's Architecture, Science method, Scope, Team and Timeline sections. The Mission, user table and pitch ideas from the charter still stand, with the corrections listed in `REPORTS.md`.

Companion files: `02_CONTRACTS.md` (every interface), `03_SCIENCE_DECISIONS.md` (every scientific choice, locked), `roles/R1…R6` (one per person, with pre-built prompts), `REPORTS.md` (research, contradiction log, report templates), `AGENTS.md` at the repo root (binding rules for AI assistants).

---

## 1. What we are building

One static website backed by an offline Python pipeline.

```
                          OFFLINE (laptops)                                   ONLINE (static)
 FIRMS archive ─┐
 FIRMS country ─┼─► [ingest R2] ─► celldays ─┬─► [harmonize R3] ─► daily.parquet ─┐
 FIRMS API ─────┘     clean, grid,           │      Tier 1 k, validation          ├─► [stats + export R1] ─► web/public/data/*.json ─► [web app R5]
                      coverage, mask         └─► [eyesight R4] ─► daily_t2 ───────┘      calendar, trend,                               uses
 [synth R4] ─► planted-truth raw CSVs ─► (same path, region "synthland")                 season, nowcast,                          [viz components R6]
                                                                                         methods.json
```

- **No server, no database, no key in the browser.** The site reads only its own JSON files.
- **Each arrow is a file with a fixed schema** (`02_CONTRACTS.md`). People depend on files, never on each other's code.
- **A simulated region with a known answer (`synthland`) flows through the same pipeline.** It gives everyone data in the first two hours and gives the Methods page a planted-truth test.

### How we stand out (corrected positioning)
The charter said nobody else uses detection physics. That is no longer true: at least one public team repo fits a MODIS detection-probability curve by fire strength. Dozens of teams build a calendar with a ratio correction. Our edge is **proof**, in four parts a judge can check in two minutes:

1. **The ruler was bending too.** Aqua's orbit has drifted since 2022, so "calibrate on the 2012-to-present overlap", which most teams do, bakes in a moving target. We calibrate only where Aqua was stable and show the drift in one chart.
2. **Planted truth.** We run the whole method on a simulated world where we know the right answer and publish whether it recovers it.
3. **Two independent routes agree.** The empirical monthly ratio (Tier 1) and the ratio predicted by the eyesight curve (Tier 2) are plotted against each other.
4. **The question people actually ask.** "Is it really burning more, or did the satellite get better eyes?" answered per place, with a range, and with a sentence that changes when the evidence is unclear.

Plus the three-satellite handoff (Aqua → S-NPP → NOAA-20) that is happening this very month.

---

## 2. Product scope (revised against the official challenge text)

The challenge asks for: harmonized MODIS + VIIRS hotspots; a web app where a user **selects a region and a date range**; a **calendar** from the early 2000s to the present; the ability to see **which months and years** were highest and to compare **the current month with the historical median**; **downloadable analytics, visualizations and a hotspot CSV**; accessible colour ramps. The charter covered the calendar and the anomaly but left date range, downloads, CSV and the month view out of "Must". They are in now.

### Must (submittable with only these)
| # | Item | Owner |
|---|---|---|
| M1 | Ingest + Tier 1 on real FIRMS data, the approved whole-US region and separate simulator, with coverage and missing days | R2, R3 |
| M2 | Validation V1–V5 with real numbers on the Methods page | R3, R1 |
| M3 | Screen 1 Broken ruler · 2 Place picker · 3 Verdict card · 4 Calendar (Fire Year Clock + week × year and **month × year** heatmaps, sensor lens, **critical-weeks band**) · 6 This week (and **this month vs median**) · 9 Methods | R5, R6 |
| M4 | **Date range selector** that filters every chart and number on the region page | R5 |
| M5 | **Downloads:** series CSV for the selected range, calendar CSV, chart PNG/SVG, recent hotspot CSV | R5, R2 |
| M6 | Missing drawn as missing; every number labelled by kind; "NASA FIRMS" credit on every page; SAMPLE banner logic | R5, R6 |
| M7 | Planted-truth test (V7) passing end to end | R4 + all |
| M8 | Public repo, README, live site, 30-second video, submission page | R2, R5 |

### Should (the winning margin; start as soon as your Musts pass)
| # | Item | Owner |
|---|---|---|
| S1 | Tier 2 eyesight curve, chart, Tier 1 vs Tier 2 agreement figure, `viirs_equiv` lens | R4, R6 |
| S2 | Screen 5 Critical weeks and season shift | R1, R6 |
| S3 | Screen 7 Hexagon map | R1, R6 |
| S4 | Screen 8 Season Brief (printable) | R5 |
| S5 | **Draw your own area** inside a showcase region (area-of-interest lens on `cells_monthly.csv`) | R5, R6, R1 |
| S6 | Yearly hotspot CSV archives on GitHub Releases | R2 |
| S7 | Drift chart (V4) on the Methods page | R3, R6 |

### Could (only after Gate D with everything above green)
More US regions (one entry each in `regions.yaml`); night-pass series; Season Brief in a second language; cropland/wildland split.

### Won't
Fire prediction or spread modelling; accounts, backend, database, alerts; NOAA-21; any place on Earth with full history; summing sensors; calling a hotspot a fire.

---

## 3. Six workstreams

Work is split so that **every person owns folders nobody else writes to**, has **work in every phase**, and can **test alone**. The charter's roles left one person without code, one idle on Sunday, one blocked until data arrived, and two overloaded; this split fixes that.

| Role | Name | Owns (folders) | Saturday | Sunday |
|---|---|---|---|---|
| **R1** | Contracts, Calendar Statistics, Export (also scope owner) | `contracts/`, `pipeline/stats/`, `pipeline/export/`, `web/public/data/`, `plan/` | JSON Schemas, sample data, climatology, trend, season | Nowcast stats, methods.json, numbers audit |
| **R2** | Data Engineering, then Delivery | `pyproject.toml`, `pipeline/common/`, `pipeline/config/` (except `science.yaml`), `pipeline/ingest/`, `pipeline/run.py`, `data/`, `docs/`, `README.md`, `.github/workflows/pipeline.yml` | Scaffold, downloads, clean, grid, coverage | Nowcast fetch, hotspot archives, **README, slides, video, submission** |
| **R3** | Tier 1 Harmonization and Validation (science owner) | `pipeline/harmonize/`, `pipeline/config/science.yaml`, `plan/03_SCIENCE_DECISIONS.md` | k fit, daily series, bootstrap | Validation V1–V6, drift, numbers sign-off |
| **R4** | Planted-Truth Simulator and Tier 2 Eyesight Curve | `pipeline/synth/`, `pipeline/eyesight/` | Simulator (unblocks everyone), matching, curve fit on simulated data | Real-data curve, forward/backward, V6–V8 |
| **R5** | Web App and Product Screens | `web/` except `web/src/viz/`, `web/src/styles/tokens.css`, `web/public/data/`; `.github/workflows/web.yml` | Shell, data layer, picker, verdict, this week, deploy | Date range, downloads, AOI lens, Season Brief, Methods |
| **R6** | Visualization and Design System | `web/src/viz/`, `web/src/styles/tokens.css`, `design/` | Tokens, Broken ruler, Fire Year Clock, heatmaps | Season shift, hex map, eyesight and drift charts, accessibility pass |

`CODEOWNERS` encodes this table. A pull request touching someone else's folder needs that person's review.

### Who hands what to whom
```
R4 synth ──raw CSV──► R2 ingest ──celldays, coverage──► R3 harmonize ──daily, calibration──► R1 stats/export ──JSON──► R5 app ◄──components── R6 viz
                              └────celldays, coverage──► R4 eyesight ──daily_t2, curve──────► R1
R1 contracts + sample JSON ─────────────────────────────────────────────────────────────────► R5, R6   (from hour 2)
R3 science.yaml ──► R2, R4, R1 (read-only)
```

---

## 4. Repository layout

```
firerosetta/
  AGENTS.md  CLAUDE.md  README.md  LICENSE  CODEOWNERS
  .gitattributes  .gitignore  .editorconfig  .env.example  .python-version
  pyproject.toml  uv.lock
  plan/                         these documents (R1; 03 is R3's)
  contracts/                    *.schema.json, examples/              R1
  pipeline/
    __init__.py  run.py                                               R2
    common/      paths.py config.py timebins.py sensors.py io.py log.py    R2
    config/      regions.yaml outages.yaml regions/*.geojson          R2
                 science.yaml                                         R3
    ingest/      download.py clean.py grid.py coverage.py static_mask.py nowcast_fetch.py hotspots_export.py tests/   R2
    harmonize/   calibrate.py series.py bootstrap.py validate.py naive.py tests/                                     R3
    synth/       world.py sensors.py write_firms.py tests/            R4
    eyesight/    match.py fit.py translate.py validate.py tests/      R4
    stats/       climatology.py anomaly.py season.py trend.py ruler.py nowcast.py spatial.py sentences.py tests/      R1
    export/      sample.py assemble.py check.py tests/                R1
  data/                         raw/ clean/ grid/ harmonized/ eyesight/   (git-ignored)
  web/
    package.json vite.config.js index.html                            R5
    src/app/ src/screens/ src/data/ src/lib/ src/components/          R5
    src/viz/                                                          R6
    src/styles/tokens.css                                             R6
    public/data/                generated JSON (committed)            R1
  design/                       wireframes, palette checks            R6
  docs/                         figures/ slides/ video/ submission.md R2
  .github/workflows/            pipeline.yml (R2)  web.yml (R5)
```

Rules that keep the split clean:
- **Shared dependency files have one owner.** `pyproject.toml` is R2's; `web/package.json` is R5's. Both are created in the first hour with the **complete dependency list in §6**, so nobody needs to touch them later. If you need a new package, ask the owner in chat.
- **Tests live inside the owner's folder** (`pipeline/harmonize/tests/`, `web/src/viz/__tests__/`).
- **No stage imports another stage's Python module.** Shared code is only in `pipeline/common/`.

---

## 5. Branching, integration and "no overlap until the end"

- Branches: `r1/<topic>` … `r6/<topic>`. One person per folder means merges cannot conflict.
- `main` always builds and deploys. Merge to `main` by pull request **at each gate**, plus any time your own tests are green. Squash merges.
- The team asked for no overlap until a final integration. Integrating only once at the end is the most common way hackathon projects fail, so this plan keeps development separate **and** rehearses integration early on simulated and sample data:

| Rehearsal | When | What is joined | Pass means |
|---|---|---|---|
| IR-1 | Sat 18:30 (Gate A) | R1 sample JSON → R5 shell → R6 first chart | Deployed site renders sample data with the SAMPLE banner |
| IR-2 | Sat 23:00 (Gate B) | `pipeline.run --region synthland` through every stage that exists; us real data through Tier 1 | One command, exit 0, JSON validates |
| IR-3 | Sun 10:00 (Gate C) | All regions, real data, site switched off sample | No SAMPLE banner; Methods page shows real validation |
| IR-4 | Sun 14:00 (Gate D) | Should features | Each Should either merged or cut |
| Final | Sun 17:00 (Gate E) | Feature freeze | Only bug fixes after this |

Because every stage reads and writes fixed files, the **final integration is a re-run of `pipeline.run --all-regions` followed by `npm run build`**, already rehearsed three times.

---

## 6. Toolchain (all free, all cross-platform)

Three operating systems are in play (Windows 11, Ubuntu, macOS). Everything below installs and behaves the same on all three.

### 6.1 Install once per laptop
| Tool | Why | Install |
|---|---|---|
| Git | version control | git-scm.com; on Windows run `git config --global core.longpaths true` and `git config --global core.autocrlf false` |
| **uv** (Astral) | Python version + virtual env + lockfile in one tool; identical commands on all OSes | docs.astral.sh/uv |
| **Node.js LTS (22 or newer)** | web build | nodejs.org (or `fnm`/`nvm-windows`); version pinned in `web/.nvmrc` |
| VS Code (or any editor) | editing | extensions: Python, Ruff, ESLint, Tailwind CSS IntelliSense, EditorConfig |
| DBeaver or the DuckDB CLI (optional) | look inside Parquet files | free |

### 6.2 Python packages (`pyproject.toml`, complete list, R2 creates in hour 1)
`python >=3.11,<3.13` · `duckdb` · `pandas` · `pyarrow` · `numpy` · `scipy` · `h3>=4` · `pyyaml` · `requests` · `jsonschema` · `matplotlib` · `python-dotenv` · `tqdm` — dev: `pytest`, `ruff`.

Not used on purpose: geopandas/shapely/GDAL (painful on Windows; `h3.geo_to_cells` does our polygon work), scikit-learn and statsmodels (the three-parameter fit is 20 lines of scipy).

### 6.3 Web packages (`web/package.json`, complete list, R5 creates in hour 1)
`react` · `react-dom` · `react-router-dom` · `typescript` · `vite` · `@vitejs/plugin-react` · `tailwindcss` + `@tailwindcss/vite` · **shadcn/ui** components (copied in, built on Radix) · `lucide-react` · `d3` · `maplibre-gl` · `h3-js` · `terra-draw` + `terra-draw-maplibre-gl-adapter` · `ajv` · `papaparse` · `qrcode.react` · `@fontsource-variable/inter` — dev: `vitest`, `@testing-library/react`, `jsdom`, `json-schema-to-typescript`, `eslint`, `prettier`, `@playwright/test` + `@axe-core/playwright`.

### 6.4 Tools by stage
| Stage | Tools | Notes |
|---|---|---|
| Data download | FIRMS archive + country CSV + Area API (free MAP_KEY); `requests` | §1 of the contracts |
| Clean, grid | **DuckDB** (reads CSV straight to Parquet, out of core), `h3` | A 10-million-row CSV cleans in under a minute |
| Statistics | `numpy`, `scipy.stats.theilslopes`, `scipy.optimize` | |
| Diagnostic figures | `matplotlib` → `docs/figures/` | for slides and README |
| Contracts | JSON Schema + `jsonschema` (Python) + `ajv` (browser) + `json-schema-to-typescript` | one source of truth, checked on both sides |
| UI kit | **Tailwind CSS + shadcn/ui + Radix + Lucide icons** | professional, accessible, free |
| Charts | **D3** (custom clock and heatmaps) | SVG, so export is trivial |
| Map | **MapLibre GL JS + h3-js + OpenFreeMap tiles (no key) + Terra Draw** | basemap is optional at runtime |
| Wireframes | **Penpot** (open source) or Excalidraw | R6, 30 minutes maximum |
| Colour | `d3-scale-chromatic` (Inferno, PuOr), ColorBrewer, Viz Palette, Chrome DevTools "Emulate vision deficiencies" | |
| Accessibility | axe (via Playwright), Lighthouse, WebAIM contrast checker | |
| CI/CD | **GitHub Actions** (free for public repos): pytest on ubuntu/windows/macos; web build + deploy to **GitHub Pages** | |
| Video | **OBS Studio** (record), **Shotcut** or **Kdenlive** (edit), `ffmpeg` (burn subtitles) | all free, all three OSes |
| Slides | **Marp** (Markdown → slides, lives in the repo) or Google Slides | |
| QR code | `qrcode.react` in the app; `segno` or any free generator for slides | |

### 6.5 AI assistant setup (tool-agnostic)
The prompts in the role files work in any coding assistant. The repo carries the rules so every assistant reads the same thing:
- `AGENTS.md` at the root is the binding rule file (most assistants read it automatically). `CLAUDE.md` contains one line importing it.
- **Every session starts with the role's "Session primer"**, which tells the assistant which files to read.

Optional, free, only if your assistant supports the Model Context Protocol (check each one's current terms when installing):
| MCP server | Use | Who benefits |
|---|---|---|
| Context7 | current library docs (h3 v4, DuckDB, MapLibre, Tailwind, Terra Draw) | everyone |
| Playwright MCP or Chrome DevTools MCP | let the assistant open the local site, click, read console errors | R5, R6 |
| GitHub MCP server | open pull requests, read CI logs | everyone |
| A DuckDB MCP server (for example MotherDuck's open-source one, pointed at local files) | let the assistant query Parquet outputs while debugging | R2, R3, R4, R1 |

Optional agent skills, if your assistant supports them: a front-end design skill and a web-app testing skill for R5/R6. None is required; the prompts do not depend on them.

---

## 7. Cross-platform rules (Windows 11 · Ubuntu · macOS)

1. **One command style everywhere:** `uv run python -m pipeline.<stage> …` and `npm run <script>`. No `.sh`, no `.bat`, no Makefile.
2. **Paths** only through `pathlib` and `pipeline/common/paths.py`. Never concatenate with `/` or `\`.
3. **Line endings:** `.gitattributes` with `* text=auto eol=lf`; Parquet, PNG and font files marked binary.
4. **Encoding:** always `encoding="utf-8"`; CSV writes use `newline=""`.
5. **Time:** UTC everywhere (`datetime.now(timezone.utc)`); local solar day comes from longitude (SD-03). Never the laptop's time zone.
6. **File names:** lower-case, no spaces. Linux is case-sensitive; an import that works on macOS and Windows can fail in CI.
7. **Processes:** any multiprocessing sits under `if __name__ == "__main__":` (Windows spawns). Prefer DuckDB's own threads.
8. **npm scripts** use Node, never `rm`/`cp`. Delete with `rimraf` or a small Node script.
9. **Memory:** set `PRAGMA memory_limit='4GB'` and a temp directory in DuckDB so 8 GB laptops survive.
10. **CI is the referee:** pytest runs on all three OSes; the web build runs on Ubuntu. Green CI is part of "done".
11. **Determinism:** fixed random seeds; JSON written with sorted keys and 3-decimal rounding, so two laptops produce identical files.

---

## 8. Timeline and gates (Eastern time)

About 30 working hours remain. Sleep is in the plan because tired people break `main`.

| When | Phase | Gate criteria (all must be true) |
|---|---|---|
| **Sat 16:00–16:30** | Kickoff | Roles assigned; repo created and public; everyone has cloned, run `uv sync` and `npm ci`; **R2 has submitted FIRMS archive requests and started country downloads**; MAP_KEY obtained |
| **Sat 16:30–18:30** | **A · Foundations** | **Gate A 18:30:** scaffold + `common/` on main (R2) · JSON Schemas + `--sample` data on main (R1) · `science.yaml` on main (R3) · simulator writes tiny `synthland` raw CSVs (R4) · site deployed and rendering sample `ruler.json` (R5) · tokens + first chart in the gallery (R6) · **contracts frozen** |
| **Sat 18:30–23:00** | **B · Vertical slices** | **Gate B 23:00:** `pipeline.run --region synthland` exits 0 through ingest → harmonize → stats → export · us real data cleaned and gridded, Tier 1 k fitted · eyesight fit recovers the planted curve on `synthland` · every Must screen works on sample data · IR-2 passed |
| Sat 23:00–07:00 | Sleep | R2 leaves the overnight `ingest` for the full `us` record running |
| **Sun 07:00–10:00** | **C · Real data everywhere** | **Gate C 10:00:** the approved whole-US region and separate simulator through ingest → harmonize → stats → export · V1–V5 numbers in `methods.json` · nowcast fetched · site on real data with no SAMPLE banner · IR-3 passed |
| **Sun 10:00–14:00** | **D · Should features** | **Gate D 14:00:** each Should item is merged or cut, decided by R1 · Tier 2 status decided per SD-17 · README draft and slide skeleton exist |
| **Sun 14:00–17:00** | **E · Hardening** | **Gate E 17:00 feature freeze:** all branches merged · full re-run from raw data on a second laptop with a different OS produces identical JSON · accessibility and phone checks done · numbers audit signed by R3 |
| Sun 17:00–19:00 | Polish | Bug fixes only; final nowcast refresh at 18:00; video script filled from JSON |
| **Sun 19:00** | Record | 30-second video recorded from the live site (re-record only if something breaks) |
| Sun 19:00–21:00 | Submission | README final; project page text; links tested logged-out and on a phone |
| **Sun 21:00** | Dry run | Whole checklist in `REPORTS.md` §7.6 ticked |
| **Sun 22:00** | **Submit** | Screenshot of the confirmation in the team chat |

Stand-ups (5 minutes, at the gates): Sat 18:30, Sat 23:00, Sun 07:00, Sun 10:00, Sun 14:00, Sun 17:00. Each person: what works, what is blocked, what lands before the next gate. Each gate's result is logged in `REPORTS.md` §7.1.

**Cut rule.** If a gate is missed, R1 cuts from Could, then Should, never from Must. If a Must is at risk, the people whose Musts are done swarm it.

---

## 9. Testing: every part proves itself alone

| Level | What | Who | How |
|---|---|---|---|
| Unit, fabricated inputs | Each stage builds its own tiny input tables in the test and asserts a known answer (for example VIIRS cell-days exactly double Aqua's → k = 0.5) | each owner | `uv run pytest pipeline/<folder>`; no other person's code or data needed |
| Contract | Every output validates against its schema | each owner; R1 owns the checker | `uv run python -m pipeline.export --check` |
| Planted truth (V7) | Full pipeline on `synthland`; compare with `truth.json` | R4 runs it; everyone's stage must pass | `uv run python -m pipeline.run --region synthland` |
| Web unit | Data loaders, AOI maths, CSV builders, percent formatting | R5 | `npm run test` |
| Web visual | Gallery page with every chart on sample data in every state (missing, estimated, sample, empty) | R6 | `#/gallery` |
| Web smoke | Playwright opens each route, checks no console errors, runs axe | R5 | `npx playwright test` |
| Cross-OS | Same raw data → same JSON hashes on two different OSes | R2 + one other | compare `manifest.json` |
| Numbers audit | Every number in the video, slides and README traced to a JSON field | R2 collects, R3 signs | `REPORTS.md` §7.3 |

**The integration test that matters most:** selecting the whole region in the area-of-interest lens must reproduce `monthly.json` (within rounding). It checks the pipeline and the browser maths against each other.

---

## 10. Added requirements (beyond the charter)

These were added because they either answer the official challenge text, remove a way the demo could fail, or strengthen the science story.

1. Date range selector on the region page (challenge objective).
2. Downloads: series CSV, calendar CSV, chart PNG/SVG, hotspot CSV (challenge objective).
3. Month × year heatmap and "this month vs historical median" (challenge wording is monthly).
4. Critical-weeks band on the calendar is a Must, so "critical periods" does not depend on a Should screen.
5. `low_activity` status, so off-season weeks do not read as "extreme" (coverage and seasonal activity determine the state).
6. Planted-truth simulator and its results on the Methods page.
7. Drift diagnostic chart (the evidence for where we stop trusting Aqua).
8. Robustness variants of the trend, and a verdict sentence with an "unclear" branch.
9. Backcast validation for the `viirs_equiv` lens before it may be shown.
10. `methods.json → sources`: every date or external fact in the pitch has a URL and a checked date.
11. `manifest.json` with file hashes and a `contains_sample` flag driving the SAMPLE banner.
12. The map works without the basemap; fonts are bundled, not loaded from a CDN.
13. Shareable URLs (range, lens, view and area in the query string), so a judge's click path can be linked.
14. Cross-OS reproducibility check before the freeze.
15. A plain-text `docs/submission.md` holding the exact project-page text, so the submission is a copy-paste at 21:00, not a writing session.
16. Phone layout check: local judges will scan the QR code.

---

## 11. Risks and fallbacks

| Risk | Early sign | Fallback | Owner |
|---|---|---|---|
| Archive emails are slow | Nothing by Sat 19:00 | Country yearly CSVs (already downloading); Area API for 2026 | R2 |
| Country file pattern differs from our guess | 404 on first file | Read the links on the FIRMS country page; download by hand for the United States first | R2 |
| NOAA-20 archive starts later than 2018 | E4 shows 2020 | SD-06 chained k (already specified) | R3 |
| Aqua or S-NPP rows stop earlier than expected | coverage shows `after_end` | Already handled by eras and fallback (SD-05) | R3 |
| Tier 2 curve is noisy | band at 10 MW ≥ 0.30 | `exploratory` label; Tier 1 everywhere (SD-17) | R4 |
| Real data not ready at Gate C | ingest unfinished Sun 09:00 | Ship the years that are real and say which; never ship sample as real | R1 |
| Fire Year Clock is hard to read | two teammates cannot name the peak season in 10 s | Month heatmap becomes the default view | R6 |
| Off-season makes "This week" dull | `low_activity` | Show the last active window with its date | R5 |
| Area-of-interest lens disagrees with the pipeline | whole-region test fails | Cut S5; keep the the approved whole-US region and separate simulator | R5, R1 |
| Deploy breaks late | build fails after 17:00 | Deploy only from `main`; tag `freeze-1700`; Pages can be rolled back by re-running the tagged workflow | R5 |
| Scope creep | anyone on a Could before Gate D | R1 reassigns at the stand-up | R1 |
| A claim in the pitch is wrong | cannot find a URL for it | Remove the claim; only `sources` entries may be spoken | R2 |
