"""Fill local delivery documents from the validated publication and numbers audit."""
import argparse
import json

from pipeline.common import io, paths
from pipeline.export.audit import dir_loader
from pipeline.export.check import run_check


def documents(read, audit):
    regions, methods = read("regions.json"), read("methods.json")
    region = next(row for row in regions["regions"] if not row["synthetic"])
    rid = region["id"]
    trend, ruler, nowcast = [read(f"{rid}/{name}.json") for name in ("trend", "ruler", "nowcast")]
    claims = "\n\n".join(f'> {doc["sentence"]}\n\nSource: `{rid}/{name}.json#/sentence`.'
                              for name, doc in (("ruler", ruler), ("trend", trend), ("nowcast", nowcast)))
    checks = []
    for row in methods["validation"]:
        if row["region"] == rid and row["test"] in {"loyo_weekly_wape", "t1_t2_wape", "reliability_err",
                                                    "reliability_year_absolute_err"}:
            checks.append(f'- {row["method"]} {row["test"]}: {json.dumps(row["value"])}. {row["note"]}')
    checks = "\n".join(checks)
    truth = next((line for line in audit.splitlines() if line.startswith("- planted truth passed")),
                 "Planted-truth recovery is unavailable; inspect methods.json.")
    limits = "\n".join(f"- {line}" for line in methods["limitations"])
    sources = "\n".join(f'- [{row["text"]}]({row["url"]}) (checked {row["checked"]}).'
                         for row in methods["sources"])
    intro = ("FireRosetta makes a satellite record inspectable across changes in observing instruments. "
             "It calibrates separate sensor records to the Aqua scale, preserves missing observations and "
             "shows uncertainty, held-out prediction checks and the limits of the conclusion. A hotspot is "
             "a detection of heat in a pixel, not an individual fire. Counts describe fire cell-days, not burned area.")
    implemented = ("The static JavaScript application reads validated files from web/public/data/. Analysis years "
                   "select complete calendar years and load Python-precomputed trend, season, climatology and ruler "
                   "results. Exact dates independently select daily totals and downloads. Anomaly comparisons retain "
                   "the configured historical baseline. Maps and area summaries sum authoritative daily-source "
                   "contributions, including outage fills, calibration bounds and regional coverage scaling. "
                   "The analysis polygon includes Alaska and Hawaii; display wrapping leaves that polygon unchanged.")
    pending = ("Human completion remains pending: scientific sign-off, the two-person clock usability test, team "
               "identities and AI disclosure review, final submission links and the read-aloud check. Cross-OS CI "
               "is configured to compare scientific payloads; a Windows run alone does not establish those results. "
               "No external publication is part of this repair.")
    ai = ("OpenAI Codex assisted implementation, integration repair, regression tests, source verification and "
          "document generation. The team must confirm other assistant use and completed human review before submission.")
    readme = f"""# FireRosetta

{intro}

{implemented}

## Reproduce locally

Run these commands separately from the repository root:

```text
uv sync --frozen
uv run python -m pipeline.run --all-regions --include-synthetic
uv run python -m pipeline.export --check
uv run pytest -q
uv run ruff check pipeline
uv run python -m pipeline.export.delivery
```

For one region use `--region us` or `--region synthland`. To isolate a run, pass `--data-root` and
`--web-output-dir`; these move derived outputs, while supplied original country CSVs stay under `data/`.
Compatible published regions are preserved without requiring their intermediates. A changed configuration
or invalid prior manifest requires a complete rebuild. See [contracts](plan/02_CONTRACTS.md).

From `web/`, run these commands separately:

```text
npm ci
npm run gen:types
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run e2e
npm run dev
```

On PowerShell systems that block npm.ps1, use `npm.cmd` and `npx.cmd`. Runtime source remains JavaScript;
the compiler checks it against generated schema declarations. No new dependency is required.

## Audited output

These sentences are generated from the published JSON, with every claim traced in the
[numbers audit](web/public/data/numbers_audit.md). They remain subject to human scientific sign-off.

{claims}

{checks}

{truth}

## Data and limitations

Credit: [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/). Original country CSVs are unchanged.
The simulator is a separate, explicitly labelled validation region. Genuine recent inputs require independent
daily coverage metadata; historical data are never relabelled as recent. Local hotspot archives and their
inventory are prepared under `data/exports/`; release hosting remains pending.

{limits}

{sources}

Geographic boundary credit: [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/).
Optional basemap: [OpenFreeMap](https://openfreemap.org/), OpenMapTiles and OpenStreetMap contributors.
Project code: [MIT License](LICENSE).

## Review and delivery

See the [requirements matrix](plan/REQUIREMENTS_MATRIX.md) and [repair acceptance](docs/repair_acceptance.md).

{pending}

{ai}
"""
    submission = f"""# FireRosetta: Reading US Burning Activity Across Satellite Changes

{intro}

{implemented}

## Evidence from the numbers audit

{claims}

{checks}

{truth}

## Limitations (verbatim from methods.json)

{limits}

## NASA data and references

NASA FIRMS supplies MODIS Terra/Aqua and VIIRS S-NPP/NOAA-20 hotspot observations. The local supplied
country files are the historical inputs. The configured polygon, coverage rules and calibration windows
determine the analysis; fitted diagnostics are distinguished from held-out prediction comparisons.

{sources}

Credit [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) and Natural Earth. Optional map attribution:
OpenFreeMap, OpenMapTiles and OpenStreetMap contributors. Space agency partner data: none.

## AI disclosure and human completion

{ai}

{pending}

Team identities: {{{{team:identities}}}}
Live site: {{{{link:live_site}}}}
Demo video: {{{{link:video}}}}
Public repository: {{{{link:repository}}}}
Slide deck: {{{{link:slide_deck}}}}
"""
    slides = f"""# FireRosetta slide text

Generated from the same publication as `numbers_audit.md`; slide graphics are in `design/exports/`.

## The question

{intro}

## The instrument change and the corrected record

{claims}

## The checks

{checks}

{truth}

## Explore and qualify

{implemented}

## Limitations and sources

{limits}

{sources}

## Before submission

{pending}
"""
    spoken = [intro, ruler["sentence"], trend["sentence"], nowcast["sentence"],
              "The methods page reports prediction tests on held-out years, including failures and the separate yearly reliability diagnostic.",
              "Choose analysis years to compare seasons. Use exact dates for daily totals and downloads. Maps and selected areas share the regional calculation.",
              "A hotspot is not a fire or a measure of burned area. Missing observations remain missing. Human scientific review remains pending."]
    script = "# Video script\n\nGenerated from published outputs; confirm timing, team attribution and links before recording.\n\n"
    script += "\n\n".join(spoken) + "\n\nCredit NASA FIRMS. All numerical sentences resolve through `web/public/data/numbers_audit.md`.\n"
    subtitles = []
    for index, sentence in enumerate(spoken):
        start, end = index * 15, (index + 1) * 15
        stamp = lambda second: f"00:{second // 60:02d}:{second % 60:02d},000"
        subtitles.append(f"{index + 1}\n{stamp(start)} --> {stamp(end)}\n{sentence}")
    return {"README.md": readme, "docs/submission.md": submission, "docs/slides/deck.md": slides,
            "docs/video/script.md": script, "docs/video/subtitles.srt": "\n\n".join(subtitles) + "\n"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web-output-dir", type=paths.Path, default=paths.web_data_dir())
    parser.add_argument("--output-root", type=paths.Path, default=paths.PROJECT_ROOT)
    args = parser.parse_args()
    errors = [result.line() for result in run_check(args.web_output_dir) if not result.ok]
    if errors:
        raise SystemExit("Cannot generate delivery documents from an invalid publication: " + errors[0])
    if io.read_json(args.web_output_dir / "manifest.json")["contains_sample"]:
        raise SystemExit("Sample outputs cannot become submission claims")
    audit = (args.web_output_dir / "numbers_audit.md").read_text(encoding="utf-8")
    for relative, text in documents(dir_loader(args.web_output_dir), audit).items():
        file = args.output_root / relative
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(text, encoding="utf-8", newline="\n")
    print("OK delivery: README, submission, slides, video script and subtitles filled from audited outputs")


if __name__ == "__main__":
    main()
