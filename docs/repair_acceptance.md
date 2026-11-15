# Integration repair acceptance

The user authorized the full cross-role repair and contract updates, supplied the Git author identity,
and explicitly requested local commits on main. No external deployment, release or submission was made.
Original CSVs and the scientific constants in science.yaml remain unchanged.

This report records executed checks. Local Windows results do not imply unobserved Ubuntu/macOS CI runs
or human scientific approval. The public dataset's producer revision is recorded in its manifest; the
current implementation and delivery evidence have their own source revisions.

## Static and unit verification

```text
uv run --frozen ruff check pipeline
All checks passed!
```
```text
uv run --frozen pytest -q
572 passed, 6 skipped in 325.62s (0:05:25)
```
The remaining skips are pre-existing optional-input/platform checks. Required real fixtures in the Node AOI test fail when absent; they never skip. Separate clean pipeline runs below exercise the real and synthetic integrations.

```text
npm run gen:types
npm run typecheck
npm run lint
Generated 20 contracts
TypeScript compiler: exit 0 (allowJs/checkJs/noEmit)
ESLint: exit 0
```
```text
npm test -- --silent=false
[aoi] us: 276 nonmissing months checked, including outages and partial coverage
[aoi] synthland: 286 nonmissing months checked, including outages and partial coverage
Test Files  42 passed (42)
Tests  241 passed (241)
```
The AOI comparison checks every nonmissing month, uncertainty bounds, kind and source, including outage substitutions and partial coverage. Zero and missing remain distinct.

## Clean integration runs

Each run started with a new derived-data root and publication directory. Source CSVs were read from the unchanged repository originals.

```text
uv run --frozen python -m pipeline.run --region us --data-root .cache/fresh-us/derived --web-output-dir .cache/fresh-us/web
OK stats us rows=75609 seconds=531.924
OK export all rows=1 seconds=253.7
OK run us rows=0 seconds=1573.182
```
```text
uv run --frozen python -m pipeline.run --region synthland --synth-size full --data-root .cache/fresh-synth/derived --web-output-dir .cache/fresh-synth/web
OK stats synthland rows=78462 seconds=342.887
OK export all rows=1 seconds=37.2
OK run synthland rows=0 seconds=483.210
```
```text
uv run --frozen python -m pipeline.run --all-regions --include-synthetic --data-root .cache/fresh-combined/derived --web-output-dir .cache/fresh-combined/web
OK stats us rows=75609 seconds=522.945
OK stats synthland rows=78462 seconds=184.957
OK export all rows=2 seconds=78.2
OK run all rows=0 seconds=1654.150
```
Later NRT handoff changes were verified with the full unit suite, covered-zero integration, separate manifest attestations and private CSV publication tests. Current real inputs contain no NRT source, so current recent products remain unavailable.

```text
python .cache/publish_repaired.py
OK export all rows=2 seconds=127.1
OK export all rows=2 seconds=126.5
OK real scoped rebuilds preserve unrelated regions and method rows without their intermediates
OK export all rows=2 seconds=88.3
OK local repaired publication: all manifest, schema and semantic checks pass
OK delivery: README, submission, slides, video script and subtitles filled from audited outputs
```
[Scoped publication evidence](scoped_publication_acceptance.json) records byte-for-byte preservation of unrelated region files and unchanged Methods rows using only the selected region’s intermediates. Transaction tests inject failures before manifest installation and verify restoration of replaced and removed assets.

```text
uv run --frozen python -m pipeline.export --check
OK export all rows=631 seconds=54.9
```
## Scientific and reproducibility evidence

The synthetic recovery reports **10 of 10 checks passed**, read from methods.json. The US eyesight route remains exploratory because its prediction error fails the locked acceptance ratio. The pooled reliability metric is retained alongside the absolute yearly diagnostic; neither is retuned. Matching excluded-year predictions and training-year lists are persisted for both routes.

[Period evidence](period_analysis_acceptance.json) confirms exact full-period reproduction and checks short, historical-only, sensor-boundary and unavailable-robustness cases. Fabricated regressions cover complete correlated pre-2023 bootstrap draws, zero/missing denominators, covered-zero NRT windows, missing calibration, leap dates, filename years and provenance tampering.

[Windows reproducibility](reproducibility_windows.json) compares independent single-region and combined scientific payloads. CI installs locked dependencies and runs isolated synthetic integration, planted-truth assertions, contracts and a scientific-payload comparison across Windows, Ubuntu and macOS. Remote CI execution remains pending. The Pages production build occurs after browser testing, preserving its repository base path.

[Source fingerprints](source_fingerprints.md) and [per-file reconciliation](source_fingerprint_reconciliation.json) verify all supplied originals. Historical differences are LF/CRLF normalization only; no original was rewritten. [Fact review](fact_verification.md) distinguishes primary-source confirmations from unavailable live outage tables and unverified submission details.

## Browser and design verification

```text
npx playwright test --workers=2
36 passed (2.0m)
```
The production-build suite includes real period selection and URL restoration; exact-date independence; selected-cell contribution sums; CSV and brief links; keyboard details; phone layouts; reduced motion; deliberate optional-basemap failure; and serious/critical axe checks. Unexpected application errors still fail.

```text
node .cache/firefox_check.mjs
{"browser":"Firefox","region":"us","analysis_years":[2003,2025],"code_version":"29a6fe64","clock_cells":1196,"hover_operations":50,"driver_inclusive_hover_ms":34.136,"page_errors":[]}
```
Firefox required an approved run outside the managed sandbox after its headless control connection timed out inside it. The reported hover timing includes automation overhead and is not a claimed rendering latency.

`node design/tools/run.mjs check --region us` generated 15 vision-emulation captures, keyboard/reduced-motion checks and print/PDF evidence. `export --region us` generated 11 real-data shareable images, including matching held-out agreement and the authoritative spatial map. Their hashes are in [the export manifest](../design/exports/manifest.json). [Real phone captures](../design/c1/real_capture.json) and [Firefox evidence](../design/c1/firefox_hover.json) identify their actual publication. Legends remain noninteractive accessible images; the two legend entries in the keyboard report are intentional.

## Delivery and remaining human work

README, submission text, slide text, video script and subtitles were generated by `pipeline.export.delivery` from the validated JSON and numbers audit. Numerical claims were copied through pipeline templates. Local hotspot archives are prepared and verified in [the artifact report](hotspot_artifacts_acceptance.json); hosting links were not invented.

Pending human completion: scientific sign-off; the two-person clock usability test; team identities and AI-disclosure review; final submission links and read-aloud review. The clock test remains explicitly unrun. Cross-OS remote CI results remain unobserved in this local session.

## Five-line handoff

Built: repaired scientific handoffs, selectable periods, authoritative AOI/map views, guarded publication and delivery artifacts.  
Run: `uv run python -m pipeline.run --all-regions --include-synthetic`; web commands are in README.  
Reads/writes: unchanged local originals to private derived data, validated static assets, audit documents and local design/download artifacts.  
Limits: genuine current NRT input is absent; remote CI and human approval are pending.  
Next: review the evidence, run the human clock/science checks, and complete team and submission details.
