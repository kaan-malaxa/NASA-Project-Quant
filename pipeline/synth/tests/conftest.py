"""Shared fixtures. One tiny simulation per seed per session (about 5 s each)."""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import pytest

# Temporary: until R2's pyproject.toml configures the import path, make `import pipeline.synth` work
# when pytest is run from the repo root without an installed package.
REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from pipeline.synth.__main__ import run  # noqa: E402
from pipeline.synth.write_firms import FILE_NAMES  # noqa: E402

_CACHE: dict[int, Path] = {}


def simulate_tiny(seed: int, root: Path) -> Path:
    if seed not in _CACHE:
        out = root / f"seed{seed}"
        run("synthland", seed, "tiny", out)
        _CACHE[seed] = out
    return _CACHE[seed]


@pytest.fixture(scope="session")
def sim_root(tmp_path_factory) -> Path:
    return tmp_path_factory.mktemp("synth")


@pytest.fixture(scope="session")
def tiny7(sim_root) -> Path:
    return simulate_tiny(7, sim_root)


@pytest.fixture(scope="session")
def tables7(tiny7) -> dict[str, pd.DataFrame]:
    return {k: pd.read_csv(tiny7 / name, dtype=str, keep_default_na=False) for k, name in FILE_NAMES.items()}
