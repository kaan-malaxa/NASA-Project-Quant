"""Temporary: until R2's pyproject.toml configures the import path, make `import pipeline.eyesight` work when
pytest is run from the repo root without an installed package."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
TESTS_DIR = Path(__file__).resolve().parent
for p in (REPO_ROOT, TESTS_DIR):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))


@pytest.fixture(scope="module", autouse=True)
def fabricated_stage_boundary():
    """The fabricated 'fab' CLI tables mock only the upstream provenance boundary."""
    from pipeline.common import provenance
    verify, record = provenance.verify_stage, provenance.record_stage
    with patch.object(provenance, "verify_stage", side_effect=lambda region, stage:
                      {} if region == "fab" else verify(region, stage)), patch.object(
                          provenance, "record_stage", side_effect=lambda region, *args, **kwargs:
                          None if region == "fab" else record(region, *args, **kwargs)):
        yield
