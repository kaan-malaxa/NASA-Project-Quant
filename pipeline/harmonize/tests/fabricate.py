"""Deterministic, in-memory cell-day fixtures with explicit planted counts.

Cell IDs are opaque test labels, not geographic H3 indexes. No production
stage or common helper is needed to construct these inputs.
"""

from collections.abc import Iterable, Mapping
from fractions import Fraction
from unittest.mock import Mock

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
    outages = {sensor: set(pd.to_datetime(list(days)).date) for sensor, days in (uncovered or {}).items()}
    rows, coverage = [], []
    for day in sorted(dates):
        aqua_count = Fraction(aqua_per_day) * (seasonal or {}).get(day.month, 1)
        snpp_count = aqua_count * Fraction(str((year_ratios or {}).get(day.year, snpp_per_aqua)))
        noaa20_count = snpp_count * Fraction(str(noaa20_per_snpp))
        for sensor, count in (
            ("aqua", aqua_count),
            ("snpp", snpp_count),
            ("noaa20", noaa20_count),
        ):
            if count.denominator != 1 or count < 0:
                raise ValueError("Planted ratios must produce non-negative integer counts")
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


def series_tables(n20_first_year: int = 2019) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Sparse known-answer inputs covering era boundaries and a full NOAA year.

    Detection ratios are Aqua:S-NPP:NOAA-20 = 4:8:10. The first NOAA-20 year
    has at least 300 distinct detection days. Coverage is intentionally sparse:
    dates absent from it must become missing rows in the complete output grid.
    """
    anchors = pd.to_datetime(
        [
            "2003-01-01",
            "2012-01-18",
            "2012-01-19",
            "2012-01-20",
            "2020-06-01",
            "2022-12-31",
            "2023-01-01",
            "2023-01-02",
            "2025-12-31",
            "2026-01-01",
            "2026-01-02",
            "2026-01-03",
        ]
    )
    dates = (
        pd.date_range("2013-01-01", "2025-12-01", freq="MS")
        .union(pd.date_range(f"{n20_first_year}-01-01", periods=300))
        .union(anchors)
    )
    cells, coverage = planted_tables(
        dates,
        uncovered={
            "aqua": ["2012-01-18", "2020-06-01", "2026-01-03"],
            "snpp": ["2023-01-02", "2026-01-03"],
            "noaa20": ["2026-01-02", "2026-01-03"],
        },
    )
    for sensor, start in (
        ("snpp", pd.Timestamp("2012-01-20").date()),
        ("noaa20", pd.Timestamp(year=n20_first_year, month=1, day=1).date()),
    ):
        before_start = coverage["sensor"].eq(sensor) & coverage["local_day"].lt(start)
        coverage.loc[before_start, ["covered", "reason"]] = [False, "before_start"]
        cells = cells.loc[~(cells["sensor"].eq(sensor) & cells["local_day"].lt(start))]
    return cells.reset_index(drop=True), coverage


def annual_aggregate_spy(min_covered_frac: float = 0.9):
    """Record calls while executing the real shared annual binning rules."""
    from pipeline.common.config import load_science
    from pipeline.common.timebins import aggregate

    assert min_covered_frac == load_science()["timebins"]["year_min_covered_frac"]
    return Mock(side_effect=aggregate)


def ratio_daily_tables(ratios, *, first_year: int = 2013, last_year: int = 2025):
    """Known monthly counts: VIIRS=100, NOAA-20=125, Aqua=100*yearly ratio."""
    dates = pd.date_range(f"{first_year}-01-01", f"{last_year}-12-01", freq="MS")
    aqua = [100 * ratios[(day.year - first_year) % len(ratios)] for day in dates]
    counts = {
        "aqua": daily_table(dates, aqua),
        "snpp": daily_table(dates, [100] * len(dates)),
        "noaa20": daily_table(dates, [125] * len(dates)),
    }
    # Only the detection dates are needed by the first-full-year diagnostic.
    cells = pd.DataFrame({"sensor": "noaa20", "local_day": dates.date})
    return counts, cells
