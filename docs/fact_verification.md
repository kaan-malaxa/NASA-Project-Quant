# External fact verification during the integration repair

Checked against primary NASA sources during this repair. Published wording is limited to the claims in
pipeline/export/methods_text.yaml and methods.json; pipeline-generated results have their own numbers audit.

| Claim | Evidence | Status |
|---|---|---|
| FIRMS S-NPP temporal coverage | [NASA FIRMS product description](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html) | Live page explicitly gives the coverage endpoint used in the published source sentence. This is a FIRMS product-coverage claim, not an invented spacecraft shutdown instant. |
| Aqua orbit drift | [NASA Aqua mission](https://science.nasa.gov/mission/aqua/) | Live primary page describes free drift and later equatorial crossing times. No forecast crossing time is presented as a current measurement. |
| Historic MODIS notice | [NASA MODIS notice](https://modis.gsfc.nasa.gov/news/individual.php?news_id=100389) | Indexed primary text supports drift; direct retrieval returned a gateway error. The published source now uses the accessible NASA Aqua page. |
| Live missing-day table | [FIRMS missing dates](https://firms.modaps.eosdis.nasa.gov/api/missing_data/) | Page loads but its data table reports a load failure. Existing outage snapshots/configuration are preserved; this attempt does not independently reconfirm their individual dates. |
| Aqua shutdown date | No current shutdown evidence adopted | Unverified; omitted from published claims. |
| Final competition submission requirements | Final current submission guide and team confirmation | Pending human completion. Existing internal project deadline remains unchanged. |

The source CSV inspection and LF/CRLF reconciliation are in source_fingerprints.md and its generated JSON.
No hotspot observations, outage dates, numerical findings or final submission links were invented during
this verification. Scientific constants and configured outage masks were not tuned to improve a result.
