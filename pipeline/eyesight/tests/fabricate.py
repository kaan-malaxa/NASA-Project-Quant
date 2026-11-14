"""Fabricated celldays (contracts 5.2) and coverage (5.3) tables for eyesight tests. No other stage is used.

Also a stand-in for R2's ingest on a synthetic region (R4 role file, section 11): reads only the raw FIRMS-format
CSVs in data/raw/<region>/ and writes data/grid/<region>/celldays.parquet and coverage.parquet, plus a
STAND_IN_BY_R4.txt marker. R2's real ingest overwrites them.

    python pipeline/eyesight/tests/fabricate.py --from-raw synthland
"""

from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from pathlib import Path

import h3
import numpy as np
import pandas as pd

CELLDAY_COLUMNS = ["sensor", "local_day", "daynight", "h3_r6", "h3_r5", "n_det", "frp_sum", "frp_max"]


def cell(lat: float, lon: float) -> str:
    return h3.latlng_to_cell(lat, lon, 6)


def neighbour_of(c: str) -> str:
    """A cell in the first ring around c (deterministic: smallest index that is not c)."""
    return sorted(set(h3.grid_disk(c, 1)) - {c})[0]


def celldays(rows: list[tuple]) -> pd.DataFrame:
    """rows: (sensor, local_day 'YYYY-MM-DD', h3_r6, frp_sum[, daynight[, n_det]])."""
    out = []
    for r in rows:
        sensor, day, c, frp = r[:4]
        daynight = r[4] if len(r) > 4 else "D"
        n_det = r[5] if len(r) > 5 else 1
        out.append({"sensor": sensor, "local_day": date.fromisoformat(day), "daynight": daynight, "h3_r6": c,
                    "h3_r5": h3.cell_to_parent(c, 5), "n_det": np.int32(n_det),
                    "frp_sum": np.float32(frp) if frp is not None else np.nan,
                    "frp_max": np.float32(frp) if frp is not None else np.nan})
    df = pd.DataFrame(out, columns=CELLDAY_COLUMNS)
    df["n_det"] = df["n_det"].astype("int32")
    df["frp_sum"] = df["frp_sum"].astype("float32")
    df["frp_max"] = df["frp_max"].astype("float32")
    return df


def coverage(start: str, end: str, sensors=("aqua", "snpp"), uncovered: dict[str, list[str]] | None = None
             ) -> pd.DataFrame:
    """One row per sensor per day; days listed in `uncovered[sensor]` get covered = False."""
    uncovered = uncovered or {}
    d0, d1 = date.fromisoformat(start), date.fromisoformat(end)
    days = [d0 + timedelta(days=i) for i in range((d1 - d0).days + 1)]
    rows = []
    for s in sensors:
        off = {date.fromisoformat(x) for x in uncovered.get(s, [])}
        rows += [{"sensor": s, "local_day": d, "covered": d not in off,
                  "reason": "outage_list" if d in off else "ok"} for d in days]
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------------- stand-in ingest
SATELLITES = {"modis": {"A": "aqua", "Aqua": "aqua", "T": "terra", "Terra": "terra"},
              "viirs": {"N": "snpp", "NPP": "snpp", "N20": "noaa20", "NOAA-20": "noaa20"}}
STAND_IN_BBOX = {"synthland": (10.0, 10.0, 12.0, 12.0)}  # SD-19; only synthetic regions get a stand-in
RECORD_START = date(2003, 1, 1)


def _read_raw(raw: Path) -> pd.DataFrame:
    parts = []
    for pattern, family in (("modis_*.csv", "modis"), ("viirs_snpp_*.csv", "viirs"), ("viirs_noaa20_*.csv", "viirs")):
        for f in sorted(raw.glob(pattern)):
            df = pd.read_csv(f, dtype=str, keep_default_na=False)
            unknown = set(df["satellite"]) - set(SATELLITES[family])
            if unknown:
                raise ValueError(f"{f.name}: unknown satellite values {sorted(unknown)}")
            df["sensor"] = df["satellite"].map(SATELLITES[family])
            df["family"] = family
            parts.append(df)
    if not parts:
        raise FileNotFoundError(f"no raw CSVs in {raw}")
    return pd.concat(parts, ignore_index=True)


def celldays_from_raw(raw: Path, bbox, modis_min_conf=30, viirs_keep=("n", "h"), count_res=6, mask_res=8):
    """SD-02 filters, SD-18 static mask for rows without type, SD-03 local day, SD-04 res-6 daytime and night
    cell-days, bbox membership by cell centre, SD-08 coverage from raw-row presence."""
    df = _read_raw(raw).drop_duplicates()
    df["lat"] = pd.to_numeric(df["latitude"], errors="coerce")
    df["lon"] = pd.to_numeric(df["longitude"], errors="coerce")
    df["frp_f"] = pd.to_numeric(df["frp"], errors="coerce")
    df["utc"] = pd.to_datetime(df["acq_date"] + " " + df["acq_time"].str.zfill(4), format="%Y-%m-%d %H%M",
                               errors="coerce")
    df["utc_date"] = df["utc"].dt.date

    raw_days = df.groupby("sensor")["utc_date"].agg(lambda s: set(s.dropna()))

    ok = df["lat"].between(-90, 90) & df["lon"].between(-180, 180) & df["utc"].notna()
    west, south, east, north = bbox
    ok &= df["lon"].between(west, east) & df["lat"].between(south, north)
    df = df[ok].copy()
    df["h3_r8"] = [h3.latlng_to_cell(a, b, mask_res) for a, b in zip(df["lat"], df["lon"])]

    has_type = df["type"] != ""
    static_counts = df[has_type & df["type"].isin(["1", "2", "3"])].groupby("h3_r8").size()
    static = set(static_counts[static_counts >= 3].index)
    mask = set().union(*[h3.grid_disk(c, 1) for c in static]) if static else set()
    keep = (has_type & (df["type"] == "0")) | (~has_type & ~df["h3_r8"].isin(mask))

    conf = df["confidence"].str.lower().str[:1]
    modis = df["family"] == "modis"
    conf_ok = np.where(modis, pd.to_numeric(df["confidence"], errors="coerce").fillna(-1) >= modis_min_conf,
                       conf.isin(list(viirs_keep)))
    df = df[keep & conf_ok].copy()

    df["local_day"] = (df["utc"] + pd.to_timedelta(df["lon"] / 15.0, unit="h")).dt.date
    df["h3_r6"] = [h3.latlng_to_cell(a, b, count_res) for a, b in zip(df["lat"], df["lon"])]
    cells = df["h3_r6"].unique()
    centre = {c: h3.cell_to_latlng(c) for c in cells}
    inside = {c: south <= centre[c][0] <= north and west <= centre[c][1] <= east for c in cells}
    df = df[df["h3_r6"].map(inside)].copy()
    df["h3_r5"] = df["h3_r6"].map({c: h3.cell_to_parent(c, 5) for c in cells})

    cd = (df.groupby(["sensor", "local_day", "daynight", "h3_r6", "h3_r5"], sort=True)
          .agg(n_det=("frp_f", "size"), frp_sum=("frp_f", "sum"), frp_max=("frp_f", "max")).reset_index())
    cd["n_det"] = cd["n_det"].astype("int32")
    cd["frp_sum"] = cd["frp_sum"].astype("float32")
    cd["frp_max"] = cd["frp_max"].astype("float32")

    last_day = max(max(v) for v in raw_days)
    days = [RECORD_START + timedelta(days=i) for i in range((last_day - RECORD_START).days + 1)]
    rows = []
    for sensor in sorted(raw_days.index):
        have = raw_days[sensor]
        first, last = min(have), max(have)
        for d in days:
            reason = ("before_start" if d < first else "after_end" if d > last
                      else "ok" if d in have else "no_raw_rows")
            rows.append({"sensor": sensor, "local_day": d, "covered": reason == "ok", "reason": reason})
    return cd[CELLDAY_COLUMNS], pd.DataFrame(rows)


def main(argv=None) -> int:
    repo = Path(__file__).resolve().parents[3]
    sys.path.insert(0, str(repo))
    from pipeline.eyesight import compat

    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--from-raw", required=True, metavar="REGION")
    p.add_argument("--data-root", default=None)
    args = p.parse_args(argv)
    if args.from_raw not in STAND_IN_BBOX:
        print(f"stand-in ingest is only for synthetic regions {sorted(STAND_IN_BBOX)}", file=sys.stderr)
        return 2
    compat.set_data_root(args.data_root)
    cd, cov = celldays_from_raw(compat.raw_dir(args.from_raw), STAND_IN_BBOX[args.from_raw])
    out = compat.grid_dir(args.from_raw)
    compat.write_parquet(cd, out / "celldays.parquet", "celldays")
    compat.write_parquet(cov, out / "coverage.parquet", "coverage")
    (out / "STAND_IN_BY_R4.txt").write_text(
        "celldays.parquet and coverage.parquet here were written by R4's stand-in ingest "
        "(pipeline/eyesight/tests/fabricate.py), not by R2's pipeline.ingest. Re-run ingest to replace them.\n",
        encoding="utf-8")
    print(f"stand-in ingest {args.from_raw}: celldays={len(cd)} coverage={len(cov)} -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
