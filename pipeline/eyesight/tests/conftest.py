"""Temporary: until R2's pyproject.toml configures the import path, make `import pipeline.eyesight` work when
pytest is run from the repo root without an installed package."""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
TESTS_DIR = Path(__file__).resolve().parent
for p in (REPO_ROOT, TESTS_DIR):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))
