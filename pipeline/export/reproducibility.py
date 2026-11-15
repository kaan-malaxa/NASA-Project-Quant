"""Compare published scientific payloads across supported operating systems."""
import argparse
import hashlib
import json
from pathlib import Path


def normalise(node):
    if isinstance(node, dict):
        return {key: normalise(value) for key, value in node.items()
                if key not in {"generated_at", "code_version", "sha256", "bytes", "downloaded_at"}}
    if isinstance(node, list):
        return [normalise(value) for value in node]
    return node


def snapshot(directory):
    result = {}
    for file in sorted(Path(directory).rglob("*")):
        if not file.is_file() or file.name in {"manifest.json", "numbers_audit.md"}:
            continue
        if file.suffix in {".json", ".geojson"}:
            doc = json.loads(file.read_text(encoding="utf-8"))
            if file.name == "methods.json":
                doc.pop("inputs", None)  # raw Parquet/file bytes and fetch clocks are platform metadata
            payload = json.dumps(normalise(doc), sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        else:
            payload = file.read_bytes().replace(b"\r\n", b"\n")
        result[file.relative_to(directory).as_posix()] = hashlib.sha256(payload).hexdigest()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--compare", nargs="+", type=Path)
    args = parser.parse_args()
    if args.snapshot:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(snapshot(args.snapshot), sort_keys=True, indent=2) + "\n", encoding="utf-8")
        print(f"OK reproducibility snapshot {args.output.name}")
    else:
        documents = [json.loads(file.read_text(encoding="utf-8")) for file in args.compare]
        if len(documents) < 2 or any(doc != documents[0] for doc in documents[1:]):
            raise SystemExit("FAIL cross-OS scientific payloads differ; inspect the uploaded snapshots")
        print(f"OK reproducibility {len(documents)} operating systems, {len(documents[0])} payloads")


if __name__ == "__main__":
    main()
