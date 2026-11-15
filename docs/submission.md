Title
FireRosetta: Reading US Burning Activity Across Satellite Changes

High-level summary
FireRosetta asks whether satellite-detected burning activity changed or the observing instrument changed. Using locally supplied US NASA FIRMS MODIS and VIIRS data, the project aims to connect observations on an Aqua-equivalent scale, preserve missing days, and show a seasonal calendar beside a trend verdict with uncertainty. Its planned evidence includes drift diagnostics, tests on held-out years, a planted-truth simulation, and a comparison of calibration routes. Local ingestion is implemented; scientific outputs and the web experience await integration. Numerical claims remain audit placeholders until reviewed. The intended outcome is an inspectable account of the record, including an unclear verdict when the evidence warrants it.

Project details
The project addresses the Harmonization of MODIS and VIIRS Hot Spots challenge through the United States region. A hotspot is a heat detection in a satellite pixel; it does not identify an individual fire.

The implemented ingestion path preserves the original US CSVs in data/, stages copies, records provenance, applies configured filters, groups detections into sensor-specific fire cell-days, and tracks observation coverage. A fire cell-day means a grid cell active on a local day for a given sensor. Missing observations remain explicit. Sensor counts and radiative-power totals are kept separate.

The planned science stages calibrate against Aqua's configured stable period, test on held-out years, and compare an empirical calibration with a detection-probability model. Isolated synthetic validation inputs provide planted truth; they are separate from US observations. The planned static website presents the verdict, seasonal calendar, critical periods, sources and printable Season Brief. Proposed users include land managers, researchers, journalists and community planners; adoption has not been demonstrated.

Evidence awaiting the numbers audit:
Raw count ratio: {{audit:us_jump_multiple}}
Drift finding: {{audit:us_drift_summary}}
Held-out weekly prediction error: {{audit:us_validation_weekly_error}}
Agreement between calibration routes: {{audit:us_routes_agreement}}
Planted-truth recovery: {{audit:planted_truth_result}}
US verdict, including its uncertainty range: {{audit:us_verdict_sentence}}

Limitations from methods.json, pending verbatim insertion: {{methods:limitations}}

Current build status: the science configuration, downstream science stages, exported website data and web scaffold are not present in this checkout. Recent comparisons require genuine local near-real-time inputs with sufficient coverage; historical country files are not relabeled as recent observations.

NASA data used
NASA FIRMS MODIS active-fire / thermal-anomaly observations from Terra and Aqua, and VIIRS active-fire observations from S-NPP and NOAA-20, supplied as local US country CSVs in data/. Genuine local NOAA-20 near-real-time inputs are supported when available; recent coverage is not claimed here. The pipeline does not fetch new hotspot observations from the Area API.

Space agency partner data
None.

References
NASA FIRMS: https://firms.modaps.eosdis.nasa.gov/
FIRMS country files: https://firms.modaps.eosdis.nasa.gov/country/
MODIS product description: https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_MODIS_Firehotspots.html
VIIRS product description: https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html
Natural Earth public-domain boundary terms: https://www.naturalearthdata.com/about/terms-of-use/
Optional basemap attribution: OpenFreeMap, copyright OpenMapTiles, data from copyright OpenStreetMap contributors.
OpenFreeMap: https://openfreemap.org/
OpenMapTiles: https://www.openmaptiles.org/
OpenStreetMap attribution and licence: https://www.openstreetmap.org/copyright
Repository methods and contracts: plan/01_ARCHITECTURE.md; plan/02_CONTRACTS.md; plan/03_SCIENCE_DECISIONS.md.
Audited numerical claims: web/public/data/numbers_audit.md, pending supply and science-owner sign-off.

Use of AI
OpenAI Codex assisted the data and delivery role with Python implementation, tests, debugging, source checks and documentation drafting. Other team assistants and their tasks: {{ai:other_assistants_and_tasks}}. Human review completed: {{ai:human_review_completed}}. Before submission, the team must confirm this disclosure, review the code and sources, and obtain science-owner sign-off on numerical claims. No synthetic validation result is presented as a US observation.

Links
Live site: {{link:live_site}}
Demo video: {{link:video}}
Public repository: {{link:repository}}
Slide deck: {{link:slide_deck}}

Draft completion note
data/ contains the raw US CSV inputs; it contains no numbers audit or methods export. Keep numerical claims as audit placeholders until reviewed pipeline outputs are supplied. Other contributors will add the methods limitations, team details, AI disclosures and published assets later. The team read-aloud and final source review remain pending.
