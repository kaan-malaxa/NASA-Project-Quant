# Loading frames verification

Structured token-based loading frames cover JSON sections, selected-area history, picker outlines, lazy routes and lazy chart boundaries. Shapes paint after 150 ms; space is reserved immediately. Active frames expose aria-busy and data-state=loading; decorative shapes are hidden from assistive technology. Reduced motion disables pulse. A 45-second stalled frame offers recovery rather than pulsing forever. Existing error and unavailable states take precedence.

The selected-area view currently loads authoritative spatial shards, rather than the older cells_monthly.csv path; its existing progress element is retained.

## Checks actually run

```text
npm run typecheck                 exit 0
npm run lint                      exit 0
npm run test                      61 files, 359 tests passed
npx playwright test --workers=2 --trace=off
                                  69 passed (3.0m)
Subsequent real-output + loading check
                                  13 passed (1.4m)
Final loading-height assertions    4 passed (1.2m)
VITE_BASE=/NASA-Project-Quant/ npm run build
                                  exit 0, 934 deployed data files compressed
```

The initial complete browser run caught an oversized ruler reservation that disabled the landing's pinned story. The chart sizing container was corrected, then the full suite passed. Later map activation measurements caught missing toolbar and notes space; the R5 wrapper now reserves those too. No R6 chart source was changed. Existing large lazy-chunk build warnings remain.

## Measured real-data height changes

Heights are CSS pixels. The network profile uses 562 ms latency, 1.6 Mbps download and 750 kbps upload. The regions response is held briefly for reproducible loading screenshots; the actual published JSON is then released unchanged. Other loading requests are not mocked. The optional basemap receives an empty valid style during the map activation check, keeping that check independent of external tiles.

| Element | 1280px skeleton → ready | Change | 390px skeleton → ready | Change |
|---|---:|---:|---:|---:|
| Picker grid | 224 → 224 | 0 | 704 → 704 | 0 |
| HEADER | 156 → 156 | 0 | 180 → 180 | 0 |
| Loading date controls | 162 → 162 | 0 | 302 → 302 | 0 |
| verdict | 520 → 518 | 2 | 790 → 786 | 4 |
| calendar | 1116 → 1116 | 0 | 1002 → 1000 | 2 |
| critical | 556 → 552 | 4 | 942 → 938 | 4 |
| week | 360 → 362 | 2 | 352 → 354 | 2 |
| map | 758 → 758 | 0 | 731 → 731 | 0 |
| downloads | 1148 → 1151 | 3 | 2236 → 2235 | 1 |

No measured section above changed by more than four pixels. The activated map stayed 758 → 758 at 1280px and 731 → 731 at 390px. Picker cards, calm nowcast bodies and map toolbars now retain a shared footprint; the map does not collapse while its chunk loads. Already-rendered sections reuse measured height on reload.

These measurements concern current published picker and US data at the requested widths. They are not a universal CLS guarantee: initial table lengths, omitted sections and future JSON text on other screens can still change first-load estimates. Missing/error states intentionally replace the loading layout immediately.

## Landing entry bundle

- `index-D7t8UtOS.js`: 166.17 kB gzip
- `jsx-runtime-B4UN2VIk.js`: 3.46 kB gzip
- `react-dom-gWqXm1NC.js`: 1.40 kB gzip
- `utils-D0T3A-kS.js`: 8.73 kB gzip
- `dist-KWYxbKud.js`: 15.25 kB gzip

HTML entry plus module preloads: **195.01 kB gzip**, below 250 kB. Lazy 3D, visualization and route chunks are separate. Every built script and stylesheet URL starts with `/NASA-Project-Quant/assets/`.

## Screenshots inspected

- [/pick, 1280px](test-results/skeleton-pick-1280.png)
- [/pick, 390px](test-results/skeleton-pick-390.png)
- [/r/us, 1280px](test-results/skeleton-r-us-1280.png)
- [/r/us, 390px](test-results/skeleton-r-us-390.png)

## Files changed

- `web/src/components/LoadingFrame.jsx`
- `web/src/components/LoadingFrame.test.jsx`
- `web/src/styles/loading.css`
- `web/src/components/ui/skeleton.jsx`
- `web/src/components/SectionState.jsx`
- `web/src/components/Viz.jsx`
- `web/src/app/AppRoutes.jsx`
- `web/src/app/AppShell.jsx`
- `web/src/screens/Picker.jsx`
- `web/src/screens/Region.jsx`
- `web/src/screens/Methods.jsx`
- `web/src/screens/Brief.jsx`
- `web/src/screens/Simulation.jsx`
- `web/src/screens/CountryBrowser.jsx`
- `web/src/screens/Landing.jsx`
- `web/src/screens/landing/LiveThisWeek.jsx`
- `web/src/screens/region/AoiPanel.jsx`
- `web/src/screens/region/AnalysisYears.jsx`
- `web/src/screens/region/CalendarSection.jsx`
- `web/src/screens/region/DownloadsPanel.jsx`
- `web/src/screens/region/NowcastBody.jsx`
- `web/src/screens/region/WhereSection.jsx`
- `web/e2e/skeletons.spec.js`
- `web/LOADING_REPORT.md` (this report)

No git commands were run. No files under src/viz/, contracts/, public/data/ or tokens.css were edited.
