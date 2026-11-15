# Repaired accessibility, colour vision, print and exports

The repaired real US publication is the source of the current design artifacts. This supersedes the old
sample-data report. Detailed machine results are in a11y/check_results.json and docs/repair_acceptance.md.

Colour-vision captures: 15. Gallery chart checks: 59.
Calendar and clock arrow-key movement, Enter selection and focus outlines passed. The two noninteractive
colour legends are accessible images and intentionally have no keyboard action. Reduced-motion checks
show the final label immediately; normal-motion checks show the animation completing. Print and brief
themes retain white paper backgrounds, dark text and missing-data hatching. Current shareable exports
are real outputs, not sample drafts; exports/manifest.json records source and file hashes.

Browser accessibility and real mobile layout passed in the production-build suite. The human two-person
clock test remains unrun and cannot be replaced by screenshots or automated checks.
