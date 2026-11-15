# FireRosetta: Reading US Burning Activity Across Satellite Changes

FireRosetta makes a satellite record inspectable across changes in observing instruments. It calibrates separate sensor records to the Aqua scale, preserves missing observations and shows uncertainty, held-out prediction checks and the limits of the conclusion. A hotspot is a detection of heat in a pixel, not an individual fire. Counts describe fire cell-days, not burned area.

The static JavaScript application reads validated files from web/public/data/. Analysis years select complete calendar years and load Python-precomputed trend, season, climatology and ruler results. Exact dates independently select daily totals and downloads. Anomaly comparisons retain the configured historical baseline. Maps and area summaries sum authoritative daily-source contributions, including outage fills, calibration bounds and regional coverage scaling. The analysis polygon includes Alaska and Hawaii; display wrapping leaves that polygon unchanged.

## Evidence from the numbers audit

> In United States, VIIRS reports about 3.7 times as many hotspots as MODIS for the same years. Spliced naively, the record jumps in 2012; harmonized, it does not.

Source: `us/ruler.json#/sentence`.

> The record does not show a clear long-term change here (-9 to 2% per decade).

Source: `us/trend.json#/sentence`.

> No recent satellite data.

Source: `us/nowcast.json#/sentence`.

- tier1 loyo_weekly_wape: 0.122. Entire held-out calendar year excluded from monthly and annual-baseline fits, including shrinkage; jointly covered Aqua/S-NPP days, common coverage-scaled weeks; n=paired valid weeks. Zero observed totals or constant weekly counts make the corresponding metric null.
- tier2 reliability_err: 0.0. Locked pooled |sum p - sum observed| / sum observed across held-out years. Neighbour-match sensitivity (reported, not used): c 0.825 -> 0.900 (change +0.076); mean monthly k_T2 0.374 -> 0.499 (change +0.124, largest monthly change +0.130); g kept same-cell (1.514).
- tier2 reliability_year_absolute_err: 0.019. Diagnostic: sum of absolute yearly prediction errors / total observed; does not cancel across years.
- tier2 loyo_weekly_wape: 0.166. NOAA-20 days of harmonized_t2 use the curve fitted on S-NPP (same VIIRS instrument design); no NOAA-20-specific curve was fitted. aqua_raw/snpp_raw from R3 daily.parquet.
- tier2 t1_t2_wape: 0.164. Tier 1 vs Tier 2 predictions from matching excluded-year folds, weekly.

- planted truth passed (count of pass = true): 10 of 10  methods.json#/planted_truth

## Limitations (verbatim from methods.json)

- Only daytime detections are used in this version. Night-time detections are kept in the data but not shown.
- Near-real-time detections are filtered per map cell by a static heat-source mask; standard detections are filtered one by one.
- From 2026 the record uses NOAA-20 with the S-NPP eyesight curve, assuming the two instruments see fires the same way.
- Fire cell-days describe the spread of satellite-detected burning activity, not burned area, fire counts, severity or damage.
- The analysis covers the approved whole-US polygon, including Alaska and Hawaii. A display wrap does not change membership.
- Calibration measured across the whole region is applied to smaller selected areas. Small areas can have different detection conditions.
- Cloud, smoke, viewing geometry and overpass time can affect detections; coverage rules cannot measure every missed observation.
- Recent activity remains unavailable until genuine near-real-time detections and independent coverage metadata exist.
- The trend always uses the count-based translation. The eyesight route is used for the estimated historical lens only when it passes the fixed acceptance tests.
- Pooled reliability can cancel errors of opposite sign across years. The separately reported absolute-year diagnostic exposes that cancellation.
- Anomaly ranks use the fixed configured historical baseline; selected-period seasons use only the selected complete years.
- Spatial maps exclude years with missing required bins. Published sparse contributions omit covered zero cells but retain missing bins as null.

## NASA data and references

NASA FIRMS supplies MODIS Terra/Aqua and VIIRS S-NPP/NOAA-20 hotspot observations. The local supplied
country files are the historical inputs. The configured polygon, coverage rules and calibration windows
determine the analysis; fitted diagnostics are distinguished from held-out prediction comparisons.

- [NASA FIRMS lists Suomi NPP fire observations through 2 November 2026.](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html) (checked 2026-11-15).
- [NASA describes Aqua moving away from its maintained orbit and observing later in the afternoon.](https://science.nasa.gov/mission/aqua/) (checked 2026-11-15).

Credit [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) and Natural Earth. Optional map attribution:
OpenFreeMap, OpenMapTiles and OpenStreetMap contributors. Space agency partner data: none.

## AI disclosure and human completion

OpenAI Codex assisted implementation, integration repair, regression tests, source verification and document generation. The team must confirm other assistant use and completed human review before submission.

Human completion remains pending: scientific sign-off, the two-person clock usability test, team identities and AI disclosure review, final submission links and the read-aloud check. Cross-OS CI is configured to compare scientific payloads; a Windows run alone does not establish those results. No external publication is part of this repair.

Team identities: {{team:identities}}
Live site: {{link:live_site}}
Demo video: {{link:video}}
Public repository: {{link:repository}}
Slide deck: {{link:slide_deck}}
