# R5 · Web App and Product Screens

> Current integration scope: one real whole-US polygon plus planted-truth Synthland; runtime web code is JavaScript with generated JSDoc declarations. Selectable analysis years and exact dates are separate. The authorized interfaces and requirement statuses are in `../02_CONTRACTS.md` and `../REQUIREMENTS_MATRIX.md`. Earlier multi-region, TypeScript-runtime and provisional stand-in instructions are superseded.


## 1. Your mission
You build the website a judge will actually touch: the shell, the data loading, every screen's layout and words, the date-range selector, the downloads, the printable Season Brief, and the deployment. R6 builds the charts as components; you place them, feed them data and make the whole thing fast, clear and unbreakable.

The site is **static**. It reads JSON files from its own `data/` folder and nothing else. If a file is missing, that section hides; the site never crashes and never shows sample data without a banner.

## 2. You own / you never touch
- **Own:** everything under `web/` **except** `web/src/viz/`, `web/src/styles/tokens.css` and `web/public/data/`; plus `.github/workflows/web.yml`.
- **Never touch:** `web/src/viz/` and `tokens.css` (R6), `web/public/data/` (R1 generates it), anything under `pipeline/`.
- `web/package.json` is yours. Install the **complete dependency list** from `01_ARCHITECTURE.md` §6.3 in your first prompt so R6 never needs to change it.

## 3. Inputs and outputs
| You read | From | Contract |
|---|---|---|
| `web/public/data/**` (sample from Sat 18:15, real from Sun 10:00) | R1 | §6 |
| `contracts/*.schema.json` → generated TypeScript types | R1 | §6 |
| Chart components and `percentileRank` from `web/src/viz/index.js` | R6 | §8 |
| CSS variables from `tokens.css` | R6 | — |

| You produce | For |
|---|---|
| The deployed site at a public URL (GitHub Pages) | judges, R2's video |
| Routes and URL parameters exactly as contracts §7 | everyone |
| Downloads (series CSV, calendar CSV, chart PNG/SVG, hotspot links, print-to-PDF brief) | challenge requirement |

## 4. What the other five are doing
| Role | Doing | Touches you how |
|---|---|---|
| R1 | Schemas, sample data, all site JSON | Your only data source. Sample data lands about 18:15 Saturday; real data Sunday 10:00. Ask R1, not the pipeline people, about any field. |
| R6 | Chart components, colour and type tokens | You import their components. They commit **stubs for every component by 17:30 Saturday** so your pages compile from the start. You mount their gallery at `#/gallery`. |
| R2 | Data, then README, video, submission | Needs the live URL early, a stable site by 18:00 Sunday for recording, and `hotspots_recent.csv` shown in your downloads. |
| R3 | Calibration and validation | Their numbers fill your Methods tables (via `methods.json`). |
| R4 | Simulator and eyesight curve | Their planted-truth table and curve status appear on your Methods page. |

## 5. Tools (all free)
Vite + React + JavaScript with generated declarations; Tailwind CSS; **shadcn/ui** (Radix-based components you copy in: Button, Card, Tabs, ToggleGroup, Tooltip, Popover, Calendar/DateRangePicker, Dialog, Table, Badge, Skeleton, Sonner toasts); Lucide icons; `react-router-dom` (HashRouter); `ajv`; `papaparse`; `qrcode.react`; Vitest + Testing Library; Playwright + axe. GitHub Actions + GitHub Pages. Optional: Playwright MCP or Chrome DevTools MCP so your assistant can open the local site and read console errors.

## 6. Your timeline
| Gate | You deliver |
|---|---|
| Sat **17:00** | Web scaffold on main (so R6 can start) |
| A · Sat 18:30 | Data layer with schema validation; site deployed to Pages; landing shows sample `ruler.json` through R6's component or stub; SAMPLE banner works |
| B · Sat 23:00 | Every Must screen laid out on sample data: landing, picker, region page (verdict, calendar with lens/view/mode toggles, this week), Methods |
| C · Sun 10:00 | Site on real data; date-range bar and range analytics; error and empty states |
| D · Sun 14:00 | Downloads panel; Season Brief; AOI lens (Should); smoke tests |
| E · Sun 17:00 | Phone layout, accessibility pass, performance, tag `freeze-1700` |

## 7. Session primer (paste at the start of every AI session)
```text
You are assisting R5 on the FireRosetta project. Before doing anything, read these files fully:
- AGENTS.md
- plan/02_CONTRACTS.md sections 6, 7, 8 and 9 (data files, routes, component props, enums)
- plan/03_SCIENCE_DECISIONS.md sections E and H (what the numbers mean and how to word them)
- plan/roles/R5_web_app.md (section 9 lists every screen's content)

I own everything under web/ EXCEPT web/src/viz/, web/src/styles/tokens.css and web/public/data/. Never edit those.
Charts come from "../viz" with the props in contracts section 8; do not draw charts yourself.
The site is static: fetch only from `${import.meta.env.BASE_URL}data/...`. No other network calls, no API keys.
Never type a number or a result sentence into the UI: numbers and sentences come from the JSON files.
Use only packages already in web/package.json. Use CSS variables from tokens.css for every colour.
Reply first with a three-line restatement and the list of files you will create or change. Run the acceptance commands and
paste their real output. Finish with a five-line handoff note.
```

## 8. Prompts

### A1 · Scaffold (start 16:30, on main by 17:00)
```text
Task: create the web app skeleton in web/.

- Vite + React + JavaScript (allowJs/checkJs/noEmit). Install exactly the dependencies and dev dependencies listed in
  plan/01_ARCHITECTURE.md section 6.3. Add .nvmrc (22) and "engines". Scripts: dev, build, preview, typecheck
  (tsc --noEmit), test (vitest run), lint, gen:types. No script may use shell-only commands (rm, cp).
- vite.config.js: base from process.env.VITE_BASE or "./"; @tailwindcss/vite; alias "@" -> src.
- Tailwind set up to read colours from CSS variables defined in src/styles/tokens.css (create an EMPTY tokens.css with
  a comment "owned by R6" and import it once in main.jsx; do not put values in it).
- shadcn/ui initialised; add: button, card, tabs, toggle-group, tooltip, popover, calendar, dialog, table, badge,
  skeleton, sonner.
- src/app/: App.jsx with HashRouter and the routes in contracts section 7 (each a placeholder screen with its name),
  AppShell with header (wordmark "FireRosetta", nav: Pick a place, Methods), footer with the credit
  "Fire data: NASA FIRMS" linking to https://firms.modaps.eosdis.nasa.gov/ on every page, and a slot for the SAMPLE banner.
- Create web/src/viz/.gitkeep only (R6 owns that folder). Import charts from "@/viz" nowhere yet.
- .github/workflows/web.yml: on push to main touching web/** or contracts/**: npm ci, typecheck, test, build with
  VITE_BASE="/<repo-name>/", upload and deploy to GitHub Pages (actions/configure-pages, upload-pages-artifact,
  deploy-pages). On pull requests: typecheck, test, build only.
- Self-host the Inter variable font via @fontsource-variable/inter (no CDN).

Acceptance (from web/):
  npm ci && npm run typecheck && npm run test && npm run build
  npm run dev    # every route renders its placeholder; footer credit visible
Merge to main immediately and tell R6 the scaffold is up. Then enable GitHub Pages (Settings -> Pages -> GitHub Actions).
```

### A2 · Data layer, types, SAMPLE banner (17:00–18:30)
```text
Task: build src/data/.

- npm run gen:types: runs json-schema-to-typescript over ../contracts/*.schema.json into src/data/types.gen.d.ts
  (a small Node script in web/scripts/gen-types.mjs). If contracts/ has no schemas yet, write the types by hand from
  contracts section 6 into src/data/types.js with the same names, and switch to generated types when schemas land.
- src/data/fetchJson.js: fetch `${BASE_URL}data/${path}`, parse, validate with ajv against the bundled schema, and
  return a discriminated result {ok: true, data} | {ok: false, reason: "missing" | "invalid" | "network", detail}.
  Never throw into React. Cache by path in a Map.
- src/data/useRegions.js, useRegionData.js (loads the files named in regions.json "files" and "optional_files" for that
  region; each file independently loading/ok/absent/invalid), useMethods.js.
- src/data/csv.js: papaparse loaders for cells_monthly.csv and hotspots_recent.csv (lazy, only when asked).
- Sample detection: a context that becomes true if manifest.contains_sample is true OR any loaded row has kind "sample".
  When true the shell shows a fixed, unmissable banner: "SAMPLE DATA: these numbers are placeholders, not results."
- src/components/: SectionState (skeleton / "not available for this region yet" / "this file failed validation" with
  the reason in a details element), KindBadge wrapper, GlossaryTerm (dotted underline + tooltip; the text comes from
  src/lib/glossary.js, which you fill from the glossary table in section 10 of plan/roles/R5_web_app.md).
- Hide regions with synthetic true unless ?debug=1.

Tests (vitest): fetchJson returns invalid for a file missing a required field; sample context flips on a sample row;
a region whose trend file is absent still renders its other sections; glossary has an entry for every term in the table.

Acceptance (from web/):
  npm run gen:types && npm run typecheck && npm run test && npm run build
```

### B1 · Landing and place picker (start 18:30)
```text
Task: build screens 1 and 2 on sample data (content spec: section 9 of plan/roles/R5_web_app.md).

Screen 1 "#/": headline, the BrokenRuler component from "@/viz" fed with the default region's ruler.json (default =
first non-synthetic region), the ruler sentence from the JSON, a one-line "why now" paragraph whose dates come from
methods.json sources (claim_ids snpp_end and aqua_drift; if absent, omit the paragraph), a primary button "Pick a
place", and a small QR code (qrcode.react) of window.location.origin + pathname labelled "Open on your phone".
Screen 2 "#/pick": one card per region from regions.json: name, fire_type, story, a mini outline drawn as inline SVG
from outline.geojson (simple equirectangular projection; no map library on this screen), and the nowcast status badge
if nowcast.json is present. Cards link to #/r/:region.

Also mount the Gallery component exported by "@/viz" at "#/gallery" (it is R6's development page; add no link to it in the nav).

Rules: every string that states a result comes from JSON. Loading and error states use SectionState.
Layout works at 360 px width. Keyboard: cards are links, focus rings visible.

Acceptance: npm run typecheck && npm run test && npm run build; then check both screens in npm run dev at 360 px and
1280 px and paste any console warnings.
```

### B2 · Region page: verdict, calendar, this week
```text
Task: build "#/r/:region" as one scrolling story with a sticky section nav (Verdict, Calendar, Critical weeks, This
week, Where, Downloads). Content spec in section 9 of my role file.

- URL state: from, to, lens, view, mode, aoi exactly as contracts section 7, in a single useUrlState hook
  (read on load, write with replace so Back works). Invalid values fall back to defaults silently.
- Verdict card: the trend.json sentence as the headline; under it TrendBars from "@/viz"; two labelled figures
  ("What the raw record suggests" / "After harmonization") each showing pct_per_decade with its range and a KindBadge;
  a "How sure are we?" disclosure listing the robustness variants in a small table.
- Calendar section: ToggleGroups for view (Clock / Weeks / Months), lens (the six lenses in contracts section 7 with
  plain labels from weekly.json series_meta; "Naive splice" explained in a tooltip), mode (Activity / Compared with
  normal). Renders FireYearClock or CalendarHeatmap from "@/viz" with the props in contracts section 8. Under the
  chart: Legend, the unit from series_meta, and a line explaining hatching (no data) and dashed (estimate).
  Selecting a cell (onSelect) opens a small panel: the value, lo-hi, kind, source sensor, and that week's or month's
  percentile among baseline years (use percentileRank exported by "@/viz").
- This week: the nowcast sentence, PercentileStrip, status badge with a text label (never colour alone), "as of"
  time in the viewer's locale plus UTC, the input_note, and the month-to-date line: "November so far: {value} vs a
  typical {median} by this date." Statuses low_activity and unavailable get their own calm layouts.
- Each section hides itself with SectionState when its file is absent.

Tests: useUrlState round-trips every parameter and rejects bad ones; the lens list is built from series_meta keys plus
naive_splice; status label mapping covers all six statuses.

Acceptance: npm run typecheck && npm run test && npm run build; walk the page on the configured sample states.
```

### B3 · Methods page
```text
Task: build "#/methods" from methods.json and manifest.json (content spec in section 9).

Sections, each with one plain-language paragraph (static explanatory text is fine; results are not):
1. What we did in five steps (static text; constants such as dates and resolutions read from methods.decisions).
2. "The ruler was bending": DriftChart from "@/viz" per region + the eras table from each region's calibration.json.
3. "Does the translation work?": validation table grouped by region: test name in plain words (map test ids to labels
   in src/lib/labels.js), our value, the baselines, n, years, note. Lower-is-better tests show which is lower with an
   icon and text.
4. "Tested on a world where we know the answer": planted_truth table with pass/fail in text and icon, and a link to
   numbers_audit.md.
5. "How well did the old satellite see?": EyesightCurve per region with its status in words
   (validated / exploratory / not available) and the k_compare table.
6. Data: inputs table (source, region, rows, dates, how obtained), filters table, sources list with links and checked dates.
7. Limitations (list from JSON), AI use (text from JSON), attribution (NASA FIRMS, Natural Earth, OpenStreetMap
   contributors/OpenFreeMap), "Not affiliated with or endorsed by NASA."
Any missing part hides itself.

Acceptance: npm run typecheck && npm run test && npm run build.
```

### C1 · Date range and range analytics (Sun 07:00; challenge requirement)
```text
Task: add the date-range bar and "In this period" analytics to the region page.

- DateRangeBar (sticky under the header on the region page): from/to with the shadcn calendar popover, quick presets
  (All years, Last 10 years, VIIRS era 2012+, This year, Last 12 months), min 2003-01-01, max = regions.json
  last_data_day. Writes from/to to the URL. All charts receive `range` (they dim cells outside it).
- src/lib/range.js (pure, unit-tested) working on daily.json for the selected lens (harmonized by default; lenses not
  present in daily.json fall back to harmonized with a note):
  total in range and its lo-hi; number of days with data and days missing; busiest day; busiest month-year and busiest
  year, plus a top-5 list of each ("which months and years had the most burning"); mean per year for years fully inside
  the range. Missing days are skipped and counted, never treated as zero. A year or month that is less than 90% / 80%
  covered is marked incomplete and excluded from rankings.
- "In this period" panel: those numbers as a compact list with units and KindBadges (a range mixing observed and
  harmonized days shows both badges), and two small ranked lists: Top years, Top months.
- "This month vs normal" line from nowcast.month_to_date (challenge wording), shown when the range includes today.

Tests for range.js: totals on a fabricated daily series; nulls skipped and counted; incomplete years excluded from the
ranking; range clipped to available data; leap day handled.

Acceptance: npm run typecheck && npm run test && npm run build.
```

### C2 · Downloads (challenge requirement)
```text
Task: add the Downloads section to the region page (contracts section 7, "Downloads offered").

- src/lib/exportCsv.js (pure, unit-tested): buildSeriesCsv(daily, lens, range) -> string with header
  date,series,value,lo,hi,kind,source,unit (missing days have empty value fields and kind "missing");
  buildCalendarCsv(grain, weekly|monthly, lens, range) -> a year x week or year x month table with a leading "year"
  column. First line of every CSV is a comment row: "# FireRosetta <code_version> <generated_at> region=<id>
  lens=<lens> unit=<unit> source=NASA FIRMS" so the file explains itself.
- src/lib/exportImage.js: given the chart's root SVG element (viz components expose it by ref), produce an SVG file
  (inline computed styles and CSS variables) and a PNG at 2x via canvas. No new dependency.
- Hotspot CSV: a button for hotspots_recent.csv (plain link with the download attribute) and, if downloads.json exists,
  the list of yearly archives overlapping the selected range with sizes; if none exist say so plainly.
- "Season Brief (PDF)" button linking to #/r/:region/brief.
- File names: firerosetta_<region>_<lens>_<from>_<to>.csv etc.

Tests: CSV has one line per day in range plus header and comment; missing days serialise correctly; commas in units are
quoted; calendar CSV has 52 or 12 value columns.

Acceptance: npm run typecheck && npm run test && npm run build; download each file once and open it.
```

### D1 · Draw your own area (Should; only after C1 and C2 are merged)
```text
Task: the area-of-interest lens. HexMap from "@/viz" calls onAoiChange(cellsR5) when the user draws a rectangle or
clicks hexagons. Put the selection in the URL (aoi).

- src/lib/aoi.js (pure, unit-tested): given parsed cells_monthly.csv rows, calibration.json and a set of res-5 cells:
  monthly harmonized series for the area = Aqua cell-days for months inside the Aqua era, primary VIIRS cell-days x that
  sensor's monthly k for later eras (eras and k from calibration.json), with lo/hi from k lo/hi; then a month x year
  table, the per-month median over baseline years, and the current month's ratio to its median.
- UI: when an area is selected, a panel "Your area ({n} hexagons, about {km2} km2)" shows a CalendarHeatmap
  (grain month) built from the area series, the top-5 months, and the line "Calibration measured for the whole region
  is applied to your area. Treat small areas as indicative." with kind badges. A "Clear area" button.
- Load cells_monthly.csv lazily on first use; show progress; if the file is absent hide the draw control.

The acceptance test that matters: selecting ALL cells of the region reproduces monthly.json "harmonized" for every
non-missing month within 0.5%. Write it as a vitest using the sample data, and run it again on real data on Sunday.

Acceptance: npm run typecheck && npm run test && npm run build.
```

### D2 · Season Brief (Should)
```text
Task: build "#/r/:region/brief": a one-page, print-first summary for someone who will never open the app.

A4/Letter portrait, light background (override the dark theme with a .brief class and @media print rules), black text,
no navigation. Content, top to bottom: region name and date generated; the verdict sentence with the two trend figures;
a month x year CalendarHeatmap (compact, mode activity); the critical windows as plain sentences with dates
("Most burning happens from mid-October to mid-November") and the shift sentence when present; this week's status
sentence with as_of; the hexagon map as a static image if available (skip if the map failed to load); a legend that
explains hatched (no data) and dashed (estimate); a footer with the URL, "Fire data: NASA FIRMS", the code_version and
"Harmonized values are estimates on the MODIS Aqua scale." Every sentence comes from the JSON sentence fields.
A "Print or save as PDF" button calls window.print() and is hidden in print. Sections whose data is absent are omitted
without leaving gaps.

Acceptance: print preview fits on one page in Chrome and Firefox for all the approved whole-US region and separate simulator; npm run build.
```

### D3 · Smoke tests, accessibility, phone (Sun 13:00)
```text
Task: add Playwright tests in web/e2e/ run against `npm run preview`:
- each route loads with zero console errors and zero failed requests (except the optional basemap host);
- on a region page: switching view, lens and mode changes the URL and re-renders; the range presets work; a download
  starts; the SAMPLE banner is present on sample data and absent when manifest.contains_sample is false;
- axe finds no serious or critical violations on each route;
- at 390x844 nothing overflows horizontally.
Fix what they find in my folders; for issues inside web/src/viz/ write a short list for R6.

Acceptance: npx playwright install chromium && npx playwright test
```

### E1 · Freeze (Sun 16:00–17:00)
```text
Task: pre-freeze hardening.
- Lazy-load maplibre-gl, terra-draw and the methods page; confirm the landing page's JS is under 250 kB gzipped
  (print the build's chunk table).
- Add <title> and meta description per route, an Open Graph image (a static PNG R6 provides), a favicon, lang="en".
- A catch-all route and an error boundary with a friendly message and a link home.
- Confirm no request leaves the site's origin except the optional basemap (list every external URL in the built files).
- Run typecheck, unit tests, e2e, build. Tag the commit freeze-1700.
After the tag only bug fixes are merged, each with a one-line reason.
```

## 9. Screen content specification

| # | Screen | Must show | Words come from |
|---|---|---|---|
| 1 | Broken ruler (landing) | Headline: "Is it really burning more, or did the satellite get better eyes?" · BrokenRuler · the ruler sentence · why-now line · "Pick a place" · QR | `ruler.sentence`, `methods.sources` |
| 2 | Place picker | Region cards with outline, fire type, story, status badge | `regions.json`, `nowcast.status` |
| 3 | Verdict | Verdict sentence · two trend figures with ranges · robustness table | `trend.json` |
| 4 | Calendar | Clock / Weeks / Months · six lenses · activity / anomaly · critical-weeks band · cell detail panel | `weekly, monthly, climatology, season` |
| 5 | Critical weeks | Window sentences · SeasonShiftChart (when `by_year` is non-empty) | `season.json` |
| 6 | This week | Status sentence · PercentileStrip · as-of · month-to-date line | `nowcast.json` |
| 7 | Where | HexMap with metric toggle (critical weeks / all year) · draw control (Should) | `hex.json`, `outline.geojson` |
| — | In this period · Downloads | Range analytics · five downloads | `daily.json`, `downloads.json` |
| 8 | Season Brief | One printable page | sentence fields |
| 9 | Methods | Seven sections of prompt B3 | `methods.json`, `manifest.json`, `calibration.json` |

Fixed copy you may write by hand (no results in it): headlines, section titles, button labels, glossary definitions, explanations of method. Anything with a number, a direction ("rose", "fell"), a date of a satellite event or a status is JSON.

## 10. Glossary (hover text; put in `src/lib/glossary.js`)
| Term | Hover text |
|---|---|
| Hotspot | A satellite pixel much hotter than its surroundings when the satellite passed. Usually a fire; sometimes a factory, flare or volcano. Not the same as one fire. |
| MODIS | NASA instrument on the Terra (morning) and Aqua (afternoon) satellites. Sees about 1 km squares. Fire data since 2000. |
| VIIRS | Newer instrument on Suomi NPP, NOAA-20 and NOAA-21. Sees 375 m squares, so it catches smaller fires. Fire data since 2012. |
| FIRMS | NASA's Fire Information for Resource Management System, which distributes both fire records. |
| Fire cell-day | One map hexagon (about 36 km²) on one day in which a satellite saw at least one hotspot. Our unit of burning activity. |
| Aqua-equivalent | A value expressed as what MODIS Aqua's afternoon pass would have recorded. |
| VIIRS-equivalent | A value expressed as what VIIRS would have recorded. Before 2012 this is an estimate. |
| Harmonized | Two satellite records put on one scale so they can be compared. |
| Observed / Harmonized / Estimated / No data | Recorded directly by the reference satellite / translated from another satellite / modelled for a time before that satellite existed / the satellite was not working. |
| Percentile | Where this period ranks among the same period in past years. 90th means busier than 90 % of them. |
| Critical weeks | The fewest weeks that together hold 80 % of a typical year's burning. |
| FRP | Fire radiative power: heat a fire gives off per second, in megawatts. A rough measure of strength. |
| Eyesight curve | The chance that MODIS Aqua detects burning that VIIRS saw, depending on how strong the fire is. |
| Naive splice | What you get by switching from MODIS to VIIRS in 2012 without correcting anything. |
| Range (likely range) | The interval our calculation gives 9 times out of 10 when the data are resampled. |
| NRT | Near-real-time data: available within hours, before final quality processing. |

## 11. Standalone accuracy checks
| Check | Input | Expected |
|---|---|---|
| Schema guard | JSON missing a required field | section shows "failed validation", app keeps running |
| SAMPLE banner | any row `kind: sample` | banner visible on every route |
| Range totals | fabricated daily series | hand-computed totals; nulls skipped and counted |
| Series CSV | 10-day range | 10 data lines, missing days blank |
| AOI = region | all cells selected | equals `monthly.json` within 0.5 % |
| URL state | every parameter | round-trips; bad values ignored |
| No external calls | built files | only the optional basemap host |
| Phone | 390 × 844 | no horizontal scroll |

## 12. If things go wrong
- **R6's component is not ready:** their stub renders a labelled box; lay out around it. Never draw a substitute chart in your folders.
- **Real JSON fails validation on Sunday:** the section shows the reason; send R1 the file name and the ajv message. Do not loosen the schema check.
- **Pages deploy fails:** `npm run build` output is a static folder; Netlify Drop or Cloudflare Pages (both free) host it in two minutes. Tell R2 the new URL.
- **AOI test fails:** cut the draw control (hide it behind `?debug=1`) and tell R1.
- **Bundle is slow on a phone:** lazy-load the map and the Methods page first; drop the Open Graph image last.
