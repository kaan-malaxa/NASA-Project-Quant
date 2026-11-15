# Historical US inputs and scientific scope

The pipeline reads the supplied NASA FIRMS country CSVs under the repository's original data folders.
It preserves those originals, validates filename years against observation dates, stages derived copies,
and applies the committed whole-US polygon during gridding. Alaska and Hawaii are included. Puerto Rico
is outside the approved analysis polygon. The polygon is geographic reference metadata, not invented
hotspot data; the analysis uses its original coordinates, separately from display wrapping.

Run `uv run python -m pipeline.run --region us`. For planted truth use the separately labelled
`--region synthland`; a real US dataset has no planted-truth file. The obsolete US truth integration test
has been removed; fabricated known-answer helper tests and the full synthetic recovery check remain.

Every scientific stage verifies upstream output hashes and the original/staged input, configuration,
outage and polygon attestations. Changed inputs require rebuilding their downstream stages. Outputs live
under data/harmonized/us/ and are published only after staged contract and semantic validation.
Directory overrides move derived data, not the authoritative source folders. See docs/source_fingerprints.md.
