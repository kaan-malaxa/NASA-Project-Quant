---
marp: true
theme: default
paginate: true
footer: 'Data: [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/)'
---

# FireRosetta

**Did burning activity change, or did the satellite's eyes change?**

United States · Local NASA FIRMS inputs

Team: {{team:name}}
Members: {{team:members}}
Challenge: Harmonization of MODIS and VIIRS Hot Spots · NASA Space Apps Challenge

Draft: evidence and assets pending; audit placeholders are not results.

---

# The broken ruler

A sensor transition can change the apparent activity record.
A hotspot is a heat detection in a pixel; it does not identify an individual fire.

Same-place, same-period raw count ratio: **{{audit:us_jump_multiple}}**
Range: **{{audit:us_jump_range}}**

{{asset:us_broken_ruler_chart}}

Compare normalized indices; raw hotspots and fire cell-days use different units.

<!-- Evidence source: us/ruler.json; insert the audited chart and its caption. -->

---

# The ruler was bending too

The planned calibration uses Aqua's configured stable reference period.
The drift chart must show whether later annual calibration factors depart from it.

Fit period: **{{audit:us_calibration_fit_period}}**
Drift finding: **{{audit:us_drift_summary}}**

{{asset:us_drift_chart}}

<!-- Evidence source: methods.json drift and us/calibration.json. No drift finding is asserted yet. -->

---

# The product: a verdict and a calendar

**{{audit:us_verdict_sentence}}**

{{asset:us_verdict_screenshot}}

{{asset:us_calendar_screenshot}}

Planned views: US activity, seasonal timing, uncertainty, and visible missing days.
Recent comparisons require genuine local near-real-time coverage.

<!-- Replace slots with actual screenshots. Use the exact exported verdict; preserve kind labels and units. -->

---

# Proof before a conclusion

| Check | Audited outcome |
|---|---|
| Held-out weekly prediction error | {{audit:us_validation_weekly_error}} |
| Raw-input baseline error | {{audit:us_validation_raw_baseline_error}} |
| Annual-ratio baseline error | {{audit:us_validation_annual_baseline_error}} |
| Agreement between calibration routes | {{audit:us_routes_agreement}} |
| Planted truth: expected / recovered / outcome | {{audit:planted_truth_comparison}} |

{{asset:planted_truth_figure}}

All checks pending. Keep training and test years separate; label an exploratory model.

<!-- Evidence source: methods.json validation, eyesight and planted_truth. Synthetic validation is separate from US observations. -->

---

# Who uses it?

Proposed use cases, not claims of adoption:

- **Land manager:** inspect the US seasonal context before interpreting a change in counts.
- **Researcher:** examine calibration checks, coverage gaps and uncertainty.
- **Journalist:** distinguish an instrument transition from a change in detected activity.
- **Community planner:** communicate critical periods alongside the evidence limits.

**Season Brief:** planned printable summary of the verdict, calendar, critical periods and sources.

{{asset:us_season_brief_screenshot}}

---

# Follow the evidence

Inputs: [NASA FIRMS US country files](https://firms.modaps.eosdis.nasa.gov/country/).
Local source: `data/`.
Boundary: [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/).
Optional maps: [OpenFreeMap](https://openfreemap.org/), [© OpenMapTiles](https://www.openmaptiles.org/), [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright).

Next: integrate science and web stages; publish checks; secure human review.

[Live site]({{link:live_site}}) · [Video]({{link:video}}) · [Repository]({{link:repository}})

{{asset:live_site_qr}}

**Put the observations on a shared scale. Let the evidence set the verdict.**
