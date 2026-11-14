# R6 · Visualization and Design System

## 1. Your mission
You make 24 years of fire data readable in ten seconds. You own the look (colour, type, spacing) and every chart: the broken ruler, the Fire Year Clock, the week and month calendars, the trend and percentile graphics, the hexagon map, and the three Methods charts. R5 places your components on screens; you never fetch data or route.

Two things are judged directly from your work: **accessibility of the colour ramps** (the challenge text asks for it) and **whether a stranger can name a region's peak season at a glance**.

## 2. You own / you never touch
- **Own:** `web/src/viz/`, `web/src/styles/tokens.css`, `design/`.
- **Never touch:** the rest of `web/` (R5), `web/public/data/` (R1), `web/package.json` (R5; every package you need is already installed, see `01_ARCHITECTURE.md` §6.3).

## 3. Inputs and outputs
| You read | From | Contract |
|---|---|---|
| Sample JSON in `web/public/data/` (from Sat 18:15), real JSON (Sun 10:00) | R1 | §6 |
| TypeScript types `web/src/data/types.gen.ts` (import types only) | R5 | §6 |

| You produce | For | Contract |
|---|---|---|
| Components exported from `web/src/viz/index.ts` with **exactly** the props in contracts §8, plus `percentileRank(value, others)` | R5 | §8 |
| `tokens.css` (CSS variables for colour, type, spacing, light print theme) | R5 | — |
| `Gallery` component (R5 mounts it at `#/gallery`) | yourself, reviewers | — |
| Screenshots and an Open Graph image in `design/exports/` | R2 (slides, video), R5 | — |

## 4. What the other five are doing
| Role | Doing | Touches you how |
|---|---|---|
| R5 | App shell, data loading, screens, downloads, deploy | Pushes the scaffold by **17:00 Saturday**; you then commit **stubs for every component by 17:30** so their pages compile. They pass you data as props and take a `ref` to your SVG for export. |
| R1 | Schemas, sample data, real JSON | The shapes you draw. Sample data is built to exercise your edge cases (missing weeks, estimated band, extreme year). |
| R3 | Calibration, validation | Their drift numbers are your `DriftChart`. |
| R4 | Eyesight curve | Their `curve` and `binned` arrays are your `EyesightCurve`. |
| R2 | Data, then slides and video | Needs clean screenshots by Sunday 16:00 and a readable 1920×1080 capture. |

## 5. Tools (all free)
D3 (scales, shapes, chromatic schemes, arcs), React + TypeScript, MapLibre GL JS, h3-js, Terra Draw, Tailwind (through tokens). Design: **Penpot** or Excalidraw for 30 minutes of wireframes, no more. Colour checks: Viz Palette, ColorBrewer, the WebAIM contrast checker, Chrome DevTools → Rendering → "Emulate vision deficiencies". Optional: Playwright MCP or Chrome DevTools MCP so your assistant can look at the gallery.

## 6. Your timeline
| Gate | You deliver |
|---|---|
| Sat **17:30** | Stubs for every component in `viz/index.ts` (so R5 compiles) |
| A · Sat 18:30 | `tokens.css`, `theme.ts` (scales), `Gallery`, `BrokenRuler` working on sample data |
| B · Sat 23:00 | `CalendarHeatmap` (week and month), `FireYearClock`, `TrendBars`, `PercentileStrip`, `KindBadge`, `Legend` on sample data with all states |
| C · Sun 10:00 | Real-data pass: scale domains, labels, performance; the 10-second test passed or the default view switched |
| D · Sun 14:00 | `SeasonShiftChart`, `EyesightCurve`, `DriftChart`, `HexMap` (draw control if S5 is alive) |
| E · Sun 17:00 | Accessibility and colour-vision pass; print styles; screenshots and Open Graph image handed to R2 and R5 |

## 7. Session primer (paste at the start of every AI session)
```text
You are assisting R6 on the FireRosetta project. Before doing anything, read these files fully:
- AGENTS.md
- plan/02_CONTRACTS.md sections 6, 8 and 9 (the JSON I draw, my component props, the enums)
- plan/03_SCIENCE_DECISIONS.md SD-08, SD-10, SD-11, SD-13 and section H
- plan/roles/R6_visualization.md (section 9 is the design specification)

I own only: web/src/viz/, web/src/styles/tokens.css and design/. Never edit files elsewhere, including package.json.
Components are pure: props in, SVG out. No fetch, no router, no global state, no hard-coded colours (use the CSS
variables and the scales in viz/theme.ts). Props must match contracts section 8 exactly.
Every chart must handle: kind "missing" (hatched), "estimated" (dashed, lighter), empty data, one year of data, and
values of zero. Never draw missing as zero. Never rely on colour alone.
Reply first with a three-line restatement and the list of files you will create or change. Run the acceptance commands and
paste their real output. Finish with a five-line handoff note.
```

## 8. Prompts

### A1 · Stubs, tokens, theme, gallery (start as soon as R5's scaffold is on main; stubs by 17:30)
```text
Task, in this order:
1. web/src/viz/index.ts exporting every component named in plan/02_CONTRACTS.md section 8 with exactly those prop
   types (import types from "@/data/types.gen" or "@/data/types"; if neither exists yet declare minimal local types
   in viz/types.local.ts and switch later). Each component is a stub: a bordered box showing its name and the size of
   its main prop. Also export percentileRank(value: number, others: number[]): number implementing SD-11
   (100 * (count(others < v) + 0.5 * count(others == v)) / n). Commit and merge this step alone first.
2. web/src/styles/tokens.css per section 9.1 of my role file: CSS variables for the dark theme (default), a .brief /
   @media print light theme, type scale, spacing, radius, focus ring.
3. web/src/viz/theme.ts per section 9.2: activityScale(max), anomalyScale(), kind styles, SVG <defs> for the hatch
   pattern, number and date formatters.
4. web/src/viz/Gallery.tsx: loads the sample JSON for a region chosen in a <select> (this is the ONE place in viz that
   may fetch, and only from `${import.meta.env.BASE_URL}data/`), then renders every component in every state:
   normal, all-missing, with estimated band, single year, empty. Export it from index.ts.

Tests (vitest, web/src/viz/__tests__): percentileRank ties and bounds; activityScale(0) is the "zero" colour and is
monotonic in lightness; anomalyScale(50) is the neutral colour.

Acceptance (from web/): npm run typecheck && npm run test && npm run build
```

### A2 · BrokenRuler (by 18:30)
```text
Task: implement BrokenRuler (spec 9.3) from ruler.json.
Two lines on one index axis (1.0 = each line's own 2003-2011 average): the naive line (thin, neutral colour, labelled
"Raw record, as downloaded") and the harmonized line (thick, accent colour, labelled "Harmonized"). A vertical marker
at 2012 labelled "New satellite sensor". The gap between the lines from 2012 is lightly shaded and annotated with the
jump multiple read from ruler.jump_multiple ("x{value}" with its range in the title/tooltip). Direct labels at the line
ends, no separate legend. With animate=true: draw the naive line first, pause, then draw the harmonized line; skip all
animation under prefers-reduced-motion. Axis: years every 5; y ticks at sensible indices; y starts at 0.
Accessible: role="img" with an aria-label built from ruler.sentence; a visually hidden table of the values.
Responsive from 320 to 1200 px wide via viewBox.

Acceptance: npm run typecheck && npm run build; check in the gallery at 360 px and 1280 px, in all three sample regions.
```

### B1 · CalendarHeatmap, week and month (start 18:30)
```text
Task: implement CalendarHeatmap (spec 9.4).
Rows = years (2003 at top), columns = 52 weeks or 12 months; month labels on top for both grains.
- lens selects the series; "naive_splice" = aqua_raw before 2012 and viirs_raw from 2012 (draw a vertical-in-time
  marker row label at 2012: "sensor switch").
- mode "activity": fill = activityScale on the value, domain 0..p99 of the lens's values (sqrt scale).
  mode "anomaly": fill = anomalyScale on percentileRank of the cell against the same week/month in the baseline years
  of the same lens; cells whose climatological p90 < 5 (week) are drawn in the neutral "too little to rank" style.
- kind missing: hatch pattern, no colour. kind estimated: lighter fill + dashed cell outline. Never colour a missing cell.
- season.critical_weeks: a band above the grid marking those columns, labelled "critical weeks"; for grain month,
  mark months containing any critical week.
- range: cells outside [from, to] at 25% opacity.
- Era strip on the left edge of each row: a 3 px bar coloured by the row's source (aqua / snpp / noaa20) with a legend.
- Hover and keyboard focus: tooltip with period, value + unit, lo-hi if different, kind in words, source.
  Arrow keys move between cells; Enter calls onSelect; each cell has an aria-label.
- Canvas is not needed: at most 24 x 52 rects.

Tests: cell count; a missing row yields hatch fills; naive_splice picks the right series each side of 2012;
anomaly neutral rule.

Acceptance: npm run typecheck && npm run test && npm run build; gallery shows week and month grains in both modes.
```

### B2 · FireYearClock
```text
Task: implement FireYearClock (spec 9.5): the same data as the week heatmap, wrapped around a circle.
- 52 angular segments, week 1 at 12 o'clock, clockwise. One ring per year: 2003 innermost, the current year outermost.
  Inner radius 24% of the outer radius; equal ring thickness; 0.5 px gaps.
- Fills, lenses, modes, missing/estimated styles and range dimming identical to CalendarHeatmap: share one function
  that maps a cell to its style (viz/cellStyle.ts) so the two can never disagree.
- Month names around the outside; thin spokes at month boundaries. Critical weeks: an outer arc band with a label.
- The current year's ring has a 1.5 px outline. The centre shows the region's typical peak in words computed from
  season.windows[0] ("Peak: late October") or, on hover/focus, the hovered cell's year, week dates and value.
- Year labels on the ring at week 1 for every fifth year.
- Same keyboard model: left/right = week, up/down = year, Enter = onSelect. aria-label per cell.
- Use d3.arc; one <path> per cell (about 1,250); no per-frame work on hover (use CSS :hover/:focus for the outline).

Then run the 10-second test with two teammates who have not seen it: show the conus sample and ask "When is peak
season?" and "Which year was worst?". Write the result in design/clock_test.md. If either fails, tell R5 to default
`view` to "months" (their one-line change) and keep the clock as a toggle.

Acceptance: npm run typecheck && npm run test && npm run build.
```

### B3 · TrendBars, PercentileStrip, KindBadge, Legend
```text
Task: implement four small components (spec 9.6).
- TrendBars: two horizontal range bars on a shared percent-per-decade axis with a zero line: "Raw record" (naive) and
  "Harmonized". Each shows a dot at the value and a bar from lo to hi; a bar crossing zero is drawn in the neutral
  colour with the text "no clear change"; otherwise an up or down arrow icon and the signed value. Text labels always.
- PercentileStrip: a horizontal strip with one tick per past year at its value position (from nowcast.history), bands
  for below/normal/above/extreme, and a marker for this week with its value. For status low_activity or unavailable
  render the calm empty state with the sentence only.
- KindBadge: a small label with an icon and text for observed / harmonized / estimated / missing / sample; shape and
  text differ, not only colour.
- Legend: a colour ramp for "activity" (with 0 and max labelled in the given unit) or "anomaly" (labelled "quieter than
  usual", "typical", "busier than usual"), plus swatches for "no data" (hatched) and "estimate" (dashed).

Acceptance: npm run typecheck && npm run test && npm run build; all states visible in the gallery.
```

### C1 · Real-data pass (Sun 10:00, after R1 announces real data)
```text
Task: open the gallery and the three real region pages and fix what real data breaks, only inside web/src/viz/.
Check and report with screenshots: (1) scale domains (one extreme year must not wash out the rest: confirm the p99 +
sqrt choice or switch that one constant in theme.ts); (2) label collisions at 360 px; (3) rows with long missing runs
(outages) read as "no data", not as quiet; (4) the era strip changes at 2023 and 2026; (5) the 2012 marker in the
naive lens; (6) hover performance on the clock in Firefox; (7) regions that are off-season now.
List anything that needs a data fix for R1 or a layout fix for R5; do not patch around data problems.
```

### D1 · SeasonShiftChart, EyesightCurve, DriftChart
```text
Task: implement the three charts (spec 9.7).
- SeasonShiftChart: for each window in season.windows, a panel with years on x and day of year on y (labelled with
  dates): a vertical segment per year from start_doy to end_doy with a dot at centroid_doy, and Theil-Sen trend lines
  for start and end drawn only when the shift range excludes zero (dashed otherwise). Caption = window.sentence.
  If by_year is empty render nothing (return null).
- EyesightCurve: x = fire strength (FRP, MW, log scale 0.5 to 2000), y = chance Aqua saw it (0 to 100%). The fitted
  curve with its band, binned points sized by n, a dotted horizontal line at the ceiling c labelled "Aqua was looking
  about {c}% of the time", and a status chip (validated / exploratory). For status "absent" render a one-line message.
- DriftChart: yearly k for one region with range whiskers, a horizontal band for the 2013-2022 mean, and a vertical
  line at trustedThrough labelled "We stop trusting Aqua here". Years after the line in the warning style.
All three: accessible names, hidden data tables, responsive, values and labels from props only.

Acceptance: npm run typecheck && npm run test && npm run build; gallery shows each in every state.
```

### D2 · HexMap (and the draw control if S5 is alive)
```text
Task: implement HexMap (spec 9.8) with maplibre-gl and h3-js.
- Build a GeoJSON FeatureCollection of hexagons from hex.cells (h3-js cellToBoundary, GeoJSON order) with the chosen
  metric as a property; fill-extrusion is not needed: a flat fill layer coloured with activityScale steps and a thin
  outline; the region outline as a line layer; fit bounds to the outline or the cells.
- Basemap: try the style URL https://tiles.openfreemap.org/styles/liberty at reduced opacity. If the style fails to
  load within 4 seconds or errors, fall back to an empty style ({version: 8, sources: {}, layers: []}) with the page
  background colour, so hexagons and outline always render. Show the required attribution when the basemap is on.
- Hover: tooltip with the value and unit. Click toggles a cell in selectedCells (outlined in the accent colour).
- drawEnabled: a "Draw area" button uses terra-draw (rectangle mode) with the MapLibre adapter; on finish, select all
  res-5 cells whose centre is inside the rectangle and call onAoiChange with their indexes; "Clear" calls it with [].
- Lazy: export HexMap through React.lazy from index.ts so maplibre is not in the main bundle. Clean up the map on unmount.
- No WebGL (or test environment): render a static SVG of the hexagons with the same colours.

Acceptance: npm run typecheck && npm run build; in the gallery, block the tile host in DevTools and confirm the
fallback; draw a rectangle and see the selected cells logged by the gallery.
```

### E1 · Accessibility, colour vision, print, exports (Sun 14:00–16:00)
```text
Task: final quality pass inside web/src/viz/ and tokens.css.
1. Colour vision: for each of protanopia, deuteranopia, tritanopia and achromatopsia (Chrome DevTools emulation),
   confirm on the heatmap and clock that low/high activity, quieter/busier, no-data and estimate remain
   distinguishable. Record a pass/fail table in design/a11y_check.md. Fix tokens if any fail.
2. Contrast: body text >= 4.5:1, large text and chart axes >= 3:1, focus ring >= 3:1 against both themes
   (list the measured ratios).
3. Keyboard: every chart reachable and operable; visible focus; Escape closes tooltips.
4. Reduced motion respected. No information conveyed by animation alone.
5. Print (.brief and @media print): charts render in the light theme with dark text; hatch patterns survive printing.
6. Exports for R2 and R5 into design/exports/: 1920x1080 screenshots of the broken ruler, the clock, the month
   calendar (activity and anomaly), the verdict bars, this-week strip, drift chart, eyesight curve, hex map; and a
   1200x630 Open Graph image. Use real data, a real region, no SAMPLE banner.
```

## 9. Design specification

### 9.1 Tokens (`tokens.css`)
- **Theme:** dark by default (fire colours read best on dark). Background `#0e1116`, surface `#161b22`, border `#2a313c`, text `#e6edf3`, muted text `#9aa7b4`, accent (harmonized line, focus) `#58a6ff`, warning `#f0883e`. Light print theme: white background, `#111` text, same ramps.
- **Type:** Inter variable (bundled). Sizes 12 / 14 / 16 / 20 / 28 / 40 px; numbers use tabular figures. Charts never go below 11 px.
- **Spacing:** 4 px grid. Radius 8 px. Focus ring 2 px accent with 2 px offset.
- Expose everything as CSS variables (`--fr-bg`, `--fr-surface`, `--fr-text`, `--fr-accent`, …) and map Tailwind's theme colours to them.

### 9.2 Scales (`theme.ts`)
- **Activity (sequential):** `d3.interpolateInferno` sampled on [0.10, 0.98], through `scaleSequentialSqrt`, domain `[0, p99]`. Exactly zero uses the surface colour with a faint outline, so "covered, nothing burning" differs from the lowest non-zero.
- **Anomaly (diverging):** `d3.interpolatePuOr` reversed so **orange = busier, purple = quieter**, centred at the 50th percentile, domain 0–100. Colour-blind safe.
- **No data:** 45° hatch pattern, 1 px lines in the muted colour, on the background colour. Never a fill from either ramp.
- **Estimate:** the ramp colour at 70 % opacity plus a dashed 1 px outline.
- **Sensors (era strip, lines):** Aqua `#58a6ff`, S-NPP `#f0883e`, NOAA-20 `#bc8cff`; always with a text label.
- **Status colours** (always paired with text and an icon): low_activity grey, below_normal purple, normal neutral, above_normal orange, extreme deep orange with a bold outline.

### 9.3–9.8 Component notes
- **9.3 BrokenRuler:** the story in one picture; it must read without interaction.
- **9.4 CalendarHeatmap:** the workhorse and the fallback default. Month grain answers the challenge's "which month and years" directly.
- **9.5 FireYearClock:** the signature. Seasons appear as wedges; a shifting season appears as a spiral twist. It must pass the 10-second test or step back to a toggle.
- **9.6 Small components:** always show the range, never a bare number.
- **9.7 Methods charts:** captions state the takeaway in words.
- **9.8 HexMap:** must work with no basemap and no WebGL.

### 9.9 Rules for every chart
1. Title or caption in plain words; unit on the axis or legend.
2. Direct labels instead of a detached legend where possible.
3. `role="img"`, an `aria-label` that states the takeaway, and a visually hidden data table.
4. Root `<svg>` forwarded by `ref` so R5 can export it; all styling resolvable from CSS variables on the root.
5. Works from 320 px wide; no horizontal scroll.
6. No hard-coded numbers, labels of results, or regions.

## 10. Standalone accuracy checks
| Check | Input | Expected |
|---|---|---|
| Percentile | value above 22 of 23 | 95.65 |
| Missing never coloured | row of nulls | hatch only |
| Clock = heatmap | same cell, both components | identical style object |
| Naive splice | lens `naive_splice` | Aqua before 2012, VIIRS from 2012 |
| Off-season neutral | p90 < 5 | "too little to rank" style, not orange |
| Basemap failure | tile host blocked | hexagons and outline still drawn |
| Colour vision | four emulations | all four distinctions hold |
| 10-second test | two fresh viewers | both name the peak season |

## 11. If things go wrong
- **The clock is slow or unreadable:** the month calendar becomes the default (R5 flips one default); the clock stays as a toggle and as the video's hero shot.
- **MapLibre misbehaves on one OS or browser:** ship the SVG hexagon fallback as the map; cut the draw control.
- **Sample data lacks a state you need:** ask R1 to add it to the sample generator; meanwhile fabricate it inside the gallery only.
- **Out of time on D-prompts:** priority order is DriftChart → EyesightCurve → HexMap → SeasonShiftChart.
