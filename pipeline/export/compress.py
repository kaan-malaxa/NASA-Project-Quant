"""Lossless gzip of world-country publications, so ~235 countries fit in the repository and on Pages.

Mirrors web/scripts/compress-data.mjs: every JSON payload except the shard indices is stored gzipped
under its contracted path, and the period/spatial indices are updated to the compressed bytes and
hashes. fetchJson, pipeline.common.io.read_json and the checker read both forms; the manifest is
computed afterwards from the stored bytes. United States and simulated publications are unchanged.
"""
import gzip
import hashlib
from pathlib import Path

from pipeline.common import io

INDEXES = ("period_index.json", "spatial_index.json")


def _fingerprint(data: bytes) -> dict:
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def compress_region(folder: Path) -> int:
    """Gzip the region's JSON payloads in place; returns how many files were compressed."""
    folder = Path(folder)
    changed = {}
    for path in sorted(folder.rglob("*.json")):
        if path.name.endswith("_index.json"):
            continue
        data = path.read_bytes()
        if data[:2] == io.GZIP_MAGIC:
            continue
        packed = gzip.compress(data, compresslevel=9, mtime=0)  # mtime 0: byte-identical rebuilds
        if len(packed) >= len(data):
            continue
        if gzip.decompress(packed) != data:
            raise ValueError(f"gzip round trip failed for {path}")
        path.write_bytes(packed)
        changed[path.relative_to(folder).as_posix()] = _fingerprint(packed)
    for name in INDEXES:
        index_path = folder / name
        if not index_path.is_file():
            continue
        doc = io.read_json(index_path)
        touched = False
        for item in doc.get("periods") or doc.get("years") or []:
            fingerprint = changed.get(item["path"])
            if fingerprint:
                item.update(fingerprint)
                touched = True
        if touched:
            io.write_json(doc, index_path)
    return len(changed)
