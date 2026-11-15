# FireRosetta

FireRosetta asks whether satellite-detected burning activity in the United States changed, or whether a change in the observing instrument changed the record. Its planned calendar and trend verdict put MODIS and VIIRS observations on a shared Aqua-equivalent scale, show uncertainty, and preserve missing data. The project pairs that story with published calibration checks so a reader can inspect the evidence behind the conclusion. A hotspot is a detection of heat in a pixel; it does not identify an individual fire.

[Live site]({{link:live_site}}) · [Demo video]({{link:video}}) · [Slide deck](docs/slides/deck.md) · [Submission draft](docs/submission.md)

**Draft status:** numerical claims remain `{{audit:label}}` placeholders until supplied through `web/public/data/numbers_audit.md`. These labels request audit entries; they do not imply that results exist. The audit, `methods.json`, and web assets are absent from this checkout. Local ingestion and its shared library are implemented; the scientific conclusions and product screens described below await integration and review.

The supplied `NASA-Project-Quant/data/` folder contains raw US country CSVs in `MODIS_data/`, `VIIRS-SNPP_data/` and `VIIRS-JPSS_data/`. It contains no numbers audit or methods export. These observations establish the input source; calibration results and validation claims still require the pipeline's reviewed outputs. Placeholders for other contributors' limitations, team details, AI disclosures and published assets are reserved for later completion.

## What it answers

- Has satellite-detected burning activity changed after accounting for the sensor transition?
- When are the critical periods of the US burning calendar, and has their timing shifted?
- When genuine recent observations are available, how does current activity compare with the historical seasonal pattern?

## How it works

The intended end-to-end workflow is:

- **Stage local inputs.** Preserve the US NASA FIRMS CSVs in `NASA-Project-Quant/data/`, clip staged copies to the configured download bounds, and record their provenance in `data/raw/us/MANIFEST.json`.
- **Clean and establish coverage.** Normalize sensor names, apply the configured detection filters and static-source mask, remove duplicates, and assign local solar days. Keep missing observation days explicit.
- **Count activity consistently.** Group each sensor's detections into fire cell-days: a grid cell active on a local day. Apply US polygon membership and keep sensor totals separate.
- **Calibrate and test.** Translate each VIIRS sensor to Aqua's reference scale using the configured stable reference period. Test on held-out years, check drift, and compare the planned planted-truth and detection-probability results.
- **Publish the evidence.** Export the calendar, season statistics, trend verdict and uncertainty ranges to static website files. Label observed, harmonized, estimated, missing and sample values distinctly.

## Proof points

These are the evidence checks required by the plan; their outcomes are pending.

- **Drift-aware calibration:** fit against the configured stable Aqua period, then inspect the annual drift diagnostic. Fit period: `{{audit:us_calibration_fit_period}}`; drift result: `{{audit:us_drift_summary}}`.
- **Planted truth:** recover known parameters in isolated synthetic validation inputs, kept separate from US observations. Recovery result: `{{audit:planted_truth_result}}`.
- **Two routes agree:** compare the empirical calibration with the detection-probability route on held-out years. Agreement: `{{audit:us_routes_agreement}}`. An exploratory curve must retain that label.
- **Verdict with ranges:** use the pipeline-generated sentence and robustness checks, including an unclear conclusion when warranted: `{{audit:us_verdict_sentence}}`.

## How to run

Run from `NASA-Project-Quant/firerosetta-plan-v2`, the Python project root inside the Git repository. Install uv and use the Python version pinned by the repository.

```text
uv sync
```

Stage the existing local country files before ingestion; this command does not download new hotspot data:

```text
uv run python -m pipeline.ingest.download --region us --via country
```

With the synced virtual environment active, run:

```text
python -m pipeline.run --region us
```

The equivalent command without activating the environment is:

```text
uv run python -m pipeline.run --region us
```

The current checkout needs the science owner's `pipeline/config/science.yaml` before default staging, cleaning or gridding can run. Harmonization, eyesight, statistics, export and the web scaffold are still pending. The runner reports missing stages as `SKIP`; that message is not evidence of completed analysis.

Once the web scaffold and exported data are available, use a shell supporting the requested command chain:

```text
cd web && npm ci && npm run dev
```

For shells that require separate commands, including Windows PowerShell:

```text
cd web
npm ci
npm run dev
```

Authoritative hotspot inputs remain in the parent repository's `data/MODIS_data/`, `data/VIIRS-SNPP_data/` and `data/VIIRS-JPSS_data/`. Staged copies live under the Python project's `data/raw/us/`; derived tables live under `data/clean/us/` and `data/grid/us/`. Output-directory overrides do not change the source directory. See [the local US data policy](docs/downloads_and_regions.md).

Recent products require genuine local VIIRS NOAA-20 near-real-time inputs and coverage of the requested window. Historical country files are never relabeled as recent observations; unavailable recent coverage leaves previous outputs untouched. See [the nowcast handoff](docs/nowcast_handoff.md).

## Data sources and attribution

- **[NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/):** the locally supplied [US country CSVs](https://firms.modaps.eosdis.nasa.gov/country/), using [MODIS Terra and Aqua active-fire products](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_MODIS_Firehotspots.html) and [VIIRS S-NPP and NOAA-20 active-fire products](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html). The recent-data path accepts genuine local NOAA-20 near-real-time observations only when available.
- **[Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/):** public-domain administrative boundaries used to construct the committed US outline. Boundaries are geographic reference data, separate from hotspot observations.
- **Optional basemap attribution:** [OpenFreeMap](https://openfreemap.org/), [© OpenMapTiles](https://www.openmaptiles.org/), data from [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Retain attribution on maps and any map screenshots in slides or video.

## Limitations

{{methods:limitations}}

Pending: copy the complete limitations list verbatim from `web/public/data/methods.json`. That file is absent; this draft does not substitute a newly written list.

## AI use

OpenAI Codex assisted the data-engineering work with Python implementation, test development, debugging, source checks and documentation drafting. This statement covers the assistant work recorded for the data and delivery role. Other team assistant use: {{ai:other_assistants_and_tasks}}. Human review completed: {{ai:human_review_completed}}. The team must confirm these disclosures, inspect the code and sources, and obtain science-owner sign-off on audited claims before submission.

## Team and roles

Team: {{team:name}}. Project: FireRosetta.

| Member | Role |
|---|---|
| {{team:coordinator_member}} | Contracts, calendar statistics, export and integration |
| Ethan Bui-Quang | Data engineering, shared library and delivery |
| {{team:science_member}} | Harmonization, calibration and scientific validation |
| {{team:simulation_member}} | Planted-truth simulator and detection-probability model |
| {{team:web_member}} | Web application, product screens and deployment |
| {{team:visualization_member}} | Visualization, accessibility and design system |

## Licence

Project code is available under the [MIT License](LICENSE). Source datasets and basemap content retain their own terms and attributions, linked above.
