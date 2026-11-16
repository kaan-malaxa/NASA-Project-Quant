import gzip
import hashlib
import json

from pipeline.common import io
from pipeline.export.assemble import is_world_region
from pipeline.export.compress import compress_region


def write(path, doc):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    return path.read_bytes()


def test_payloads_are_gzipped_losslessly_and_indices_follow(tmp_path):
    region = tmp_path / "brazil"
    shard = {"cells": [f"85{i:013x}" for i in range(200)], "values": list(range(200))}
    originals = {
        "spatial/2003.json": write(region / "spatial" / "2003.json", shard),
        "periods/2003-2003.json": write(region / "periods" / "2003-2003.json", {"x": [1.5] * 100}),
        "daily.json": write(region / "daily.json", {"rows": [{"v": 1}] * 100}),
    }
    write(region / "spatial_index.json", {"years": [{"year": 2003, "path": "spatial/2003.json", "bytes": 1, "sha256": "0"}]})
    write(region / "period_index.json", {"periods": [{"years": [2003, 2003], "path": "periods/2003-2003.json",
                                                      "bytes": 1, "sha256": "0"}]})
    tiny = region / "tiny.json"
    tiny.write_bytes(b"{}")  # gzip would be larger: left as is
    (region / "outline.geojson").write_text('{"type": "FeatureCollection", "features": []}', encoding="utf-8")
    assert compress_region(region) == 3
    for relative, original in originals.items():
        stored = (region / relative).read_bytes()
        assert stored[:2] == io.GZIP_MAGIC and gzip.decompress(stored) == original
        assert io.read_json(region / relative) == json.loads(original)
    shard_entry = io.read_json(region / "spatial_index.json")["years"][0]
    stored = (region / "spatial" / "2003.json").read_bytes()
    assert shard_entry == {"year": 2003, "path": "spatial/2003.json", "bytes": len(stored),
                           "sha256": hashlib.sha256(stored).hexdigest()}
    period_entry = io.read_json(region / "period_index.json")["periods"][0]
    assert period_entry["sha256"] == hashlib.sha256((region / "periods" / "2003-2003.json").read_bytes()).hexdigest()
    assert tiny.read_bytes() == b"{}"
    assert (region / "outline.geojson").read_bytes()[:1] == b"{"
    # Idempotent and deterministic: a second run changes nothing.
    before = {path: path.read_bytes() for path in region.rglob("*") if path.is_file()}
    assert compress_region(region) == 0
    assert before == {path: path.read_bytes() for path in region.rglob("*") if path.is_file()}


def test_only_world_regions_are_compressed():
    assert not is_world_region("us") and not is_world_region("synthland") and not is_world_region("nowhere")
    assert is_world_region("portugal")
