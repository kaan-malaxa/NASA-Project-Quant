"""Exact sensor aliases from contracts section 4.4; unknown values fail."""

MODIS_ALIASES = {"a": "aqua", "aqua": "aqua", "t": "terra", "terra": "terra"}
VIIRS_ALIASES = {
    "n": "snpp",
    "npp": "snpp",
    "suomi-npp": "snpp",
    "suomi npp": "snpp",
    "snpp": "snpp",
    "n20": "noaa20",
    "noaa-20": "noaa20",
    "j1": "noaa20",
    "1": "noaa20",
    "n21": "noaa21",
    "noaa-21": "noaa21",
    "j2": "noaa21",
    "2": "noaa21",
}


def normalise_sensor(raw_value, family):
    aliases = MODIS_ALIASES if family == "modis" else VIIRS_ALIASES if family == "viirs" else None
    if aliases is None or str(raw_value).strip().lower() not in aliases:
        raise ValueError(f"Unknown {family} satellite: {raw_value!r}")
    return aliases[str(raw_value).strip().lower()]


def normalise_viirs_confidence(raw):
    value = str(raw).strip().lower()[:1]
    if value not in ("l", "n", "h"):
        raise ValueError(f"Unknown VIIRS confidence: {raw!r}")
    return value
