"""Deterministic, in-memory cell-day fixtures with explicit planted counts.

Cell IDs are opaque test labels, not geographic H3 indexes. No production
stage or common helper is needed to construct these inputs.
"""

from collections.abc import Iterable, Mapping
from fractions import Fraction

import pandas as pd


def daily_table(
    dates: Iterable,
    counts: Iterable[float],
    covered: Iterable[bool] | None = None,
) -> pd.DataFrame:
    """Build known daily counts; retain supplied wild values on outage days."""
    dates = list(dates)
    return pd.DataFrame(
        {
            "local_day": pd.to_datetime(dates).date,
            "count": list(counts),
            "covered": [True] * len(dates) if covered is None else list(covered),
        }
    )


def planted_tables(
    dates: Iterable,
    *,
    aqua_per_day: int = 4,
    snpp_per_aqua: float = 2,
    noaa20_per_snpp: float = 1.25,
    seasonal: Mapping[int, int] | None = None,
    year_ratios: Mapping[int, float] | None = None,
    uncovered: Mapping[str, Iterable] | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Build contract-shaped tables with seasonal, yearly and outage signals.

    seasonal maps month to an Aqua activity multiplier; year_ratios overrides
    snpp_per_aqua by year. Ratios must produce integral cell counts. Outages
    change coverage while retaining detections to expose coverage leaks.
    """
    dates = pd.to_datetime(list(dates)).date
    if len(set(dates)) != len(dates):
        raise ValueError("Fixture dates must be unique")
    outages = {
        sensor: set(pd.to_datetime(list(days)).date)
        for sensor, days in (uncovered or {}).items()
    }
    rows, coverage = [], []
    for day in sorted(dates):
        aqua_count = Fraction(aqua_per_day) * (seasonal or {}).get(day.month, 1)
        snpp_count = aqua_count * Fraction(
            str((year_ratios or {}).get(day.year, snpp_per_aqua))
        )
        noaa20_count = snpp_count * Fraction(str(noaa20_per_snpp))
        for sensor, count in (
            ("aqua", aqua_count),
            ("snpp", snpp_count),
            ("noaa20", noaa20_count),
        ):
            if count.denominator != 1 or count < 0:
                raise ValueError(
                    "Planted ratios must produce non-negative integer counts"
                )
            covered = day not in outages.get(sensor, set())
            coverage.append((sensor, day, covered, "ok" if covered else "outage_list"))
            for cell in range(int(count)):
                rows.append(
                    (
                        sensor,
                        day,
                        "D",
                        f"cell-{cell}",
                        f"parent-{cell // 7}",
                        1,
                        1.0,
                        1.0,
                    )
                )
    return (
        pd.DataFrame(
            rows,
            columns=[
                "sensor",
                "local_day",
                "daynight",
                "h3_r6",
                "h3_r5",
                "n_det",
                "frp_sum",
                "frp_max",
            ],
        ),
        pd.DataFrame(coverage, columns=["sensor", "local_day", "covered", "reason"]),
    )
