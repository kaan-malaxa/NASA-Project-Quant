# Reproducibility and publication integrity

The pipeline workflow runs frozen dependency installation, lint, unit tests, an isolated full synthetic
pipeline and contract/semantic validation on Windows, Ubuntu and macOS. Each operating system uploads a
scientific-payload snapshot. A dependent job requires identical snapshots across all three systems.

Set SOURCE_DATE_EPOCH to the same value when comparing builds. Runtime hashes and byte counts are always
checked against the actual manifest. For cross-OS scientific comparison, the snapshot strips build clocks,
commit identifiers and derived hash/byte metadata, normalises text line endings and omits input-file
provenance metadata from methods.json. It retains all scientific values, kinds, intervals, validation
results, selected-period results and spatial contributions. Original-byte integrity and scientific-value
reproducibility are separate checks, both required by CI.

```text
uv run python -m pipeline.export.reproducibility --snapshot web/public/data --output .cache/repro-local.json
uv run python -m pipeline.export.reproducibility --compare .cache/repro-local.json PEER_SNAPSHOT.json
```

The existing pipeline.ingest.repro_check command remains available for exact byte comparisons and the first
differing decoded value. Byte comparisons deliberately detect build clocks, metadata and encoding differences;
do not describe a normalised scientific comparison as proof that Parquet bytes are identical across systems.

Actual local acceptance is recorded in repair_acceptance.md. Windows execution does not establish an Ubuntu
or macOS pass. Remote CI execution and scientific sign-off remain pending until their real results exist.
