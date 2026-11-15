"""SD-09 annual hotspot counts; Terra+Aqua and S-NPP remain separate columns."""

from collections.abc import Callable, Mapping

import numpy as np
import pandas as pd

from pipeline.harmonize.calibrate import _dated


def naive_annual(
    hotspot_counts: pd.DataFrame,
    coverage: pd.DataFrame,
    science: Mapping,
    last_complete_year: int,
    *,
    aggregate: Callable | None = None,
) -> pd.DataFrame:
    """Coverage-scale totals with common, counting a MODIS day if either covered.

    Day+night hotspot counts are already combined in n_det_all. Counts from an
    uncovered sensor are ignored, even if stale rows exist. Covered dates with
    no hotspot row mean zero detections. Uncovered dates stay null.
    """
    start = pd.Timestamp(science["eras"]["record_start"])
    empty = pd.DataFrame(
        {
            "year": pd.Series(dtype="int32"),
            "modis_count": pd.Series(dtype="Float64"),
            "snpp_count": pd.Series(dtype="Float64"),
            "modis_covered_frac": pd.Series(dtype="float64"),
            "snpp_covered_frac": pd.Series(dtype="float64"),
        }
    )
    if last_complete_year < start.year:
        return empty
    if aggregate is None:
        from pipeline.common.timebins import aggregate

    end = pd.Timestamp(year=last_complete_year, month=12, day=31)
    days = pd.date_range(start, end, name="local_day")
    counts = hotspot_counts[["sensor", "local_day", "n_det_all"]].copy()
    counts["local_day"] = pd.to_datetime(counts["local_day"], errors="raise")
    if counts["local_day"].isna().any() or counts.duplicated(["sensor", "local_day"]).any():
        raise ValueError("Hotspot counts need one valid row per sensor and local_day")
    sensor_covered, sensor_counts = {}, {}
    for sensor in ("aqua", "terra", "snpp"):
        sensor_coverage = _dated(coverage.loc[coverage["sensor"].eq(sensor), ["local_day", "covered"]])
        covered = sensor_coverage.set_index("local_day")["covered"].reindex(days).eq(True)
        raw = counts.loc[counts["sensor"].eq(sensor)].set_index("local_day")["n_det_all"]
        # A missing row on a covered date is a genuine zero, but a supplied null
        # row is invalid and must not silently become a detection count of zero.
        if raw.loc[raw.index.intersection(days[covered])].isna().any():
            raise ValueError("Covered hotspot counts must not be null")
        raw = raw.reindex(days).fillna(0).astype("Float64")
        values = raw[covered].to_numpy(dtype=float, na_value=np.nan)
        if not np.isfinite(values).all() or (values < 0).any():
            raise ValueError("Covered hotspot counts must be finite and non-negative")
        sensor_counts[sensor] = raw.where(covered, 0)
        sensor_covered[sensor] = covered
    modis_covered = sensor_covered["aqua"] | sensor_covered["terra"]
    modis = (sensor_counts["aqua"] + sensor_counts["terra"]).where(modis_covered)
    snpp = sensor_counts["snpp"].where(sensor_covered["snpp"])
    years = np.arange(start.year, last_complete_year + 1, dtype=np.int32)
    result = pd.DataFrame({"year": years}).set_index("year")
    for name, values in (("modis", modis), ("snpp", snpp)):
        daily = pd.DataFrame({"local_day": days.date, "value": pd.array(values, dtype="Float64")})
        annual = aggregate(daily, grain="year", value_cols=("value",)).set_index("year")
        if set(annual.index) != set(years):
            raise ValueError("common.timebins.aggregate must return every supplied calendar year")
        annual = annual.reindex(years)
        result[f"{name}_count"] = annual["value"].astype("Float64")
        result[f"{name}_covered_frac"] = (annual["n_covered"] / annual["n_days"]).astype(float)
    return result.reset_index()[list(empty.columns)]
