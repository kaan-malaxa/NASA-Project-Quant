# C1 · Real-data pass (R6)

**Status: done on R1's SAMPLE data. Redo on real data.** R1's branch `r1/contracts-stats-export`
(commit `6d28fe06`, 2026-11-14 19:10 -05:00) still has `code_version: "sample"` and every row
`kind: "sample"`. The layout fixes below hold for any data; the numbers in the table are sample
numbers and must be replaced once R1 publishes real data.

How it was checked (nothing written outside R6's folders):
- R1's `conus/*.json` were copied to a temporary folder outside the repo. The viz code (`buildHeatGrid`,
  `peakPhrase`) was run on them in a throw-away script.
- A temporary page mounted `<Gallery />` directly (R5's `#/gallery` is still a placeholder), built with
  R1's sample as its `data/` folder, and was driven with Playwright: Chromium at 360 px and 1280 px,
  reduced motion on; Firefox at 1280 px for hover timing. Screenshots: `design/c1/`.

## Checks

| # | Check | Result on sample | Verdict |
|---|---|---|---|
| 1 | Scale domain (p99 + sqrt) | Week harmonized: p50 = 119, p99 = 1582, max = 2683; 13 of 1241 cells clamp to the top colour. The extreme year 2020 (≈ 2.7× a typical year) does not wash out the rest. Month grain: 3 of 286 clamp. | Keep p99 + sqrt. No change to `theme.js`. |
| 2 | Label collisions at 360 px | Found and fixed 5 (see below). Re-run after fixes: no clipped or overlapping labels at 360 or 1280 px, no horizontal scroll, smallest chart text 11 px at 360 px. | Pass |
| 3 | Long missing runs read as "no data" | Sample has only isolated missing weeks (1–3 per year) plus VIIRS before 2012 (52/52 hatched per year). Missing cells are hatched (`design/c1/calendar_week_360.png`). No long outage inside a covered year exists in the sample. | Code OK; look again on real data |
| 4 | Era strip changes at 2023 and 2026 | Harmonized lens: Aqua 2003–2022, S-NPP 2023–2025, NOAA-20 2026. | Pass |
| 5 | 2012 marker in naive lens | `naive_splice`: Aqua 2003–2011, S-NPP 2012–2025, NOAA-20 2026. | Pass |
| 6 | Clock hover in Firefox | 3,775 clock cells on the gallery page. 252 hover moves: 9–11 ms per move vs 6.9 ms for moves over empty page (driver overhead), so ≈ 2–4 ms of work per hover. No long tasks, no errors, idle 145 fps. | Pass |
| 7 | Regions off-season now | conus critical weeks 11–17 and 27–39; now is week 46 (off-season). No cell fell into "too little to rank" (conus p90 ≥ 5 every week). Nowcast `above_normal` renders the strip. | Pass for conus; other regions unknown |

Clock centre text from `season.windows[0]`: "Peak: mid August" (window label "early-July to late-September").

## Fixed in web/src/viz/
1. **Horizontal scroll on every page with a chart.** The visually hidden data tables had `.fr-sr-only`
   on the `<table>`; a table ignores `width: 1px`, so the 52-column week table was 17,841 px wide.
   The class now sits on a wrapping `<div>` (BrokenRuler, CalendarHeatmap, FireYearClock, PercentileStrip,
   TrendBars). Test: `__tests__/c1.layout.test.jsx`.
2. **CalendarHeatmap:** era legend ran off the right edge ("VIIRS NOAA-20", "critical weeks"); it now wraps
   onto a second line and the chart grows to fit. Year labels "2025" and "2026" overlapped; a multiple-of-5
   year too close to the first or last row is no longer labelled.
3. **PercentileStrip:** the status headline and both footnotes ran past the right edge in narrow cards
   (at 1280 px too, since gallery cards are narrow). They now wrap.
4. **BrokenRuler:** the last year tick ("2025") was cut off at the right edge; edge ticks are anchored inward.
   In the single-year state the right-aligned "Raw record, as downloaded" label started left of the chart;
   it is now kept inside.

Not changed: the clock's curved "critical weeks" label sits close to "Aug" (`design/c1/clock_360.png`)
but does not cover it; the detector flagged only the curved text's bounding box.

## For R1 (data)
1. **Wrong path.** Data is committed at `firerosetta-plan-v2/web/public/data/`, but the site reads
   `web/public/data/` (AGENTS.md eng. rule 4, contracts §6). As committed, the app and gallery will not find it.
2. **One region only** (`conus`). C1 asks for three real region pages; the contracts still name `punjab`.
   Which regions are final? (team decision)
3. **Missing rows in the sample** carry `kind: "sample"` with `value: null`. Fine under science rule 10;
   confirm real data uses `kind: "missing"` for uncovered periods.

## For R5 (layout)
1. `#/gallery` still renders the placeholder; please mount `<Gallery />` from `@/viz` in `GalleryScreen.jsx`.
2. Re-check the region page at 360 px once it renders R1's data (no viz-side issues remain at 360 px).

## Redo on real data (checklist for the final pass)
- [ ] Rerun checks 1, 3, 4, 5, 7 with the real `weekly.json` / `monthly.json` and replace the sample numbers.
- [ ] Look for a real outage (a run of `kind: "missing"` inside a covered year) and confirm it reads as "no data".
- [ ] Repeat for every region in the final `regions.json`, not just conus.
- [ ] Rerun the 360 px screenshot pass; real labels (region names, sentences) may be longer than the sample's.

## Note (not a bug)
The calendar's `naive_splice` lens is Aqua → VIIRS (R6 prompt B1). The ruler/trend naive line is
MODIS Terra + Aqua → S-NPP (SD-09, contracts §6). Both follow their spec; their totals differ by design.
