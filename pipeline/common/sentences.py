"""Sentence templates filled by the pipeline (never typed by hand).

- direction_of: SD-14 direction rule.
- verdict_id / verdict_sentence: SD-15 verdict table, evaluated top to bottom.
- ruler_sentence: R1 prompt B2.  nowcast_sentence: R1 prompt C1.  season_shift_sentence: R1 prompt B3.
Numbers in sentences are rounded to whole numbers (percent, days); J to one decimal.
"""

from __future__ import annotations

import math
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date

RISING, FALLING, FLAT = "rising", "falling", "no_clear_change"
MONTHS = ("January", "February", "March", "April", "May", "June", "July", "August",
          "September", "October", "November", "December")


@dataclass(frozen=True)
class Estimate:
    """A per-decade percentage change with its 5th-95th percentile range."""

    pct_per_decade: float | None
    lo: float | None
    hi: float | None
    reason: str = ""

    @property
    def direction(self) -> str:
        return direction_of(self.lo, self.hi)


def direction_of(lo: float, hi: float) -> str:
    """SD-14: rising if lo > 0, falling if hi < 0, else no_clear_change."""
    if lo is None or hi is None:
        return FLAT
    if lo > 0:
        return RISING
    if hi < 0:
        return FALLING
    return FLAT


def whole(x: float) -> str:
    """Round half away from zero to a whole number, never printing '-0'."""
    n = math.floor(abs(x) + 0.5) * (1 if x >= 0 else -1)
    return str(n if n != 0 else 0)


def verdict_id(h: Estimate, n: Estimate, variant_directions: Iterable[str], gap_points: float) -> str:
    """SD-15 sentence_id. gap_points is science.yaml trend.artifact_gap_points."""
    if h.pct_per_decade is None or n.pct_per_decade is None:
        return "unclear"
    if any(d != h.direction for d in variant_directions):
        return "unclear"
    if h.direction == FLAT and n.direction == RISING and n.lo > h.hi:
        return "artifact_flat"
    if h.direction == RISING and n.direction == RISING and n.pct_per_decade - h.pct_per_decade >= gap_points:
        return "artifact_rising"
    if h.direction == FALLING and n.direction in (RISING, FLAT):
        return "artifact_falling"
    if h.direction == n.direction and abs(n.pct_per_decade - h.pct_per_decade) < gap_points:
        return "agree"
    return "unclear"


_DIRECTION_PHRASE = {
    RISING: "satellite-detected burning activity rose",
    FALLING: "satellite-detected burning activity fell",
    FLAT: "no clear change in satellite-detected burning activity",
}


def verdict_sentence(sentence_id: str, h: Estimate, n: Estimate) -> str:
    """Fill the SD-15 template for sentence_id."""
    if h.pct_per_decade is None:
        return f"Trend unavailable: {h.reason or 'insufficient valid annual observations'}."
    if n.pct_per_decade is None:
        return "The corrected trend cannot be compared with the raw record: insufficient raw observations."
    H, Hlo, Hhi, N = whole(h.pct_per_decade), whole(h.lo), whole(h.hi), whole(n.pct_per_decade)
    if sentence_id == "artifact_flat":
        return (f"The raw record suggests burning rose {N}% per decade. After correcting for the sensor "
                f"change, there is no clear change ({Hlo} to {Hhi}% per decade).")
    if sentence_id == "artifact_rising":
        return (f"Burning activity did rise, by about {H}% per decade ({Hlo} to {Hhi}). "
                f"The raw record overstates it at {N}%.")
    if sentence_id == "artifact_falling":
        return (f"The raw record hides a decline: corrected burning activity fell about "
                f"{whole(abs(h.pct_per_decade))}% per decade ({Hlo} to {Hhi}).")
    if sentence_id == "agree":
        return (f"Raw and corrected records agree: {_DIRECTION_PHRASE[h.direction]}, "
                f"about {H}% per decade ({Hlo} to {Hhi}).")
    if sentence_id == "unclear":
        return f"The record does not show a clear long-term change here ({Hlo} to {Hhi}% per decade)."
    raise ValueError(f"unknown sentence_id {sentence_id!r}")


def ruler_sentence(region_name: str, jump_multiple: float) -> str:
    return (f"In {region_name}, VIIRS reports about {jump_multiple:.1f} times as many hotspots as MODIS "
            f"for the same years. Spliced naively, the record jumps in 2012; harmonized, it does not.")


def long_date(d: date) -> str:
    return f"{d.day} {MONTHS[d.month - 1]} {d.year}"


def nowcast_sentence(status: str, region_name: str, end: date | None, value: float | None,
                     percentile: float | None, n_years: int) -> str:
    if status == "unavailable":
        return "No recent satellite data."
    if status == "low_activity":
        return f"Too little burning at this time of year in {region_name} to rank this week."
    if end is None or value is None or percentile is None:
        raise ValueError(f"status {status!r} needs end, value and percentile")
    return (f"In the 7 days to {long_date(end)}, {region_name} had {whole(value)} Aqua-equivalent fire "
            f"cell-days: higher than {whole(percentile)}% of the same week in {n_years} past years.")


def season_shift_sentence(label: str, value: float | None, lo: float | None, hi: float | None) -> str:
    """B3 wording rule: a range that includes 0 says 'no clear shift'. Shift of the season start."""
    if value is None or lo is None or hi is None:
        return "Timing shift unavailable: fewer than three valid annual observations."
    if lo <= 0 <= hi:
        return f"No clear shift in the timing of the {label} season."
    way = "earlier" if value < 0 else "later"
    return (f"The {label} season now starts about {whole(abs(value))} days {way} per decade "
            f"({whole(lo)} to {whole(hi)}).")
