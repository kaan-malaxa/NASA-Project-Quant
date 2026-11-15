# Requirements and evidence

This matrix retains every role milestone. Historical schedule and three-region requirements are superseded by the authorized whole-US polygon scope. Runtime web code stays JavaScript; generated declarations and compiler checking replace the original TypeScript conversion. Numerical results come from the generated numbers audit. Evidence status is resolved by the acceptance log; this document does not substitute a planned check for an executed check.

| Requirement | Implementation / scope | Evidence / status | Outstanding or superseded |
|---|---|---|---|
| M1–M2 | Local FIRMS ingestion, fixed Tier 1 calibration, coverage, V1–V6 | Pipeline tests and real rebuild | Three showcase regions superseded by whole US |
| M3–M4 | Calendars, clock, verdict, critical weeks, current activity; independent analysis-years/exact-dates controls | Web unit and real-browser checks | Current activity unavailable without genuine NRT |
| M5 | CSV/chart/brief downloads; local yearly hotspot archives | Export tests and browser downloads | Archive release URLs require human publication |
| M6 | Kind/missing styles, sample banner, NASA FIRMS credit | Unit, contract, browser accessibility and design checks | No invented current observations |
| M7 | Full synthetic pipeline and planted-truth comparisons | methods.json and numbers_audit.md | Failures must remain visible |
| M8 | README, submission, slides/video drafts and CI | Documents and local build | Identities, final links, video recording and submission pending |
| S1–S2, S7 | Eyesight, matching excluded-year comparison, seasonal timing and drift | Scientific regression tests and Methods page | Human scientific sign-off pending |
| S3–S5 | Authoritative yearly spatial shards, map, AOI, selected-period brief | All-nonmissing-month Node cross-check, browser/print checks | Small-area calibration is indicative |
| S6 | Deterministic yearly archives prepared locally | hotspot_inventory.json and archive tests | External upload pending |
| Design: scales / kinds | Sequential activity and diverging anomaly; hatch/dash styles | Chart unit tests and regenerated design evidence | Colour alone carries no kind meaning |
| Design: clock usability | Keyboard, responsive rings and reduced motion | Automated checks; design/clock_test.md | Two fresh human viewers still required |
| Design: map | Analysis polygon unchanged; display longitude wrapping retains Alaska/Hawaii | Antimeridian regression and basemap-failure browser check | Optional basemap may be absent |
| Publication | Complete proposal validated; manifest last; rollback on failure | Injected-failure tests and strict hash checks | External publishing excluded from repair |
| Provenance | Raw, staged, config, outage, polygon and downstream hashes | Tampering tests | Source CSVs are never rewritten |
| Period science | Every contiguous complete-year interval; fixed calibration/baseline; null availability states | Full-record reproduction and short/boundary-period tests | Fewer than three valid years cannot support a trend |
| Reproducibility | Locked dependencies, deterministic output and three-OS CI | Local tests; CI matrix configured | Other operating systems have not been executed in this Windows session |

| Milestone | Original requirement | Implementation status | Evidence |
|---|---|---|---|
| R1.A1 | JSON Schemas and the checker (start 16:30, 45 min) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R1.A2 | Sample data generator (45 min, must be merged by 18:15) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R1.B1 | Calendar core: weekly, monthly, daily, climatology (start 18:30) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R1.B2 | Trend, naive record, broken ruler, verdict sentence | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R1.B3 | Critical weeks (Must) and season windows | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R1.C1 | This week and this month (start Sun 07:00) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R1.C2 | Assemble regions.json, methods.json, manifest; go real | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R1.D1 | Where it burns: hex.json, outline, cells_monthly.csv (Should) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R1.D2 | Tier 2 selection and the viirs_equiv lens | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R1.E1 | Numbers audit list (by Sun 16:00) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R2.A1 | Repo scaffold and shared library (start 16:30, must be on main by 17:45) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R2.A2 | Download helpers and region polygons (17:45–18:30, then leave downloads running) | Local-input implementation; external inputs, publication or cross-OS CI remain explicit limits | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R2.B1 | Clean (start 18:30; test on R4's synthland files first) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R2.B2 | Grid, static mask, coverage | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R2.B3 | Data profile (post in chat before Gate B) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R2.C1 | Nowcast fetch and recent hotspots (Sun 07:00) | Local-input implementation; external inputs, publication or cross-OS CI remain explicit limits | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R2.C2 | Verify outages and external facts (Sun 08:00, 45 min, mostly reading) | Local-input implementation; external inputs, publication or cross-OS CI remain explicit limits | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R2.D1 | README, slides, submission text (Sun 10:00–14:00) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R2.D2 | Yearly hotspot archives on GitHub Releases (Should; only if Gate C passed) | Local-input implementation; external inputs, publication or cross-OS CI remain explicit limits | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R2.E1 | Video script filled from the audit list (Sun 17:00) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R2.E2 | Cross-OS reproducibility (Sun 15:00, with one teammate on a different OS) | Local-input implementation; external inputs, publication or cross-OS CI remain explicit limits | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R3.A1 | science.yaml (start 16:30, on main by 17:15) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R3.A2 | The calibration factor (17:15–18:30) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R3.B1 | The daily series and calibration.json (start 18:30) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R3.B2 | Uncertainty and the naive record | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R3.B3 | Planted-truth check for Tier 1 (before Gate B) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R3.C1 | Validation V1, V2, V3 (start Sun 07:00) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R3.C2 | Drift, saturation, backcast (V4, V5, V6) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R3.D1 | Science review of the outputs (Sun 10:30, mostly reading) | Automated evidence prepared; human science review/sign-off pending | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R3.E1 | Numbers audit (Sun 16:00) | Automated evidence prepared; human science review/sign-off pending | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R4.A1 | The simulated world and FIRMS-format writer (start 16:30; tiny files to R2 by 18:00) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R4.A2 | truth.json expected answers | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R4.B1 | Matching at cell-day level (start 18:30) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R4.B2 | The three-parameter fit | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R4.B3 | Stage entry point and curve.json on synthland (before Gate B) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R4.C1 | Real data (Sun 07:00) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R4.C2 | Forward and backward translation | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R4.D1 | Validation and the status decision (by Sun 13:00) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R4.D2 | Plain-language text for the Methods page (Sun 13:30, 20 min) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R4.E1 | Planted truth, full run (Sun 15:00) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R5.A1 | Scaffold (start 16:30, on main by 17:00) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R5.A2 | Data layer, types, SAMPLE banner (17:00–18:30) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R5.B1 | Landing and place picker (start 18:30) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R5.B2 | Region page: verdict, calendar, this week | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R5.B3 | Methods page | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R5.C1 | Date range and range analytics (Sun 07:00; challenge requirement) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R5.C2 | Downloads (challenge requirement) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R5.D1 | Draw your own area (Should; only after C1 and C2 are merged) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R5.D2 | Season Brief (Should) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R5.D3 | Smoke tests, accessibility, phone (Sun 13:00) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R5.E1 | Freeze (Sun 16:00–17:00) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R6.A1 | Stubs, tokens, theme, gallery (start as soon as R5's scaffold is on main; stubs by 17:30) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R6.A2 | BrokenRuler (by 18:30) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R6.B1 | CalendarHeatmap, week and month (start 18:30) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R6.B2 | FireYearClock | Clock implemented; two-person usability test pending | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R6.B3 | TrendBars, PercentileStrip, KindBadge, Legend | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R6.C1 | Real-data pass (Sun 10:00, after R1 announces real data) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R6.D1 | SeasonShiftChart, EyesightCurve, DriftChart | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R6.D2 | HexMap (and the draw control if S5 is alive) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |
| R6.E1 | Accessibility, colour vision, print, exports (Sun 14:00–16:00) | Implemented; verification is recorded in the acceptance log | Role-owned implementation and tests; `docs/repair_acceptance.md` |

## Design specification details

| Requirement | Implementation | Evidence / status |
|---|---|---|
| D9.1 Tokens, typography, spacing, focus and print | tokens.css and bundled Inter | color, layout and print checks; design/a11y |
| D9.2 Sequential/diverging scales; zero, missing and estimate cues | viz/theme.js and cellStyle.js | color tests and vision-emulation exports |
| D9.3 Ruler readable without interaction | BrokenRuler.jsx | gallery, real output and shareable ruler export |
| D9.4 Month/year calendar fallback | CalendarHeatmap.jsx; shared percentile helper | keyboard/detail unit and browser tests |
| D9.5 Clock accuracy and usability | FireYearClock.jsx; identical cell-style tests | automated checks pass; two fresh human viewers pending |
| D9.6 Small charts retain ranges | TrendBars, PercentileStrip, KindBadge, Legend | viz unit tests and accessibility checks |
| D9.7 Methods chart takeaway captions | eyesight, drift and matching held-out agreement charts | Methods route and held-out regression tests |
| D9.8 Map without basemap/WebGL | HexMap SVG fallback and antimeridian projection | deliberately blocked basemap browser test; geometry tests |
| D9.9.1 Plain captions and written units | shared chart captions and region metadata | browser/real design checks |
| D9.9.2 Direct labels | chart labels and legends | design exports |
| D9.9.3 Accessible image labels and data tables | chart SVG labels and hidden tables | axe and component tests |
| D9.9.4 Forwarded SVG refs and export styles | viz refs and image export utilities | browser downloads and design export artifacts |
| D9.9.5 Responsive charts | narrow layout rules and wrapping labels | mobile no-overflow assertions |
| D9.9.6 Results/regions from data | generated JSON, period docs and numbers audit | audit pointer tests and delivery generator tests |

## Added architecture requirements

| Requirement | Implementation and evidence | Outstanding status |
|---|---|---|
| A1 Date selection | AnalysisYears, DateRangeBar, URL and period browser tests | Automated |
| A2 Downloads | CSV, image, calendar and local compressed hotspot exports | Hosting links pending |
| A3 Monthly heatmap and comparison | month calendar and month-to-date null/zero/leap regressions | Recent genuine input absent |
| A4 Critical band | selected-period season and calendar markers | Automated |
| A5 Low activity | shared percentile population and lens-unit thresholds | Automated |
| A6 Planted truth | full synthetic pipeline; methods.json planted_truth | Automated, human interpretation pending |
| A7 Drift evidence | year-specific calibration diagnostic and caption | Human causal interpretation pending |
| A8 Robustness and unclear verdict | complete correlated bootstrap; qualified unavailable comparisons | Automated |
| A9 Historical VIIRS lens gate | fixed held-out/backcast acceptance and estimated kind | Automated |
| A10 External claims | verified source links/check dates in methods.json and fact review | Submission guide confirmation pending |
| A11 Hash manifest and sample flag | strict checker; staged transaction tests | Automated |
| A12 Optional basemap and bundled fonts | SVG fallback; blocked-host browser checks | Automated |
| A13 Shareable URL | exact dates, analysis years, lens, mode, view, AOI | Automated |
| A14 Cross-OS | three-OS CI plus scientific-payload comparison job | Remote CI execution pending |
| A15 Submission text | pipeline.export.delivery fills docs/submission.md | Team identities and links pending |
| A16 Phone layout | real-data mobile/reduced-motion/accessibility browser checks | Automated |
