import hashlib
import json
from datetime import date

import h3
import pandas as pd
import pyarrow as pa
import pytest

from pipeline.common import config, io, paths
from pipeline.ingest import repro_check as repro


@pytest.fixture(autouse=True)
def us_configuration(monkeypatch):
    region = config.get_region("us")
    monkeypatch.setattr(config, "load_regions", lambda: [region])


def cells(rows=None):
    cell = h3.latlng_to_cell(40, -120, 6)
    base = {
        "sensor": "aqua", "local_day": date(2023, 1, 1), "daynight": "D", "h3_r6": cell,
        "h3_r5": h3.cell_to_parent(cell, 5), "n_det": 2, "frp_sum": 1.25, "frp_max": 1.0,
    }
    return pa.Table.from_pylist(
        [{**base, **changes} for changes in ([{}, {"local_day": date(2023, 1, 2), "n_det": 3,
                                             "frp_sum": 2.5}] if rows is None else rows)],
        schema=io.SCHEMAS["celldays"],
    ).to_pandas(types_mapper=pd.ArrowDtype)


def setup_project(root):
    web, parquet = paths.repro_inputs("us", root)
    web.mkdir(parents=True)
    (web / "us").mkdir()
    (web / "us" / "weekly.json").write_text('{"rows":[{"value":1}]}\n', encoding="utf-8")
    (web / "z.bin").write_bytes(b"abc")
    io.write_parquet(cells(), parquet, "celldays")
    return web, parquet


@pytest.fixture
def projects(tmp_path, monkeypatch):
    current, peer = tmp_path / "current", tmp_path / "peer"
    setup_project(current)
    setup_project(peer)
    monkeypatch.setattr(paths, "PROJECT_ROOT", current)
    monkeypatch.setenv("PROMETHEUS_TORCH_DATA_ROOT", str(current / "data"))
    return current, peer


def test_report_known_hashes_sums_and_canonical_value_checksum(projects):
    current, _ = projects
    report = repro.collect(*paths.repro_inputs("us"))
    assert report["files"]["web/public/data/z.bin"] == hashlib.sha256(b"abc").hexdigest()
    assert list(report["files"]) == ["web/public/data/us/weekly.json", "web/public/data/z.bin"]
    expected = {"rows": 2, "sum_n_det": 5, "sum_frp_sum": 3.8}
    assert all(report["celldays"][key] == value for key, value in expected.items())
    canonical = b'{"rows":2,"sum_frp_sum":3.8,"sum_n_det":5}'
    assert report["celldays"]["value_sha256"] == hashlib.sha256(canonical).hexdigest()
    assert str(current) not in json.dumps(report)
    assert repro.collect(*paths.repro_inputs("us")) == report


def test_matching_cli_and_utf8_output(projects, tmp_path, capsys):
    current, peer = projects
    report_path = tmp_path / "report.json"
    assert repro.main(["--region", "us", "--compare-root", str(peer), "--output", str(report_path)]) == 0
    captured = capsys.readouterr()
    assert captured.err == ""
    report = json.loads(captured.out)
    assert report["comparison"] == {"match": True}
    assert json.loads(report_path.read_text(encoding="utf-8")) == report
    assert b'\r' not in report_path.read_bytes()
    assert str(current) not in captured.out and str(peer) not in captured.out


def test_first_filename_then_nested_json_value(projects, capsys):
    _, peer = projects
    web, _ = paths.repro_inputs("us", peer)
    (web / "us" / "weekly.json").write_text('{"rows":[{"value":9}]}', encoding="utf-8")
    (web / "z.bin").write_bytes(b"xyz")
    assert repro.main(["--compare-root", str(peer)]) == 1
    difference = json.loads(capsys.readouterr().out)["comparison"]
    assert difference["first_file"] == "web/public/data/us/weekly.json"
    assert difference["first_value"] == {"location": '$["rows"][0]["value"]', "left": "1", "right": "9"}


def test_csv_columns_and_quoted_fields(projects, capsys):
    current, peer = projects
    for root, value in [(current, "left"), (peer, "right")]:
        web, _ = paths.repro_inputs("us", root)
        (web / "a.csv").write_text(f'name,value\n"with,comma",{value}\n', encoding="utf-8")
    assert repro.main(["--compare-root", str(peer)]) == 1
    diff = json.loads(capsys.readouterr().out)["comparison"]
    assert diff["first_file"] == "web/public/data/a.csv"
    assert diff["first_value"] == {"location": "rows[1][1]", "left": '"left"', "right": '"right"'}


def test_missing_individual_file_is_diagnosed(projects, capsys):
    _, peer = projects
    web, _ = paths.repro_inputs("us", peer)
    (web / "z.bin").unlink()
    assert repro.main(["--compare-root", str(peer)]) == 1
    diff = json.loads(capsys.readouterr().out)["comparison"]
    assert diff["first_file"] == "web/public/data/z.bin"
    assert diff["right_sha256"] is None
    assert diff["first_value"]["right"] == "<missing>"


def test_binary_first_byte_and_end_of_file(projects, capsys):
    _, peer = projects
    web, _ = paths.repro_inputs("us", peer)
    (web / "z.bin").write_bytes(b"ab")
    assert repro.main(["--compare-root", str(peer)]) == 1
    diff = json.loads(capsys.readouterr().out)["comparison"]
    assert diff["first_byte"] == {"offset": 2, "left": 99, "right": None}
    assert diff["first_value"] is None


def test_json_formatting_is_a_byte_mismatch_with_equal_values(projects, capsys):
    _, peer = projects
    web, _ = paths.repro_inputs("us", peer)
    (web / "us" / "weekly.json").write_text('{ "rows": [{"value": 1}] }', encoding="utf-8")
    assert repro.main(["--compare-root", str(peer)]) == 1
    diff = json.loads(capsys.readouterr().out)["comparison"]
    assert diff["first_value"] is None and diff["first_byte"] is not None
    assert "decoded values match" in diff["detail"]


def test_cell_value_change_even_when_row_count_and_checksums_match(projects, capsys):
    _, peer = projects
    _, parquet = paths.repro_inputs("us", peer)
    io.write_parquet(cells([
        {"n_det": 1}, {"local_day": date(2023, 1, 2), "n_det": 4, "frp_sum": 2.5},
    ]), parquet, "celldays")
    assert repro.main(["--compare-root", str(peer)]) == 1
    report = json.loads(capsys.readouterr().out)
    assert report["current"]["celldays"]["value_sha256"] == report["reference"]["celldays"]["value_sha256"]
    assert report["comparison"]["first_file"] == repro.CELLDAYS
    assert report["comparison"]["first_value"] == {"location": "rows[0].n_det", "left": "2", "right": "1"}


def test_cell_row_order_changes_bytes_but_not_decoded_values(projects, capsys):
    _, peer = projects
    _, parquet = paths.repro_inputs("us", peer)
    io.write_parquet(cells().iloc[::-1], parquet, "celldays")
    assert repro.main(["--compare-root", str(peer)]) == 1
    report = json.loads(capsys.readouterr().out)
    assert report["current"]["celldays"]["value_sha256"] == report["reference"]["celldays"]["value_sha256"]
    assert report["comparison"]["first_value"] is None


def test_tiny_float_difference_is_not_hidden_by_display_rounding(projects, capsys):
    _, peer = projects
    _, parquet = paths.repro_inputs("us", peer)
    io.write_parquet(cells([{"frp_sum": 1.25001}, {"local_day": date(2023, 1, 2), "n_det": 3,
                                                "frp_sum": 2.5}]), parquet, "celldays")
    assert repro.main(["--compare-root", str(peer)]) == 1
    diff = json.loads(capsys.readouterr().out)["comparison"]["first_value"]
    assert diff["location"] == "rows[0].frp_sum"
    assert diff["left"] != diff["right"]


def test_missing_outputs_and_empty_web_fail_without_overwriting_report(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(paths, "PROJECT_ROOT", tmp_path)
    monkeypatch.setenv("PROMETHEUS_TORCH_DATA_ROOT", str(tmp_path / "data"))
    report = tmp_path / "saved.json"
    report.write_text("previous", encoding="utf-8")
    assert repro.main(["--output", str(report)]) == 2
    captured = capsys.readouterr()
    assert captured.out == "" and "Missing outputs:" in captured.err
    assert report.read_text(encoding="utf-8") == "previous"
    web, parquet = paths.repro_inputs("us")
    web.mkdir(parents=True)
    io.write_parquet(cells(), parquet, "celldays")
    assert repro.main([]) == 2
    assert "empty website dataset" in capsys.readouterr().err


def test_output_cannot_change_checked_files(projects, capsys):
    current, _ = projects
    web, _ = paths.repro_inputs("us", current)
    target = web / "us" / "weekly.json"
    before = target.read_bytes()
    assert repro.main(["--output", str(target)]) == 2
    assert "outside the files being checked" in capsys.readouterr().err
    assert target.read_bytes() == before


def test_nonfinite_frp_is_rejected(projects):
    current, _ = projects
    _, parquet = paths.repro_inputs("us", current)
    io.write_parquet(cells([{"frp_sum": float("inf")}]), parquet, "celldays")
    with pytest.raises(ValueError, match="non-finite"):
        repro.cell_summary(parquet)


def test_compare_data_override_and_path_helper(projects, tmp_path, capsys):
    current, peer = projects
    alternate = tmp_path / "elsewhere"
    web, parquet = paths.repro_inputs("us", peer, alternate)
    assert web == peer / "web" / "public" / "data"
    assert parquet == alternate / "grid" / "us" / "celldays.parquet"
    io.write_parquet(cells(), parquet, "celldays")
    assert repro.main(["--compare-root", str(peer), "--compare-data-root", str(alternate)]) == 0
    assert json.loads(capsys.readouterr().out)["comparison"]["match"]
    assert paths.repro_inputs("us") == (current / "web" / "public" / "data", paths.celldays("us"))


def test_invalid_json_type_and_missing_nested_value():
    assert repro.first_value({"a": True}, {"a": 1})["location"] == '$["a"]'
    assert repro.first_value({"a": None}, {})["right"] == "<missing>"
    assert repro.first_value([1], [1, 2])["left"] == "<missing>"


def test_summary_metrics_are_checked_even_if_file_hashes_match(projects):
    current = repro.collect(*paths.repro_inputs("us"))
    reference = json.loads(json.dumps(current))
    reference["celldays"]["sum_n_det"] += 1
    inputs = paths.repro_inputs("us")
    result = repro.compare(current, reference, inputs, inputs)
    assert not result["match"]
    assert result["first_file"] == repro.CELLDAYS
    assert result["first_value"]["location"] == 'celldays["sum_n_det"]'
