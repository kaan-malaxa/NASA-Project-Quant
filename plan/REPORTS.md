# REPORTS · research, contradiction log, and the team's report templates

Everything that is a *report* lives in this one file, so the plan and role documents stay instructions only.

- §1 Research report (what was checked on Saturday 14 Nov 2026, with sources)
- §2 Contradictions and flaws in Draft v1, and how each was resolved
- §3 Competitive landscape update
- §4 Corrected pitch text
- §5 Open items the team must verify (owner and deadline)
- §6 Changes the team should know it can reverse
- §7 Report templates the team fills in during the build (gate log, validation summary, numbers audit, cross-OS check, accessibility check, submission checklist, decision changes)

---

## 1. Research report

### 1.1 The official challenge page
The page at `spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/` could not be fetched automatically (the site disallows automated readers). The analysis below uses the challenge text supplied at the start of this conversation, which contains the Background, Objectives and Potential Considerations sections. **The Resources tab was not seen.** R2 should open the page by hand and check the Resources tab for datasets or requirements not covered here (§5, item 1).

What the text asks for, and where the plan answers it:

| Challenge wording (paraphrased) | Where it is answered |
|---|---|
| Harmonize MODIS and VIIRS hotspots into a consistent time series so the sensor of origin no longer matters | `harmonized` series, SD-05 to SD-07; validation V1–V4 |
| A web application taking harmonized hotspots as input | static site reading pipeline JSON |
| User selects a region **and a specific date range** | place picker, date-range bar (M4), draw-your-own-area (S5) |
| **Download analytics and visualizations** | series CSV, calendar CSV, chart PNG/SVG, Season Brief PDF (M5) |
| Calendar of hotspot numbers from the early 2000s to the present | Fire Year Clock, week × year and month × year calendars |
| See which periods of the year and **which months and years** had the most activity | month calendar, "In this period" top months and top years |
| Compare the **current month with the historical median** | `nowcast.month_to_date` line |
| How a current fire period compares with previous ones | "This week" percentile and status |
| Colour ramps, accessible | Inferno (activity) and PuOr (anomaly), colour-vision check in R6 E1 |
| Downloadable **CSV of hotspots** | `hotspots_recent.csv`; yearly archives on GitHub Releases (S6) |
| Interactive map, draw an area or enter coordinates (optional) | hexagon map with rectangle draw (S5) |
| Historical comparisons and anomalies against multi-year averages (optional) | climatology bands, anomaly mode |

### 1.2 Satellite status (this changes the science plan)

| Finding | Source | Effect on the plan |
|---|---|---|
| Delivery of new Suomi NPP fire data through FIRMS ended at 13:00 UTC on 2 November 2026; NOAA-20 and NOAA-21 are the named replacements. | NASA Earthdata blog, "Transitioning from Suomi NPP VIIRS & OMPS" — `https://www.earthdata.nasa.gov/news/blog/transitioning-from-s-npp-viirs-omps-what-nasa-firms-users-need-know` | Confirms the charter's date. |
| The S-NPP spacecraft went into a non-nominal state on 10 July 2026 and its science products were switched off the next day "until further notice"; at least one operational fire service switched its input to NOAA-20 from 11 July. | Copernicus Land production update — `https://land.copernicus.eu/en/production-updates/global-burnt-area-production-temporary-switch-to-noaa-viirs-source-3` | **Not in the charter.** S-NPP cannot be the source for 2026. SD-05 uses S-NPP only through 2025 and NOAA-20 from 2026. R2 must confirm from the data how much S-NPP exists after 10 July. |
| Aqua finished its orbit-maintenance manoeuvres in 2021, began free drift in January 2022, passed a 13:45 equator crossing in February 2023, and was projected to reach roughly 15:30–15:50 by mid-2026. | Aqua status briefing — `https://aqua.nasa.gov/sites/default/files/AquaStatus.pdf`; MODIS Land news — `https://modis-land.gsfc.nasa.gov/news.html`; LAADS notice — `https://ladsweb.modaps.eosdis.nasa.gov/alerts-and-issues/171807` | **Not in the charter.** Aqua after 2022 does not sample the same hour as before. Calibration window ends 2022-12-31 (SD-05, SD-06). The drift is also our strongest differentiator (V4). |
| Aqua's instruments were projected to shut down on 26 August 2026, followed by passivation; a separate NASA notice says Terra and Aqua begin shutting down in late 2026 or early 2027. | Same Aqua briefing; `https://www.earthdata.nasa.gov/data/alerts-outages/transition-from-modis-viirs` | The two statements differ. The charter's "live MODIS comparison while Aqua still flies" is dropped. R2 checks FIRMS data availability for the real last Aqua day (§5, item 3). |
| The effect of Terra/Aqua orbit drift on MODIS fire products was described in May 2025 as under active investigation by the MODIS fire science lead's group. | LANCE user working group slides — `https://landweb.modaps.eosdis.nasa.gov/data/filePost/LANCE_UWG_Orbit_Drift_Giglio_202505.pdf` | Our drift-aware window speaks to a live research question; say so modestly. |

### 1.3 FIRMS data access

| Finding | Source | Effect |
|---|---|---|
| Area API format: `/api/area/csv/[MAP_KEY]/[SOURCE]/[AREA]/[DAY_RANGE]/[DATE]`, returning DATE through DATE + DAY_RANGE − 1. | FIRMS API page — `https://firms.modaps.eosdis.nasa.gov/api/area/csv` | Contracts E3. |
| Day range limit: one third-party API description says 1–5, another client library says 1–10. Limit of 5 000 transactions per 10 minutes. Sources include `VIIRS_NOAA20_SP`. | `https://apis.io/apis/nasa-firms/nasa-firms-area-fire-detections-api/` (third party) | The charter's "up to 10 days" is unsafe. We use ≤ 5. |
| FIRMS offers `data_availability` and `missing_data` services. | `https://firms.modaps.eosdis.nasa.gov/api` | Used for era boundaries and `outages.yaml`. |
| Archive download needs Earthdata login or an email code; near-real-time rows are replaced by science-quality rows after roughly five months; NOAA-21 coverage starts 17 January 2024; yearly country summaries are offered as CSV. | `https://firms.modaps.eosdis.nasa.gov/download/` | The most recent ~5 months have no `type` column → static mask (SD-18). Country CSVs are the fast fallback. |
| An older NASA forum answer gives NOAA-20 coverage in FIRMS as starting 1 January 2020. | `https://forum.earthdata.nasa.gov/viewtopic.php?p=14071` | The charter assumed 2018. SD-06 handles either through `n20_first_full_year` and the chained method. |
| The `type` attribute (0 vegetation fire, 1 volcano, 2 other static land source, 3 offshore) exists only in standard-quality data. | `https://earthdata.nasa.gov/data/tools/firms/active-fire-data-attributes-modis-viirs` | Confirms SD-02 and SD-18. |

Not verified: the exact URL pattern of yearly country files; the exact satellite codes in archive CSVs (third-party examples show `N20` for NOAA-20). Both are handled by "inspect the real file first" steps in R2's prompts.

### 1.4 Competition rules

| Finding | Source |
|---|---|
| Hackathon dates are 14–15 November 2026. | `https://www.spaceappschallenge.org/resources/participant-faqs/` |
| Demo is a video of up to 30 seconds or up to seven slides including the title, hosted on a public external link. Submission is final. | Project Submission Guide (2025 edition) — `https://www.spaceappschallenge.org/resources/project-submission-guide/` |
| Judging criteria: Impact, Creativity, Validity, Relevance, Presentation. | same |
| English is required on the project page and linked material; a video spoken in another language must carry English subtitles. | Judging & Awards Guide — `https://www.spaceappschallenge.org/resources/judging-awards-guide` |
| Submission closes 15 November at 23:59 local time. | third-party listing only; **confirm in the 2026 guide** |

The 2026 Project Submission and Judging guides (released 13 November) were not read. R2 reads them before recording (§5, item 2).

### 1.5 Free tooling confirmed
OpenFreeMap serves MapLibre-compatible vector tiles with no key or registration (`https://openfreemap.org`); its terms describe a best-effort public service, which is why the map must work without it.

---

## 2. Contradictions and flaws in Draft v1, with resolutions

Severity: **A** = would produce a wrong result or a failed demo; **B** = would cost points or hours; **C** = wording or housekeeping.

| ID | Sev | Where in Draft v1 | Problem | Resolution | Implemented in |
|---|---|---|---|---|---|
| C01 | A | Science method: "overlaps VIIRS for 14 years (2012 to 2026)"; LOYO over 2013–2025 | Aqua has drifted since 2022 and passed its historical crossing window in Feb 2023. Calibrating on 2023+ mixes a time-of-day change into k. | Fit window 2013–2022; Aqua trusted through 2022-12-31; drift shown as evidence (V4). | SD-05, SD-06, R3 |
| C02 | A | Tier 1: "S-NPP before Nov 2026, NOAA-20 after" | S-NPP went non-nominal on 10 July 2026. | S-NPP through 2025-12-31; NOAA-20 from 2026-01-01; fallback between them on uncovered days. | SD-05 |
| C03 | A | Not stated anywhere | Which series is authoritative during the overlap (observed Aqua or translated VIIRS)? | Observed Aqua while trusted; translated VIIRS after; the overlap is for proof. | SD-05 |
| C04 | A | Data contracts: `naive` and `invisible_estimate` inside a file whose unit is Aqua-equivalent cell-days | Three different units in one series list; the "3–4×" jump is in hotspot counts while the product is in cell-days. | `ruler.json` with unit-free indices; `series_meta` with a unit per series; `viirs_equiv` as its own lens. | Contracts §6.2, 6.8; SD-09 |
| C05 | A | Mission sentence: "jumped three to four times" | Hand-typed result, taken from other teams' regions, breaking the charter's own rule. | `{jump_multiple}` from `ruler.json`, per region. | §4 below; SD-09 |
| C06 | A | Hard rule "never add MODIS and VIIRS" vs screen 1 "naive MODIS plus VIIRS record" | The naive line was undefined and read as a sum. | Naive = splice (MODIS to 2011, VIIRS from 2012), defined once. | SD-09 |
| C07 | A | Step 0: H3 resolution 5 (~250 km²) | Peak-season saturation in intensely burning regions flattens k and the anomaly signal. | Count at resolution 6; diagnostic V5 at both. | SD-04 |
| C08 | A | Tier 3: season = 10 %–90 % of the year's activity | A region with two burning seasons gets one six-month "season", which is meaningless. Glossary also said "middle 80 %". | Critical weeks = fewest weeks holding 80 %; up to two windows. | SD-13 |
| C09 | A | Tier 3 anomaly status | Thresholds need the 95th percentile but the climatology stores up to p90; off-season weeks with median 0 make one detection "extreme". Two of three regions are off-season this week. | Empirical percentile formula; `low_activity` status. | SD-11 |
| C10 | A | Screen 6: "last 7 days … against the same week in every past year" with weekly climatology | Rolling window compared with fixed weeks. | Same day-of-year window in each past year from daily data. | SD-12 |
| C11 | A | Tier 2 fit: MODIS pixel size from `scan`/`track` as a predictor | Those fields exist only when Aqua detected, so the predictor leaks the outcome. | Dropped. Predictor is VIIRS FRP only. | SD-16 |
| C12 | A | Tier 2 matching: "within 1.5 km"; "Aqua in view if any Aqua detection within 100 km" | MODIS pixels reach several km at the swath edge; the in-view proxy is biased toward big-fire days. | Match at cell-day level; a fitted ceiling `c` absorbs not-in-view cases. | SD-16 |
| C13 | A | Backward translation ("invisible fires") | No validation was planned for the headline feature. | Backcast test V6; shown only as `estimated`; Tier 1 fallback. | SD-16, SD-17 |
| C14 | A | Validation: "step test … should be close to zero" | Partly true by construction when k is fitted on totals. | Reported with that caveat; LOYO and drift are the headline evidence. | SD section G |
| C15 | A | Verdict card example sentence "Most of the apparent rise is the sensor change" | Presumes the result; no branch for an unclear trend. | Five templated branches including `unclear`; robustness variants. | SD-14, SD-15 |
| C16 | A | "What other teams are building": "Nobody we found uses the physics of detection" | False as of today (see §3). A judge who has seen that repo would mark us down. | Positioning changed to proof: drift-aware window, planted truth, two routes agree. | Architecture §1 |
| C17 | B | Scope "Must" vs the official text | Date range, downloads, hotspot CSV and the month view are in the challenge but not in Must. | Added as M4, M5 and to M3. | Architecture §2 |
| C18 | B | Judging table: "critical periods → screen 5" while screen 5 is a Should | Relevance would depend on an optional screen. | Critical-weeks band on the calendar is a Must. | Architecture §2 |
| C19 | B | Timeline: "48-hour plan", contracts frozen 17:00 Saturday, sample data "within the first two hours" | Written with about 34 hours left; the freeze time passes before work starts. | New timeline from 16:00 Saturday; freeze at 18:30. | Architecture §8 |
| C20 | B | Team table | One role without code, data engineer idle on Sunday, Tier 2 owner blocked until data arrives, web roles overloaded, differentiator starts Sunday morning. | Six rebalanced roles; simulator unblocks Tier 2 on Saturday; data engineer becomes delivery lead on Sunday. | Architecture §3 |
| C21 | B | "main must always build; commit small and often" vs the request for no overlap until a final integration | Either extreme fails: constant cross-edits or a single late merge. | Folder ownership + file contracts + four integration rehearsals. | Architecture §5 |
| C22 | B | Tier 1: "satellite agreement … a big difference is a bug" | NOAA-20 passes about 50 minutes from S-NPP; some real difference is expected. | Thresholded reading (few % expected, > 15 % investigate); direct vs chained k. | SD-06, V3 |
| C23 | B | NOAA-21 "backup live feed only" vs "never stack satellites without a calibration" | An uncalibrated backup breaks the rule. | Not used in v1. | SD-05 |
| C24 | B | MODIS NRT "live comparison while Aqua still flies" | Aqua instruments were projected to stop in August 2026. | Dropped; verify last Aqua day. | §5 item 3 |
| C25 | B | "The demo cannot break because a service is down" | The map basemap and web fonts are external services. | Basemap optional with fallback; fonts bundled. | Contracts E8; R6 D2 |
| C26 | B | Data: Area API "up to 10 days per call" | Sources disagree (5 vs 10). | Use ≤ 5. | Contracts E3 |
| C27 | B | Showcase regions left to "the science lead after the first data pull"; Brazil flagged as too large | An open decision on the critical path and a known volume risk. | Regions locked: Punjab, British Columbia, Santa Fe + Entre Ríos; Mato Grosso is a stretch. Reversible (§6). **Superseded 2026-11-14 (R1, scope owner): one US region, `conus`.** | SD-19 |
| C28 | B | `regions.json` has only a bbox; "region outlines from Natural Earth" | Counting region undefined (box or outline?). | Polygon membership by cell centre; bbox for download only. | SD-04 |
| C29 | B | Near-real-time rows: "drop detections in grid cells flagged as static" | Grid resolution and threshold unspecified; the last ~5 archive months are also NRT. | Res-8 mask, ≥ 3 static detections, one-ring dilation, applied to every row without `type`. | SD-18 |
| C30 | B | "52 weeks around the circle" | ISO weeks have 53 and cross year boundaries. | Week = min(52, (doy − 1)//7 + 1), with coverage scaling. | SD-08 |
| C31 | B | Missing data: "a day with no satellite coverage" | No way was given to tell "no fire" from "no data". | Coverage table from lifetime, outage list and zero-raw-rows rule. | SD-08 |
| C32 | B | Hotspot CSV download | Full history is far too large for a static repo. | Recent 31 days in the site; yearly archives as release assets. | Contracts §6.12, E9 |
| C33 | B | "Every number comes from a pipeline output file" vs satellite dates spoken in the pitch | Dates of shutdowns are facts with no pipeline source. | `methods.json → sources` with URL and checked date per claim. | Contracts §6.13 |
| C34 | B | Stack: statsmodels/scikit-learn, pandas or polars, "GitHub Pages or Vercel" | Open choices and unneeded heavy installs across three OSes. | One pinned list; uv; no shell scripts; CI on three OSes. | Architecture §6, §7 |
| C35 | B | `hex.json`: "critical_weeks_mean" with no unit or source | A per-cell harmonized value is not defined (k is regional). | Observed VIIRS cell-days per year, labelled as such. | Contracts §6.10 |
| C36 | C | "24 years" vs "23 years" vs "since 2000" | Three spans used loosely. | 24-year record = 2003–2026; 23-year baseline = 2003–2025. | SD section H |
| C37 | C | Stand-ups "17:00, 23:00 and 07:00, 14:00 and 19:00" | Not aligned with gates. | Stand-ups at the gates. | Architecture §8 |
| C38 | C | Submission checklist: "English subtitles burned in" | The rule requires subtitles when the video is not in English. Burned-in subtitles are still a good idea. | Kept as a team choice, not described as a rule. | R2 §11 |
| C39 | C | "Terra is currently FIRMS's only morning overpass" | Not verified; Terra's own end date is unclear in the sources found. | Not used in the pitch unless R2 finds a source. | §5 item 4 |
| C40 | C | Validation metric: mean absolute percentage error | Explodes on near-zero weeks. | WAPE as headline; r and bias alongside. | SD section G |
| C41 | C | Local award: "let a judge choose which region we open first" | Two regions are off-season this week. | `low_activity` layout; the demo defaults to Punjab but any choice works. **Superseded 2026-11-14: one region, `conus`.** | SD-11; Architecture §11 |
| C42 | C | Sample data banner | The trigger was "any loaded row has kind sample"; a file with no rows could slip through. | `manifest.contains_sample` as a second trigger; export refuses mixed sample/real regions. | Contracts §6.14; R1 C2 |

---

## 3. Competitive landscape update (public repos found on 14 Nov)

| Team repo | What it shows publicly | What it means for us |
|---|---|---|
| Fire Harmony (`github.com/Warren-530/fire-harmony`) | A worldwide record to Oct 2026 for any place; a hexagon × month panel; a "physics" module estimating the chance MODIS sees a fire VIIRS saw, by strength, day/night and cloud; static-source detection tested on unseen years. | **The eyesight curve is not unique.** Do not claim it is. Our edge has to be proof and the drift-aware window. |
| FireCal (`github.com/samuelakosaonyejekwe/firecal`) | Any area on Earth; per-area, per-month calibration with three sensor eras and out-of-sample validation; month × year calendar; last week vs the same dates in every past year; a live site. | The charter's table understated it. "Calendar + percentile + validation" is table stakes. |
| FireLens (`github.com/shahmirkhan106/firelens`) | Five regions, 26.2 million detections, ~1 km H3 lattice, per-region regression calibration. | Region count and data volume will not differentiate us. |
| IGNIS (`github.com/Hisernberg/ignis-public`) | 26-year monthly record for nine regions, a median-ratio "continuity coefficient", forecasts, many models. | Breadth and model count are covered by others; depth of validation is not. |
| Flare-Chronos, NasaSpaceApp2026, Chronofire, FireChronicle, Kiln Watch | Pentad calendars, gradient-boosted mapping, 14-day forecasts, agent harnesses, printable local calendars. | Printable briefs and forecasts exist elsewhere too. |

One of these READMEs states the challenge was written by CONAE, Argentina's space agency. That is a third-party statement, not verified here. If the challenge page confirms it, an Argentine showcase region is a small extra reason to feel relevant to the authors; it was in the plan on data-volume grounds. **Superseded 2026-11-14: the project now covers the United States only.**

**Where no repo found overlaps (as far as their READMEs show):** stopping calibration where Aqua's orbit starts drifting and showing the drift; a planted-truth simulator run through the full pipeline; a verdict sentence with an explicit "unclear" branch and robustness variants; a cross-plot of the empirical ratio against the curve-predicted ratio. These are the four proof points in `01_ARCHITECTURE.md` §1. This is a reading of README files on one afternoon; other teams may have more than they describe.

---

## 4. Corrected pitch text (placeholders are filled from JSON at recording time)

**One sentence everyone repeats:**
> In 2012 NASA's fire satellites got sharper eyes, and in {region} the raw record shows about {ruler.jump_multiple.value} times as many hotspots for the same fires. FireRosetta puts 24 years on one scale, shows its work, and tells a land manager whether their own patch of Earth is really burning more, in the month the original satellites are going dark.

**Three questions the app answers:** Is this place really burning more? When are its critical weeks, and are they shifting? Is this week normal?

**Four proof points:** (1) we calibrate only where the old satellite's orbit was steady, and show the drift; (2) we tested the method on a simulated world with a known answer; (3) two independent methods give the same correction; (4) every number carries a range and a label, and the verdict says "unclear" when it is.

**Closing line for the local award motto:** keep the charter's suggestion; it contains no numbers.

Words to avoid: "number of fires", "real fires", "nobody else", "3 to 4 times" (unless that is what `ruler.json` says for the region on screen), "24 years" for anything other than 2003–2026.

---

## 5. Open items to verify (do not skip)

| # | Item | Owner | By | If it turns out differently |
|---|---|---|---|---|
| 1 | Open the official challenge page by hand; read the Resources tab; check for any requirement not in §1.1 | R2 | Sat 17:00 | Tell R1; add to scope |
| 2 | Read the **2026** Project Submission Guide and Judging & Awards Guide (limits, deadline, required fields, AI disclosure) | R2 | Sun 10:00 | Update `docs/submission.md` and the video plan |
| 3 | FIRMS `data_availability`: first and last dates of MODIS (Aqua rows), S-NPP SP, NOAA-20 SP and NRT | R2 | Sat 17:00 | R3 adjusts nothing in code (eras are data-aware) but notes it in limitations |
| 4 | How much S-NPP data exists after 10 July 2026 | R2 | Sat 22:00 | Update `outages.yaml` |
| 5 | Country yearly CSV URL pattern | R2 | Sat 16:30 | Download by hand for the United States |
| 6 | Real CSV headers and satellite codes vs contracts §4.4 and the simulator's §9.4 | R2 → R4 | Sat 20:00 | R4 changes the simulator to match |
| 7 | Seed outages (Aqua Aug–Sep 2020, S-NPP Jul–Aug 2022) against FIRMS notices | R2 | Sun 09:00 | Remove unconfirmed entries |
| 8 | Natural Earth admin-1 names for the three regions | R2 | Sat 18:30 | Fall back to bbox membership (recorded in outputs) |
| 9 | Whether the challenge authors are CONAE | R2 | Sat 17:00 | Informational only |
| 10 | Local event rules for the First Flight Lunar Module Award ("engagement") | R1 | Sat 18:30 | Presentation only; no features |
| 11 | Every `sources` entry has a URL the team opened today | R2 | Sun 16:00 | Cut the claim |

---

## 6. Changes you can reverse cheaply

These were decided to remove open questions. Each is a config change, not a code change.

| Decision | To reverse |
|---|---|
| One US region (`conus`) instead of three non-US regions | Add more US regions to `regions.yaml` (one entry each) and download |
| Counting resolution 6 instead of 5 | `grid.count_res: 5` in `science.yaml` (re-run from `ingest`) |
| Aqua trusted through 2022 | `eras.aqua_trusted_through` (re-run from `harmonize`); the robustness variants already show the alternatives |
| Day pass only | run with `--pass N` for a night series |
| Dark theme by default | tokens only |

---

## 7. Report templates (the team fills these in)

### 7.1 Gate log (R1 fills at each stand-up)
| Gate | Time | R1 | R2 | R3 | R4 | R5 | R6 | Cuts decided | Notes |
|---|---|---|---|---|---|---|---|---|---|
| A | Sat 18:30 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | | |
| B | Sat 23:00 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | | |
| C | Sun 10:00 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | | |
| D | Sun 14:00 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | | |
| E | Sun 17:00 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | | |

### 7.2 Validation summary (R3 fills from `methods.json`; one row per region)
| Region | LOYO WAPE (ours) | raw VIIRS | annual ratio | Handoff annual % | Sat. agreement WAPE | k direct vs chained % | Drift visible after 2022? | Saturation r5 / r6 | Backcast WAPE | Tier 2 status |
|---|---|---|---|---|---|---|---|---|---|---|
| conus | | | | | | | | | | |

Planted truth (`synthland`): __ of __ quantities recovered within tolerance. Failures: ______.

### 7.3 Numbers audit (R2 collects, R3 signs before recording)
| Where it appears (video second / slide / README line) | Text as written | Audit value | JSON file and path | Match |
|---|---|---|---|---|
| | | | | ☐ |

Signed by R3: ________ at ____.

### 7.4 Cross-OS reproducibility (R2 + one teammate)
| File | OS 1 (____) sha256 | OS 2 (____) sha256 | Same |
|---|---|---|---|
| `conus/weekly.json` | | | ☐ |
| `conus/trend.json` | | | ☐ |
| `conus/calibration.json` | | | ☐ |
| `manifest.json` | | | ☐ |

### 7.5 Accessibility and device check (R6 and R5)
| Check | Result |
|---|---|
| Protanopia / deuteranopia / tritanopia / achromatopsia: activity, anomaly, no-data, estimate distinguishable | ☐ ☐ ☐ ☐ |
| Text contrast ≥ 4.5:1; chart text ≥ 3:1 | ☐ |
| Keyboard reaches and operates every chart | ☐ |
| axe: no serious or critical issues on each route | ☐ |
| Phone 390 × 844: no horizontal scroll; QR opens the site | ☐ |
| Season Brief prints on one page (Chrome, Firefox) | ☐ |
| 10-second test: two fresh viewers name the peak season | ☐ |

### 7.6 Submission checklist (R2, Sunday 21:00)
- ☐ 2026 Submission Guide read; limits confirmed
- ☐ Live site opens in a private window on a laptop and a phone; no SAMPLE banner
- ☐ Repo public; README has pitch, run steps, data sources with links, limitations, AI-use statement
- ☐ Video ≤ 30.0 s, subtitles present, public link opens logged-out
- ☐ Seven-slide deck (backup) public link works; names the team, members and challenge
- ☐ Project page fields pasted from `docs/submission.md`; NASA data listed; AI use disclosed
- ☐ Every number in the video, slides and README matches §7.3
- ☐ No NASA logo or insignia anywhere; "NASA FIRMS" credited in text on every page
- ☐ "Not affiliated with or endorsed by NASA" on the Methods page
- ☐ Submitted by 22:00; confirmation screenshot in the team chat

### 7.7 Decision changes (R3 logs any change to `03_SCIENCE_DECISIONS.md`)
| Time | Decision | Old → new | Why | Who was told |
|---|---|---|---|---|
| | | | | |
