"""Use R2's pipeline.common.timebins when it exists; otherwise install the test-only stand-in."""

from __future__ import annotations

import importlib
import sys
import types

try:
    importlib.import_module("pipeline.common.timebins")
    USING_STANDIN = False
except ModuleNotFoundError:
    from pipeline.stats.tests import timebins_standin

    common = sys.modules.get("pipeline.common") or types.ModuleType("pipeline.common")
    common.__path__ = getattr(common, "__path__", [])
    common.timebins = timebins_standin
    sys.modules["pipeline.common"] = common
    sys.modules["pipeline.common.timebins"] = timebins_standin
    USING_STANDIN = True


def pytest_report_header(config):
    if USING_STANDIN:
        return "pipeline.common.timebins missing: stats tests use tests/timebins_standin.py"
    return None
