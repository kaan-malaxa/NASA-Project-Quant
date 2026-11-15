"""Fabricated science configuration; never writes R3's project file."""
import pytest

from pipeline.common import timebins


@pytest.fixture(autouse=True)
def science_thresholds(monkeypatch):
    monkeypatch.setattr(timebins, "load_science", lambda: {
        "timebins": {
            "solar_degrees_per_hour": 15,
            "week_min_covered_days": 5,
            "month_min_covered_frac": 0.8,
            "year_min_covered_frac": 0.9,
        },
    })
