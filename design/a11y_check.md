# E1 · Accessibility, colour vision, print, exports (R6)

**Status:** items 1–5 done and passing; item 6 (exports) done as **drafts on R1's sample data**.
R1's data is still `code_version: "sample"` (branch `r1/contracts-stats-export`, commit `6d28fe06`), so
the final exports must be re-made on real data with one command (see "Redo on real data").

Every number below was measured, not judged by eye:
- Colour and contrast: `web/src/viz/__tests__/a11y.color.test.js` (runs in `npm run test`; print the tables
  with `A11Y_PRINT=1 npx vitest run src/viz/__tests__/a11y.color.test.js --silent=false` from `web/`).
- Browser checks: `node design/tools/run.mjs check` → `design/a11y/check_results.json` and screenshots.

## 1. Colour vision

Method: Chrome's own vision-deficiency emulation (the same as DevTools → Rendering) for the screenshots in
`design/a11y/cvd_*.png`; Machado et al. (2009) matrices at full severity (and luminance for achromatopsia) for
the numbers. ΔE is the CIELAB distance between the two colours as that viewer sees them (about 2 = just
noticeable, 10 = clearly different). "Floor" is the minimum the test enforces.

**Pass/fail (heatmap and clock, both themes)**

| Distinction | Cue | Protanopia | Deuteranopia | Tritanopia | Achromatopsia |
|---|---|---|---|---|---|
| Low vs high activity | colour (lightness) | pass | pass | pass | pass |
| Quieter vs busier | colour + legend words + tooltip percentile | pass | pass | pass | pass, with caveat ¹ |
| No data | hatch pattern (never a colour) | pass | pass | pass | pass |
| Estimate | lighter fill + dashed outline | pass | pass | pass | pass |
| Zero ("covered, nothing burning") vs lowest activity | outline | pass (after fix ²) | pass | pass | pass (after fix ²) |

¹ In greyscale both ends of the purple–orange anomaly ramp are darker than "typical", so a moderately quieter
month and a strongly busier month can look the same grey. The ends stay distinct from each other (ΔE 20) and
from "typical"; the legend words, the cell tooltip ("83rd percentile of 2003–2025") and the hidden table carry
the direction. This is inherent to the diverging PuOr ramp required by spec §9.2; no token change can fix it.

² **Fixed.** In the dark theme the zero fill (`--fr-surface`) and the lowest ramp colour had the same lightness:
ΔE 2 in greyscale (invisible), 11 in tritanopia. Zero cells now carry a 1 px outline in `--fr-zero-stroke:
#6e7781` (was `#3a4350` at 0.5 px). See the table below.

**Measured ΔE (dark theme; light theme in brackets where it differs)**

| Distinction | Floor | Normal | Protan | Deutan | Tritan | Achromat |
|---|---|---|---|---|---|---|
| low vs high activity | 20 | 128 | 121 | 118 | 85 | 84 |
| low vs middle activity | 10 | 80 | 58 | 79 | 89 | 37 |
| zero outline vs lowest activity | 15 | 58 (83) | 49 (77) | 48 (76) | 39 (70) | 38 (70) |
| quieter vs busier (10th vs 90th percentile) | 15 | 100 | 95 | 100 | 59 | 20 |
| quieter vs typical | 10 | 87 | 82 | 80 | 67 | 66 |
| busier vs typical | 10 | 77 | 69 | 68 | 71 | 46 |
| no-data hatch lines vs hatch background | 20 | 63 (60) | 63 (60) | 63 (61) | 63 (60) | 63 (60) |
| estimate dashed outline vs page | 20 | 88 (95) | 89 (95) | 88 (95) | 88 (95) | 88 (95) |

Screenshots: `design/a11y/cvd_{calendar-activity,calendar-anomaly,clock}_{normal,protanopia,deuteranopia,tritanopia,achromatopsia}.png`.

## 2. Contrast (WCAG ratio)

| What | Needs | Dark | Light (`.brief`) | Print |
|---|---|---|---|---|
| Body text on page | 4.5 | 16.00 | 18.88 | 18.88 |
| Body text on cards / tooltips | 4.5 | 14.64 | 17.74 | 17.74 |
| Muted text (captions, axis labels) on page | 4.5 | 7.71 | 6.39 | 6.39 |
| Muted text on cards | 4.5 | 7.05 | 6.00 | 6.00 |
| **Chart axis lines** on page | 3 | **4.16** | **4.55** | **4.55** |
| Chart axis lines on cards | 3 | 3.80 | 4.27 | 4.27 |
| Focus ring on page | 3 | 7.49 | 5.19 | 5.19 |
| Focus ring on cards | 3 | 6.85 | 4.88 | 4.88 |
| Warning line + label | 3 | 7.47 | 5.03 | 5.03 |
| No-data hatch lines | 3 | 7.71 | 6.39 | 6.39 |
| Status headline: below normal / normal / above normal / extreme / low activity | 3 | 8.69 / 13.02 / 11.00 / 5.47 / 6.15 | 8.13 / 8.99 / 4.87 / 6.43 / 6.39 | same as light |
| Sensor lines: Aqua / S-NPP / NOAA-20 | 3 | 7.49 / 7.47 / 7.50 | 5.19 / 5.03 / 5.05 | same as light |

**Fixed.** Axis baselines used `--fr-border` (`#2a313c` on `#0e1116`, about 1.4:1). New token `--fr-axis: #6e7781`
is used for the axis lines of BrokenRuler (and its "1 = average" line), DriftChart, EyesightCurve and
SeasonShiftChart. Gridlines (`--fr-gridline`) stay faint on purpose: they are decorative and never the only
carrier of meaning.

## 3. Keyboard

| Check | Result |
|---|---|
| Every chart reachable with Tab | pass: 57 of 59 `.fr-viz` elements in the gallery; the 2 others are the colour keys (Legend), not charts |
| Visible focus | pass: `solid 2px` accent ring with `2px` offset on charts (rule now also covers the chart root, `.fr-viz:focus-visible`); calendar and clock outline the active cell |
| Calendar: arrows / Enter / Escape | pass: arrows move the active cell, Enter calls `onSelect`, focus shows the tooltip, Escape closes it |
| Clock: arrows / Enter | pass. The clock has no tooltip by design (spec 9.5): the focused cell is described in its centre text, so "Escape closes tooltips" does not apply |
| Empty calendar / clock | **fixed:** stayed out of the tab order when empty; now reachable and announce "no data" |
| HexMap | pass: "Draw area" and "Clear" are buttons; Escape closes the hover tooltip (**added**); the map canvas takes focus and pans/zooms with the arrow and +/− keys (MapLibre). In the no-WebGL drawing every hexagon is now a button toggled with Enter or Space (**added**) |
| HexMap known limit | on the WebGL map a single hexagon cannot be selected from the keyboard; every value is in the hidden table |

## 4. Reduced motion

| Check | Result |
|---|---|
| `prefers-reduced-motion: reduce` | pass: the ruler is fully drawn at once ("Harmonized" label opacity 1 at 150 ms) |
| No information by animation alone | pass: without the setting the ruler animates in (opacity 0 at 150 ms) and ends in the identical state (1 after 4 s). CSS transitions/animations are switched off under `reduce` in `tokens.css`; the map fits its bounds without animation |

## 5. Print (`@media print`) and `.brief`

| Check | Result |
|---|---|
| Light theme | pass: `--fr-bg` `#fff`, `--fr-text` `#111` on the calendar, clock and drift chart, both in print media and inside `.brief` |
| Dark text | pass: chart text fills `#111` / `#57606a` |
| Hatch survives printing | pass: `design/a11y/print_calendar.pdf` was made with "background graphics" **off** (the browser default) and still shows the hatching, the ramps and the era strip |
| Hatch readable in small cells | **fixed:** lines were 6 px apart, so a ~10 px clock cell showed one line and read as blank in print; now 4 px apart (`viz/defs.jsx`), 2–3 lines per cell |
| Token sets | the print block now provably equals `.brief` (tested); its indentation was corrected |

Screenshots: `design/a11y/{print,brief}_{calendar-activity,clock,drift}.png`.

## 6. Exports

`node design/tools/run.mjs export` renders each chart on its own slide: region name, a plain-words title,
the chart, and the "Data: NASA FIRMS" credit. Slides are laid out at 1280×720 and captured at 1.5×, so the
files are exactly 1920×1080 (Open Graph 1200×630) with text 1.5× larger than on screen, readable on slides
and in the video. Titles contain no typed numbers; the anomaly title's years and the Open Graph card's
season and year span are read from the data files.

**Drafts made now (sample data):** `design/exports/draft-sample/` — ruler, clock, calendar-activity,
calendar-anomaly, verdict, this-week, drift, eyesight, hexmap (1920×1080) and og-image (1200×630). Each
carries a visible "Sample data, not for release" tag. The tool refuses to write to `design/exports/` while the
manifest says `sample` (AGENTS.md science rule 10; E1 asks for real data and no SAMPLE banner).

## Redo on real data (when R1 publishes to `web/public/data/`)

```text
cd web && npx playwright install chromium        (once)
cd ..
node design/tools/run.mjs check                  (re-measure; screenshots now show real data)
node design/tools/run.mjs export                 (writes the final files to design/exports/)
```
Use `--region <id>` for a region other than the first in `regions.json`. Then hand
`design/exports/*.png` to R2 (slides, video) and R5 (Open Graph image), and delete `design/exports/draft-sample/`.

## Changed in this pass
- `web/src/styles/tokens.css`: `--fr-axis`; `--fr-zero-stroke` dark `#3a4350` → `#6e7781`; focus ring on the chart root; print-block indentation.
- `web/src/viz/theme.js`: zero outline 0.5 → 1 px.
- `web/src/viz/defs.jsx`: hatch spacing 6 → 4 px.
- Axis lines → `--fr-axis` in BrokenRuler, DriftChart, EyesightCurve, SeasonShiftChart.
- Every static chart is a tab stop; empty calendar/clock stay reachable; HexMap Escape and keyboard toggling in the SVG drawing.
- Tests: `__tests__/a11y.color.test.js` (contrast and colour-vision floors in both themes and print).
- Tooling: `design/tools/run.mjs`, `design/tools/harness/` (checks and exports; uses only packages already in `web/`).
