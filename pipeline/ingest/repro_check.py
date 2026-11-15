"""Hash outputs and diagnose the first cross-machine difference without changing inputs."""
import csv
import hashlib
import json
import math
import sys
from datetime import date
from itertools import zip_longest
from pathlib import Path

from pipeline.common import cli, config, io, paths

CELLDAYS = "data/grid/us/celldays.parquet"
MISSING = object()


def sha256(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def cell_summary(path):
    frame = io.read_parquet(path, "celldays")
    total = math.fsum(float(value) for value in frame.frp_sum)
    if not math.isfinite(total):
        raise ValueError("celldays.frp_sum contains a non-finite value")
    total = round(total, 1)
    metrics = {"rows": len(frame), "sum_n_det": sum(int(value) for value in frame.n_det),
               "sum_frp_sum": total if total else 0.0}
    canonical = json.dumps(metrics, sort_keys=True, allow_nan=False, separators=(",", ":"))
    return {"path": CELLDAYS, "sha256": sha256(path), **metrics,
            "value_sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest()}


def collect(web_root, cells_path):
    missing = []
    if not web_root.is_dir():
        missing.append("web/public/data/")
    if not cells_path.is_file():
        missing.append(CELLDAYS)
    if missing:
        raise FileNotFoundError("Missing outputs: " + ", ".join(missing) + "; run the integrated pipeline first")
    files = {}
    for path in sorted(web_root.rglob("*"), key=lambda path: path.relative_to(web_root).as_posix()):
        if path.is_file():
            if not path.resolve().is_relative_to(web_root.resolve()):
                raise ValueError("Website data file resolves outside web/public/data")
            files["web/public/data/" + path.relative_to(web_root).as_posix()] = sha256(path)
    if not files:
        raise ValueError("No files under web/public/data; cannot verify an empty website dataset")
    return {"region": "us", "files": files, "celldays": cell_summary(cells_path)}


def display(value):
    if value is MISSING:
        return "<missing>"
    if isinstance(value, date):
        value = value.isoformat()
    return json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False)


def first_value(left, right, location="$"):
    if left is MISSING or right is MISSING or type(left) is not type(right):
        return {"location": location, "left": display(left), "right": display(right)}
    if isinstance(left, dict):
        for key in sorted(left.keys() | right.keys()):
            found = first_value(left.get(key, MISSING), right.get(key, MISSING),
                                f"{location}[{json.dumps(key, ensure_ascii=False)}]")
            if found:
                return found
    elif isinstance(left, list):
        for index, (a, b) in enumerate(zip_longest(left, right, fillvalue=MISSING)):
            found = first_value(a, b, f"{location}[{index}]")
            if found:
                return found
    elif left != right:
        return {"location": location, "left": display(left), "right": display(right)}
    return None


def first_byte(left, right):
    offset = 0
    with left.open("rb") as a, right.open("rb") as b:
        while True:
            one, two = a.read(1024 * 1024), b.read(1024 * 1024)
            if one != two:
                for index, (x, y) in enumerate(zip_longest(one, two, fillvalue=None)):
                    if x != y:
                        return {"offset": offset + index, "left": x, "right": y}
            if not one:
                return None
            offset += len(one)


def cell_difference(left, right):
    columns = io.SCHEMAS["celldays"].names
    a = io.read_parquet(left, "celldays").sort_values(columns)
    b = io.read_parquet(right, "celldays").sort_values(columns)
    for index, (one, two) in enumerate(zip_longest(
        a.itertuples(index=False, name=None), b.itertuples(index=False, name=None), fillvalue=MISSING,
    )):
        if one is MISSING or two is MISSING:
            return {"location": f"rows[{index}]", "left": "<missing>" if one is MISSING else "<row present>",
                    "right": "<missing>" if two is MISSING else "<row present>"}
        for column, x, y in zip(columns, one, two):
            if x != y:
                return {"location": f"rows[{index}].{column}", "left": display(x), "right": display(y)}
    return None


def decoded_difference(left, right):
    suffix = left.suffix.lower()
    if suffix == ".parquet":
        return cell_difference(left, right)
    if suffix in {".json", ".geojson"}:
        with left.open(encoding="utf-8-sig") as a, right.open(encoding="utf-8-sig") as b:
            return first_value(json.load(a), json.load(b))
    if suffix == ".csv":
        with left.open(encoding="utf-8-sig", newline="") as a, right.open(encoding="utf-8-sig", newline="") as b:
            for index, (one, two) in enumerate(zip_longest(csv.reader(a), csv.reader(b), fillvalue=MISSING)):
                found = first_value(one, two, f"rows[{index}]")
                if found:
                    return found
        return None
    if suffix in {".md", ".txt", ".yaml", ".yml", ".svg"}:
        a, b = left.read_text(encoding="utf-8-sig"), right.read_text(encoding="utf-8-sig")
        return first_value(a.splitlines(), b.splitlines(), "lines")
    return None


def compare(current, reference, current_inputs, reference_inputs):
    left = {**current["files"], CELLDAYS: current["celldays"]["sha256"]}
    right = {**reference["files"], CELLDAYS: reference["celldays"]["sha256"]}
    for name in sorted(left.keys() | right.keys()):
        if left.get(name) == right.get(name):
            continue
        result = {"match": False, "first_file": name, "left_sha256": left.get(name),
                  "right_sha256": right.get(name)}
        if name not in left or name not in right:
            result["first_value"] = {"location": "$", "left": "<file present>" if name in left else "<missing>",
                                     "right": "<file present>" if name in right else "<missing>"}
            return result
        a = current_inputs[1] if name == CELLDAYS else current_inputs[0] / name.removeprefix("web/public/data/")
        b = reference_inputs[1] if name == CELLDAYS else reference_inputs[0] / name.removeprefix("web/public/data/")
        result["first_byte"] = first_byte(a, b)
        try:
            result["first_value"] = decoded_difference(a, b)
        except (ValueError, UnicodeError) as error:
            result["first_value"] = None
            result["detail"] = f"Cannot decode values: {type(error).__name__}; see first_byte"
        else:
            if result["first_value"] is None:
                result["detail"] = "Bytes differ; decoded values match or this is a binary file. See first_byte."
        return result
    summary_difference = first_value(current["celldays"], reference["celldays"], "celldays")
    if summary_difference:
        return {"match": False, "first_file": CELLDAYS, "left_sha256": left[CELLDAYS],
                "right_sha256": right[CELLDAYS], "first_byte": None, "first_value": summary_difference,
                "detail": "Summary checksums differ despite matching file hashes"}
    return {"match": True}


def main(argv=None):
    parser = cli.stage_parser("ingest.repro_check")
    parser.add_argument("--output", type=Path, help="Save the printed report as UTF-8 JSON")
    parser.add_argument("--compare-root", type=Path, help="Teammate project root containing copied output files")
    parser.add_argument("--compare-data-root", type=Path, help="Override the teammate's derived data directory")
    args = parser.parse_args(argv)
    if args.compare_data_root is not None and args.compare_root is None:
        parser.error("--compare-data-root requires --compare-root")
    try:
        config.require_us_region(config.get_region(args.region or "us"))
        inputs = paths.repro_inputs("us")
        report = collect(*inputs)
        status = 0
        reference_inputs = None
        if args.compare_root is not None:
            reference_inputs = paths.repro_inputs("us", args.compare_root, args.compare_data_root)
            reference = collect(*reference_inputs)
            comparison = compare(report, reference, inputs, reference_inputs)
            report = {"current": report, "reference": reference, "comparison": comparison}
            status = 0 if comparison["match"] else 1
        if args.output is not None:
            output = args.output.resolve()
            for web, cells in [inputs] + ([reference_inputs] if reference_inputs else []):
                if output.is_relative_to(web.resolve()) or output == cells.resolve():
                    raise ValueError("--output must be outside the files being checked")
            io.write_json(report, output)
        print(json.dumps(report, sort_keys=True, ensure_ascii=False, allow_nan=False, indent=2))
        return status
    except (OSError, ValueError) as error:
        print(f"FAIL repro_check: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
