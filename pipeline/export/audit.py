"""`python -m pipeline.export.audit`: the numbers audit list (R1 prompt E1; contracts 6.13 note).

Prints and writes web/public/data/numbers_audit.md: every headline number of the site, one line each,
    - <label>: <value>  <file>#<JSON Pointer>
Values are copied exactly as stored in the JSON (json.dumps), so each line can be checked by
resolving its pointer. Missing files or entries appear as MISSING lines, never silently dropped.
No number may appear in the pitch, slides or video unless it is on this list (AGENTS science rule 5).
The list is built only from files already in web/public/data; it computes nothing new except the
planted-truth pass count, which is labelled as a count over the listed rows.
"""

from __future__ import annotations

import json
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

AUDIT_FILE = "numbers_audit.md"
Loader = Callable[[str], Any]          # relative path -> parsed JSON, or None if the file is absent


def pointer(*parts: Any) -> str:
    """JSON Pointer (RFC 6901) for the given keys / indexes."""
    return "/" + "/".join(str(p).replace("~", "~0").replace("/", "~1") for p in parts)


def resolve_pointer(doc: Any, ptr: str) -> Any:
    node = doc
    for raw in ptr.split("/")[1:]:
        key = raw.replace("~1", "/").replace("~0", "~")
        node = node[int(key)] if isinstance(node, list) else node[key]
    return node


class Lines:
    def __init__(self) -> None:
        self.out: list[str] = []

    def heading(self, text: str) -> None:
        self.out += ["", text, ""]

    def value(self, label: str, doc: Any, file: str, *parts: Any) -> None:
        ptr = pointer(*parts)
        try:
            v = resolve_pointer(doc, ptr)
        except (KeyError, IndexError, TypeError):
            self.out.append(f"- MISSING {label}: no value  {file}#{ptr}")
            return
        self.out.append(f"- {label}: {json.dumps(v, ensure_ascii=False)}  {file}#{ptr}")

    def missing_file(self, label: str, file: str) -> None:
        self.out.append(f"- MISSING {label}: file absent  {file}#")


def build_audit(read: Loader) -> str:
    """The audit text. It never reads manifest.json, so writing the manifest afterwards keeps it valid."""
    versions: set[str] = set()

    def load(rel: str) -> Any:
        doc = read(rel)
        if isinstance(doc, dict) and isinstance(doc.get("code_version"), str):
            versions.add(doc["code_version"])
        return doc

    regions_doc, methods = load("regions.json"), load("methods.json")
    L = Lines()

    if regions_doc is None:
        L.heading("## Regions")
        L.missing_file("regions", "regions.json")
        regions: list[dict[str, Any]] = []
    else:
        regions = regions_doc["regions"]

    for r in regions:
        rid = r["id"]
        L.heading(f"## {r['name']} (`{rid}`)")

        ruler = load(f"{rid}/ruler.json")
        f = f"{rid}/ruler.json"
        if ruler is None:
            L.missing_file("ruler", f)
        else:
            for k in ("value", "lo", "hi"):
                L.value(f"jump multiple ({k})", ruler, f, "jump_multiple", k)
            L.value("jump multiple years", ruler, f, "jump_multiple", "years")
            L.value("ruler sentence", ruler, f, "sentence")

        trend = load(f"{rid}/trend.json")
        f = f"{rid}/trend.json"
        if trend is None:
            L.missing_file("trend", f)
        else:
            for line in ("harmonized", "naive"):
                for k in ("pct_per_decade", "lo", "hi", "direction"):
                    L.value(f"{line} trend {k}", trend, f, line, k)
            L.value("trend years", trend, f, "years")
            L.value("verdict sentence_id", trend, f, "sentence_id")
            L.value("verdict sentence", trend, f, "sentence")

        season = load(f"{rid}/season.json")
        f = f"{rid}/season.json"
        if season is None:
            L.missing_file("season", f)
        else:
            L.value("critical weeks", season, f, "critical_weeks")
            for i, w in enumerate(season.get("windows", [])):
                n = f"window {w.get('id', i + 1)}"
                for k in ("label", "start_week", "peak_week", "end_week", "share"):
                    L.value(f"{n} {k}", season, f, "windows", i, k)
                for k in ("value", "lo", "hi"):
                    L.value(f"{n} start shift days per decade ({k})", season, f,
                            "windows", i, "shift_days_per_decade", "start", k)
                L.value(f"{n} sentence", season, f, "windows", i, "sentence")

        nowcast = load(f"{rid}/nowcast.json")
        f = f"{rid}/nowcast.json"
        if nowcast is None:
            L.missing_file("nowcast", f)
        else:
            for k in ("value", "lo", "hi", "percentile", "status", "as_of"):
                L.value(f"this week {k}", nowcast, f, k)
            L.value("this week window start", nowcast, f, "window", "start")
            L.value("this week window end", nowcast, f, "window", "end")
            L.value("this week years compared", nowcast, f, "baseline_years")
            for k in ("value", "median", "ratio", "percentile"):
                L.value(f"month to date {k}", nowcast, f, "month_to_date", k)
            L.value("this week sentence", nowcast, f, "sentence")

        f = "methods.json"
        if methods is None:
            L.missing_file("methods", f)
            continue
        wape = [i for i, v in enumerate(methods.get("validation", []))
                if v.get("region") == rid and v.get("test") == "loyo_weekly_wape"]
        if not wape:
            L.out.append(f"- MISSING LOYO weekly WAPE: no loyo_weekly_wape row for {rid}  {f}#/validation")
        for i in wape:
            method = methods["validation"][i].get("method")
            L.value(f"LOYO weekly WAPE ({method})", methods, f, "validation", i, "value")
            for b in sorted(methods["validation"][i].get("baselines", {})):
                L.value(f"LOYO weekly WAPE baseline {b}", methods, f, "validation", i, "baselines", b)
            L.value("LOYO years", methods, f, "validation", i, "years")
        for i, row in enumerate(methods.get("validation", [])):
            if row.get("region") == rid and row.get("test") in {
                "t1_t2_wape", "reliability_err", "reliability_year_absolute_err"
            }:
                L.value(f"{row['test']} ({row['method']})", methods, f, "validation", i, "value")
        eyes = [i for i, e in enumerate(methods.get("eyesight", [])) if e.get("region") == rid]
        if not eyes:
            L.out.append(f"- MISSING eyesight: no eyesight entry for {rid}  {f}#/eyesight")
        for i in eyes:
            L.value("eyesight status", methods, f, "eyesight", i, "status")
            for k in sorted(methods["eyesight"][i].get("params", {})):
                L.value(f"eyesight param {k}", methods, f, "eyesight", i, "params", k)
            if "g" in methods["eyesight"][i]:
                L.value("eyesight g", methods, f, "eyesight", i, "g")

    L.heading("## Planted truth (synthland)")
    if methods is None:
        L.missing_file("planted truth", "methods.json")
    else:
        rows = methods.get("planted_truth", [])
        passed = sum(1 for row in rows if row.get("pass") is True)
        L.out.append(f"- planted truth passed (count of pass = true): {passed} of {len(rows)}  "
                     f"methods.json#/planted_truth")
        for i, row in enumerate(rows):
            for k in ("truth", "recovered", "tolerance", "pass"):
                L.value(f"{row.get('quantity')} {k}", methods, "methods.json", "planted_truth", i, k)

    head = ["# Numbers audit", "",
            ("Every headline number on the site, with the file and JSON Pointer it comes from. "
             "No number may appear in the pitch, slides, README or video unless it is on this list. "
             "Values are copied exactly from the files; sentences are quoted exactly."),
            "", f"Built from code_version {', '.join(sorted(versions)) or 'unknown'}."]
    if "sample" in versions:
        head += ["", "**SAMPLE DATA: these numbers are fabricated for design work. Do not use them anywhere.**"]
    return "\n".join(head + L.out) + "\n"


def dir_loader(data_dir: Path) -> Loader:
    def load(rel: str) -> Any:
        path = data_dir.joinpath(*rel.split("/"))
        from pipeline.common.io import read_json

        return read_json(path) if path.is_file() else None
    return load


def write_audit(data_dir: Path) -> str:
    text = build_audit(dir_loader(data_dir))
    (data_dir / AUDIT_FILE).write_text(text, encoding="utf-8", newline="\n")
    return text


def main() -> int:
    from pipeline.export.check import default_data_dir

    data_dir = default_data_dir()
    if not (data_dir / "regions.json").is_file():
        print(f"FAIL export.audit: {data_dir / 'regions.json'} does not exist; run `python -m pipeline.export` first")
        return 1
    text = write_audit(data_dir)
    sys.stdout.write(text)
    print(f"OK export.audit all rows={sum(line.startswith('- ') for line in text.splitlines())}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
