import json
import subprocess
from datetime import date

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from pipeline.common import io


def test_json_deterministic(tmp_path):
    path = tmp_path / "nested" / "output.json"
    io.write_json({"z": [1.23456, {"ü": 9.87654}], "a": 2.34567}, path)
    text = path.read_text(encoding="utf-8")
    assert text.index('"a"') < text.index('"z"')
    assert "ü" in text
    assert text.endswith("\n") and "\r" not in text
    assert json.loads(text) == {"a": 2.346, "z": [1.235, {"ü": 9.877}]}
    previous = path.read_bytes()
    for invalid in [float("nan"), float("inf"), float("-inf")]:
        with pytest.raises(ValueError):
            io.write_json({"nested": [invalid]}, path)
        assert path.read_bytes() == previous


def test_missing_column_rejected(tmp_path):
    with pytest.raises(ValueError, match="expected columns"):
        io.write_parquet(pd.DataFrame({"sensor": ["aqua"]}), tmp_path / "bad.parquet", "coverage")


def test_parquet_schema_and_zstd(tmp_path):
    frame = pd.DataFrame({
        "sensor": ["aqua"], "local_day": [date(2024, 1, 1)], "covered": [True], "reason": ["ok"],
    })
    path = tmp_path / "nested" / "coverage.parquet"
    io.write_parquet(frame, path, "coverage")
    assert io.read_parquet(path, "coverage").to_dict("records") == frame.to_dict("records")
    table = pq.read_table(path)
    assert table.schema.field("local_day").type == pa.date32()
    assert pq.ParquetFile(path).metadata.row_group(0).column(0).compression == "ZSTD"


def test_invalid_dtype_and_read_schema(tmp_path):
    path = tmp_path / "bad.parquet"
    frame = pd.DataFrame({"h3_r8": [1]})
    with pytest.raises(ValueError, match="expected string"):
        io.write_parquet(frame, path, "static_mask")
    frame.to_parquet(path)
    with pytest.raises(ValueError, match="expected string"):
        io.read_parquet(path, "static_mask")


def test_region_metadata(tmp_path):
    frame = pd.DataFrame({"h3_r6": ["cell6"], "h3_r5": ["cell5"], "lat": [10.0], "lon": [11.0]})
    path = tmp_path / "cells.parquet"
    with pytest.raises(ValueError, match="membership"):
        io.write_parquet(frame, path, "region_cells")
    frame.attrs["membership"] = "bbox"
    io.write_parquet(frame, path, "region_cells")
    assert io.read_parquet(path, "region_cells").attrs["membership"] == "bbox"


def test_all_contracted_schemas_roundtrip(tmp_path):
    for name, schema in io.SCHEMAS.items():
        values = {
            "sensor": "aqua", "daynight": "D", "product": "SP", "kind": "observed",
            "source": "aqua", "reason": "ok",
        }
        arrays = []
        for field in schema:
            if field.nullable:
                value = None
            elif pa.types.is_string(field.type):
                value = values.get(field.name, "cell")
            elif pa.types.is_date32(field.type):
                value = date(2024, 1, 1)
            elif pa.types.is_timestamp(field.type):
                value = pd.Timestamp("2024-01-01").to_pydatetime()
            elif pa.types.is_boolean(field.type):
                value = True
            else:
                value = 1
            arrays.append(pa.array([value], type=field.type))
        frame = pa.Table.from_arrays(arrays, schema=schema).to_pandas()
        if name == "region_cells":
            frame.attrs["membership"] = "polygon"
        io.write_parquet(frame, tmp_path / f"{name}.parquet", name)
        assert len(io.read_parquet(tmp_path / f"{name}.parquet", name)) == 1


def test_code_version(monkeypatch):
    monkeypatch.setattr(io.subprocess, "run", lambda *a, **k: subprocess.CompletedProcess(a, 0, "abc123\n"))
    assert io.code_version() == "abc123"
    def fail(*args, **kwargs):
        raise OSError("git absent")
    monkeypatch.setattr(io.subprocess, "run", fail)
    assert io.code_version() == "unknown"
