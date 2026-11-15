# Fact verification and R1/R3 handoff

Checked on 2026-11-14 (America/New_York). User entry point:
https://firms.modaps.eosdis.nasa.gov/country/

## Outage evidence

The missing-data page loads its table from:
https://firms.modaps.eosdis.nasa.gov/api/missing_data/?action=fetch_data

A parsed snapshot of the relevant factual date records is saved in
firms_missing_days_2026-11-14.json. Standard-processing and NRT columns were
kept separate; duplicate day records were deduplicated. Contiguous standard
missing days were grouped without joining gaps. NOAA-21 and Terra were not
added to the requested Aqua/S-NPP/NOAA-20 update.

Source page:
https://firms.modaps.eosdis.nasa.gov/api/missing_data/

The configuration includes all table-listed standard missing days for the
requested sensors. It also retains the confirmed Aqua 2020 seed event and the
partial-day boundaries of confirmed S-NPP seed events as conservative
inclusive-date masks. Notes explicitly distinguish these additions from full
missing days. This continues the seed file's conservative partial-day handling,
rather than claiming the satellite supplied no recoverable data on every such day.

Confirmed seed evidence:
- FIRMS notice 200117 documents the Aqua formatter/recorder event, recovery,
  and later partial direct-broadcast reprocessing. The event is real, but the
  resulting whole-day mask may exclude recovered observations. The seed range
  is retained with this qualification for R3's review.
- FIRMS notice 200040 distinguishes the S-NPP 2022 interruption from the later
  processing/distribution recovery. The partial start date is retained.
- NASA's July 2026 update describes a temporary S-NPP interruption. The former
  open-ended July seed is replaced by a finite, conservative interval; the
  current FIRMS table lists only the full missing dates inside that interval.

FIRMS notice feed (lookup by those IDs):
https://firms.modaps.eosdis.nasa.gov/api/articles/all

NASA July anomaly notice:
https://www.earthdata.nasa.gov/data/alerts-outages/suomi-npp-viirs-data-outage-anomaly-july-10-2026

The NASA alert URL returned 403 to the browsing tool. Its July recovery updates
were available in indexed NASA-authored Earthdata Forum content:
https://forum.earthdata.nasa.gov/viewtopic.php?sid=6ba3888c85d71c6a018e2ba94b364f39&t=8048
Direct forum retrieval also failed. The live FIRMS missing-day JSON independently
supports a finite interruption; distinguish this direct evidence from cached
notice text when reviewing partial-day boundaries.

No verified seed was silently described as a complete-day data loss. No
unconfirmed open-ended range remains. The new NOAA-20 ranges come from the
live FIRMS table, not inferred gaps in the local CSVs.

## Pitch claims

methods_sources_draft.yaml remains a draft for R1; it does not modify
pipeline/export/methods_text.yaml or published methods.json.

Under the user's rule, entries without a claim-specific URL supplied by the
user remain marked UNVERIFIED. Official candidate links discovered during this
review are provided for R1's review, not silently treated as user-approved links.
Keep any UNVERIFIED text out of the pitch and published methods.json.

- snpp_end: The current global FIRMS product description explicitly ends S-NPP
  temporal coverage at the stated November date. The draft sentence attributes
  that fact to FIRMS rather than inventing an exact spacecraft shutdown time.
  https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html
  https://firms.modaps.eosdis.nasa.gov/content/notifications/firms/news.html
  Some other official banners/URL slugs use a different date; use the cited
  global FIRMS coverage wording, not a stronger unsourced shutdown claim.
- snpp_anomaly_2026: Temporary interruption confirmed by FIRMS missing days and
  NASA's recovery update; do not describe July as the start of permanent loss.
- aqua_drift: NASA's continuity report supports the historical controlled
  afternoon crossing and subsequent drift. It does not establish a measured
  crossing time for today.
  https://www.earthdata.nasa.gov/s3fs-public/2023-03/RFI_TAA_continuity_workshop.pdf
- aqua_end_science: UNVERIFIED. Older Aqua status slides forecast an end date;
  a forecast is not proof that shutdown occurred.
  Candidate historical planning document:
  https://aqua.nasa.gov/sites/default/files/AquaStatus_March2025.pdf
- submission_rules: UNVERIFIED. No specific current rules text or claim-specific
  source URL was supplied. Do not import limits from an earlier year's guide.

The checked date in the draft is this review date, not confirmation of any
entry still marked UNVERIFIED.

## Pipeline status for R3

After updating outages.yaml, the requested grid command is rerun and its actual
result saved in facts_acceptance.txt. If science.yaml is still absent, that is
a failed rerun, not regenerated coverage. No claim of refreshed statistics or
unchanged scientific results should be made.

R3 should review the conservative partial-day masks, particularly the recovered
Aqua seed, before using the recomputed data for calibration or statistics.

Handoff:
Built: sourced outage updates, a date-record snapshot, and a guarded pitch-source draft.
Run: uv run python -m pipeline.ingest --region us --steps grid after science configuration is supplied.
Reads/writes: official notice metadata to R2 configuration/docs; no new hotspot data was fetched.
Limits: unresolved pitch claims remain UNVERIFIED; cached notices are identified; grid may remain blocked.
Next: R1 reviews candidate sources and R3 reviews mask conservatism and the grid rerun result.
