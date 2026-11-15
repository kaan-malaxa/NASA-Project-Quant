"""Where it burns: hex.json, outline.geojson, cells_monthly.csv (contracts 6.10, 6.12).

Input: data/grid/<region>/celldays.parquet (5.2), one row per sensor x res-6 cell x local day x pass,
so counting rows counts res-6 fire cell-days. Only the reference pass (science.yaml reference.pass,
daytime) is used. Years and sensor eras come from science.yaml:
  hex years      = first year of tier1.snpp_fit .. year of eras.snpp_through   (2013-2025)
  primary VIIRS  = S-NPP through eras.snpp_through, NOAA-20 after (SD-05)
"""

from __future__ import annotations

import csv
import io
from datetime import date
from typing import Any

import pandas as pd

from pipeline.common import timebins

CELLS_MONTHLY_HEADER = ["h3_r5", "ym", "aqua", "viirs"]          # contracts 6.12
HEX_UNIT = "VIIRS fire cell-days per year"


def _day_pass(celldays: pd.DataFrame, science: dict[str, Any]) -> pd.DataFrame:
    f = celldays[celldays["daynight"] == science["reference"]["pass"]].copy()
    f["local_day"] = pd.to_datetime(f["local_day"]).dt.date
    return f


def hex_years(science: dict[str, Any]) -> tuple[int, int]:
    return (date.fromisoformat(science["tier1"]["snpp_fit"][0]).year,
            date.fromisoformat(science["eras"]["snpp_through"]).year)


def hex_json(celldays: pd.DataFrame, critical_weeks: list[int], region: str, science: dict[str, Any],
             header: dict[str, Any]) -> dict[str, Any]:
    """Mean yearly S-NPP res-6 fire cell-days per res-5 cell: in the critical weeks and all year."""
    y0, y1 = hex_years(science)
    n_years = y1 - y0 + 1
    f = _day_pass(celldays, science)
    f = f[(f["sensor"] == "snpp") & f["local_day"].map(lambda d: y0 <= d.year <= y1)]
    crit = set(critical_weeks)
    in_crit = f["local_day"].map(lambda d: timebins.week_of_year(d) in crit)
    all_year = f.groupby("h3_r5").size()
    critical = f[in_crit].groupby("h3_r5").size().reindex(all_year.index, fill_value=0)
    cells = [{"h3": str(h), "critical": float(critical[h]) / n_years, "all_year": float(all_year[h]) / n_years}
             for h in sorted(all_year.index)]
    return {**header, "region": region, "resolution": science["grid"]["map_res"], "unit": HEX_UNIT,
            "source": "snpp", "years": [y0, y1], "kind": "observed", "cells": cells}


def cells_monthly_rows(celldays: pd.DataFrame, science: dict[str, Any]) -> list[list[Any]]:
    """[h3_r5, ym, aqua, viirs] per res-5 cell and month; rows with both zero never appear."""
    snpp_through = date.fromisoformat(science["eras"]["snpp_through"])
    f = _day_pass(celldays, science)
    f["ym"] = f["local_day"].map(lambda d: d.year * 100 + d.month)
    primary = ((f["sensor"] == "snpp") & f["local_day"].map(lambda d: d <= snpp_through)) | \
              ((f["sensor"] == "noaa20") & f["local_day"].map(lambda d: d > snpp_through))
    aqua = f[f["sensor"] == "aqua"].groupby(["h3_r5", "ym"]).size().rename("aqua")
    viirs = f[primary].groupby(["h3_r5", "ym"]).size().rename("viirs")
    table = pd.concat([aqua, viirs], axis=1).fillna(0).astype(int).sort_index()
    return [[str(h), int(ym), int(r["aqua"]), int(r["viirs"])] for (h, ym), r in table.iterrows()
            if r["aqua"] or r["viirs"]]


def cells_monthly_csv(rows: list[list[Any]]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(CELLS_MONTHLY_HEADER)
    writer.writerows(rows)
    return buf.getvalue()


def _geometries(geojson: dict[str, Any]) -> list[dict[str, Any]]:
    kind = geojson.get("type")
    if kind == "FeatureCollection":
        return [g for f in geojson["features"] for g in _geometries(f)]
    if kind == "Feature":
        return _geometries(geojson["geometry"])
    if kind in ("Polygon", "MultiPolygon"):
        return [geojson]
    raise ValueError(f"region polygon must be (Multi)Polygon geometry, got {kind!r}")


def outline_geojson(region: dict[str, Any], polygon: dict[str, Any] | None) -> dict[str, Any]:
    """FeatureCollection with exactly one feature: the region polygon, or its bbox rectangle if none."""
    if polygon is None:
        w, s, e, n = region["bbox"]
        geometry: dict[str, Any] = {"type": "Polygon", "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}
        membership = "bbox"
    else:
        geoms = _geometries(polygon)
        if len(geoms) == 1:
            geometry = geoms[0]
        else:                                             # e.g. several admin-1 units: one MultiPolygon
            parts = []
            for g in geoms:
                parts += [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
            geometry = {"type": "MultiPolygon", "coordinates": parts}
        membership = "polygon"
    return {"type": "FeatureCollection", "features": [{
        "type": "Feature", "properties": {"id": region["id"], "name": region["name"], "membership": membership},
        "geometry": geometry}]}
