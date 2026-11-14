import subprocess
import sys
from dataclasses import replace
from types import SimpleNamespace

import pytest

from pipeline import run
from pipeline.common import paths


@pytest.mark.parametrize("region,count", [("synthland", 6), ("us", 5)])
def test_missing_modules_exit_zero(monkeypatch, capsys, region, count):
    if region == "synthland":
        fixture = replace(run.config.get_region("us"), id="synthland", synthetic=True)
        monkeypatch.setattr(run.config, "get_region", lambda region_id: fixture)
    monkeypatch.setattr(run.importlib.util, "find_spec", lambda module: None)
    assert run.main(["--region", region]) == 0
    lines = capsys.readouterr().out.splitlines()
    skips = [line for line in lines if line.startswith("SKIP ")]
    expected = list(run.STAGES) if region == "synthland" else list(run.STAGES[1:])
    assert skips == [f"SKIP {stage}: not implemented yet" for stage in expected]
    assert len(skips) == count


def test_package_without_main_is_not_an_implemented_stage(monkeypatch, capsys):
    def find_spec(module):
        return None if module.endswith(".__main__") else SimpleNamespace(submodule_search_locations=[])
    monkeypatch.setattr(run.importlib.util, "find_spec", find_spec)
    assert run.main(["--region", "us"]) == 0
    assert capsys.readouterr().out.count("SKIP ") == 5


def test_real_subprocess_missing_modules():
    result = subprocess.run(
        [
            sys.executable, "-c",
            ("from pipeline import run; "
            "run.importlib.util.find_spec = lambda module: None; "
            "raise SystemExit(run.main(['--region', 'us']))"),
        ],
        check=False, cwd=paths.PROJECT_ROOT, capture_output=True, text=True, encoding="utf-8",
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.count("SKIP ") == 5


def test_subprocess_order_export_once_and_flags(monkeypatch, tmp_path):
    commands = []
    template = run.config.get_region("us")
    regions = [replace(template, id=f"region-{i}") for i in range(3)]
    regions.append(replace(template, id="synthetic", synthetic=True))
    monkeypatch.setattr(run.config, "load_regions", lambda: regions)
    monkeypatch.setattr(run.importlib.util, "find_spec", lambda module: object())
    def invoke(command, **kwargs):
        commands.append(command)
        return subprocess.CompletedProcess(command, 0)
    monkeypatch.setattr(run.subprocess, "run", invoke)
    assert run.main(["--all-regions", "--data-root", str(tmp_path), "--pass", "N"]) == 0
    assert [command[2] for command in commands] == [
        f"pipeline.{stage}" for _ in range(3) for stage in ("ingest", "harmonize", "eyesight", "stats")
    ] + ["pipeline.export"]
    for command in commands:
        assert command[0] == sys.executable
        assert command[command.index("--data-root") + 1] == str(tmp_path)
        assert command[command.index("--pass") + 1] == "N"
    assert "--region" not in commands[-1]


def test_failure_stops_and_reports(monkeypatch, capsys):
    commands = []
    monkeypatch.setattr(run.importlib.util, "find_spec", lambda module: object())
    def invoke(command, **kwargs):
        commands.append(command)
        return subprocess.CompletedProcess(command, 7)
    monkeypatch.setattr(run.subprocess, "run", invoke)
    assert run.main(["--region", "us"]) == 7
    assert len(commands) == 1
    assert "FAIL ingest us: exit 7" in capsys.readouterr().err


def test_stage_bounds_and_invalid_selection(monkeypatch, capsys):
    monkeypatch.setattr(run.importlib.util, "find_spec", lambda module: None)
    assert run.main(["--region", "us", "--from", "harmonize", "--to", "stats"]) == 0
    assert capsys.readouterr().out.count("SKIP ") == 3
    with pytest.raises(SystemExit):
        run.main(["--region", "us", "--all-regions"])
    with pytest.raises(SystemExit):
        run.main(["--region", "us", "--from", "stats", "--to", "ingest"])
