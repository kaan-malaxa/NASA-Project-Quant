import pytest

from pipeline.common.sensors import normalise_sensor, normalise_viirs_confidence


@pytest.mark.parametrize("family,canonical,aliases", [
    ("modis", "aqua", ["A", "Aqua"]),
    ("modis", "terra", ["T", "Terra"]),
    ("viirs", "snpp", ["N", "NPP", "Suomi-NPP", "Suomi NPP", "SNPP"]),
    ("viirs", "noaa20", ["N20", "NOAA-20", "J1", "1"]),
    ("viirs", "noaa21", ["N21", "NOAA-21", "J2", "2"]),
])
def test_every_contracted_alias(family, canonical, aliases):
    for alias in aliases:
        assert normalise_sensor(alias, family) == canonical
        assert normalise_sensor(alias.swapcase(), family) == canonical


@pytest.mark.parametrize("family", ["modis", "viirs"])
def test_unknown_sensor(family):
    with pytest.raises(ValueError, match="Unknown"):
        normalise_sensor("X", family)


@pytest.mark.parametrize("raw,expected", [
    ("l", "l"), ("low", "l"), ("n", "n"), ("Nominal", "n"), ("h", "h"), ("High", "h"),
])
def test_confidence(raw, expected):
    assert normalise_viirs_confidence(raw) == expected


def test_invalid_confidence():
    with pytest.raises(ValueError):
        normalise_viirs_confidence("X")
