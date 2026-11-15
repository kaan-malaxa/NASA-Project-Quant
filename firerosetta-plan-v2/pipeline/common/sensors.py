"""Strict normalization of the aliases frozen in contracts section 4.4."""
from typing import Literal

_ALIASES = {
    "modis": {"a": "aqua", "aqua": "aqua", "t": "terra", "terra": "terra"},
    "viirs": {
        "n": "snpp", "npp": "snpp", "suomi-npp": "snpp", "suomi npp": "snpp", "snpp": "snpp",
        "n20": "noaa20", "noaa-20": "noaa20", "j1": "noaa20", "1": "noaa20",
        "n21": "noaa21", "noaa-21": "noaa21", "j2": "noaa21", "2": "noaa21",
    },
}


def normalise_sensor(raw_value: str, family: Literal["modis", "viirs"]) -> str:
    try:
        return _ALIASES[family][str(raw_value).strip().lower()]
    except KeyError:
        raise ValueError(f"Unknown {family} satellite value: {raw_value!r}") from None


def normalise_viirs_confidence(raw) -> Literal["l", "n", "h"]:
    value = str(raw).strip().lower()
    aliases = {"l": "l", "low": "l", "n": "n", "nominal": "n", "h": "h", "high": "h"}
    if value not in aliases:
        raise ValueError(f"Unknown VIIRS confidence: {raw!r}")
    return aliases[value]
