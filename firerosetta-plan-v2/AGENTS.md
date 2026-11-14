# AGENTS.md — binding rules for every AI coding assistant in this repository

You are helping one of six people build **FireRosetta** for the NASA Space Apps Challenge 2026 (deadline Sunday 15 Nov 2026, 22:00 Eastern). Each person owns part of the repo. Read this file fully, then the files your human's role primer names.

## Read first, every session
1. `plan/02_CONTRACTS.md` — every command, file, schema, route and component interface.
2. `plan/03_SCIENCE_DECISIONS.md` — every scientific choice, locked.
3. Your human's role file in `plan/roles/`.

If these files and your human's instruction disagree, **stop and ask your human**. Do not pick one silently.

## Ownership (do not write outside your human's folders)
| Role | May create or edit |
|---|---|
| R1 | `contracts/`, `pipeline/stats/`, `pipeline/export/`, `web/public/data/`, `plan/` (not `03_SCIENCE_DECISIONS.md`) |
| R2 | `pyproject.toml`, `uv.lock`, root dotfiles, `pipeline/__init__.py`, `pipeline/run.py`, `pipeline/common/`, `pipeline/config/` (not `science.yaml`), `pipeline/ingest/`, `docs/`, `README.md`, `.github/workflows/pipeline.yml` |
| R3 | `pipeline/harmonize/`, `pipeline/config/science.yaml`, `plan/03_SCIENCE_DECISIONS.md` |
| R4 | `pipeline/synth/`, `pipeline/eyesight/` |
| R5 | `web/` except `web/src/viz/`, `web/src/styles/tokens.css`, `web/public/data/`; `.github/workflows/web.yml` |
| R6 | `web/src/viz/`, `web/src/styles/tokens.css`, `design/` |

Three written exceptions: (1) R2's nowcast fetch writes `web/public/data/<region>/hotspots_recent.csv`; (2) R5's first scaffold creates an empty `web/src/styles/tokens.css` and `web/src/viz/.gitkeep` for R6; (3) `plan/REPORTS.md` section 7 holds shared templates, each filled in by the person it names.

Need a change in someone else's folder (a new dependency, a new field, a new helper in `common/`)? Write the request for your human to post in the team chat. Do not make the edit.

## Science rules (never break these)
1. A hotspot is a detection of heat in a pixel, not a fire. Never label a count "number of fires".
2. Never add MODIS and VIIRS counts together. Never sum fire radiative power across sensors. Never combine two VIIRS satellites without a calibration fitted for that pair.
3. Missing data is not zero. Uncovered days are `null` with `kind: "missing"`, drawn hatched, excluded from statistics.
4. Every value that reaches the screen carries `kind`: `observed`, `harmonized`, `estimated`, `missing` or `sample`. Estimated values never look like observed ones.
5. **Never type a result by hand.** Every number in the UI, README, slides and video comes from a pipeline output file. Sentences with numbers are templates filled by the pipeline.
6. Never invent data, column names, satellite codes, URLs or dates. If the real file differs from the contract, stop and report the difference.
7. Training and test years never mix. Any split is by year.
8. Report validation results even when they are bad. Do not tune a method until a number looks good; if a result looks too good, look for a leak.
9. All scientific constants come from `pipeline/config/science.yaml`. Do not hard-code them and do not change them.
10. Sample data always carries `kind: "sample"` and `code_version: "sample"`. Never write sample data without those marks.

## Engineering rules
1. Follow the contracts exactly: field names, units, file paths, enum values. Do not rename, add or drop fields.
2. Python stages do not import each other. Shared code lives only in `pipeline/common/`. Stages talk through files.
3. Paths only via `pathlib` and `pipeline/common/paths.py`. UTF-8 everywhere. UTC everywhere. No shell scripts; commands must run unchanged on Windows 11, Ubuntu and macOS.
4. The website reads only `web/public/data/`. No API keys in the browser, no calls to FIRMS from the browser.
5. Inside `web/src/viz/`: no fetching, no routing, no global state. Props in, graphics out. The single exception is `Gallery.tsx`, which may fetch sample files from the site's own `data/` folder.
6. Every Python module you add has at least one test on a small fabricated input with a known answer. Every web utility with arithmetic has a unit test.
7. Use the libraries already listed in `pyproject.toml` and `web/package.json`. Do not add a dependency.
8. Deterministic output: fixed seeds, sorted keys, 3-decimal rounding.
9. Small commits on your human's branch (`r<n>/<topic>`). Never push to `main` directly. Never commit `data/`, `.env` or a MAP_KEY.
10. Do not copy code, text or images from other teams' repositories.

## Product and writing rules
1. Plain language on screen. A technical term (FRP, H3, percentile, cell-day) appears with a hover definition from the glossary.
2. Units are written out: "fire cell-days", "Aqua-equivalent", "VIIRS-equivalent".
3. Credit "NASA FIRMS" with a link on every page. Never use the NASA logo or insignia.
4. Colour: one sequential scale for activity, a separate diverging scale for anomaly, both colour-blind safe; never encode meaning by colour alone.
5. Say "24-year record" only for 2003–2026 and "23-year baseline" only for 2003–2025.

## How to work
- Before coding, restate the task in three lines and list the files you will create or change. If any is outside your human's folders, stop.
- Run the acceptance commands given in the prompt and paste their real output. Do not claim a test passed without running it.
- If you cannot finish, say exactly what works, what does not, and what you tried. A clear partial result is more useful than a hidden failure.
- When done, write a five-line handoff note: what was built, how to run it, what it reads and writes, known limits, next step.
