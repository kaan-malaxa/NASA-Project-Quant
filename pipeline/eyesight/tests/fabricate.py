"""Fabricated celldays (contracts 5.2) and coverage (5.3) tables for eyesight tests. No other stage is used.

Also a stand-in for R2's ingest (R4 role file, section 11) until pipeline.ingest exists. It reads raw FIRMS CSVs
read-only (never renames or moves them) and writes data/grid/<region>/celldays.parquet and coverage.parquet plus a
STAND_IN_BY_R4.txt marker. R2's real ingest overwrites them; every result built on a stand-in must be re-run then.

    python pipeline/eyesight/tests/fabricate.py --from-raw synthland
    python pipeline/eyesight/tests/fabricate.py --from-raw usa
"""

from __future__ import annotations

import argparse
import sys
import time
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
# Satellite codes from contracts section 4.4 (only the ones these files use); unknown values raise.
SATELLITES = {"modis": {"A": "aqua", "Aqua": "aqua", "T": "terra", "Terra": "terra"},
              "viirs": {"N": "snpp", "NPP": "snpp", "N20": "noaa20", "NOAA-20": "noaa20"}}
RECORD_START = date(2003, 1, 1)
# Source files relative to the data root, per family. synthland: the simulator's raw folder. usa: the FIRMS
# United_States country files where they were downloaded (read in place). bbox is W, S, E, N.
STAND_IN_SOURCES = {
    "synthland": {"bbox": (10.0, 10.0, 12.0, 12.0),  # SD-19
                  "modis": ["raw/synthland/modis_*.csv"],
                  "viirs": ["raw/synthland/viirs_snpp_*.csv", "raw/synthland/viirs_noaa20_*.csv"]},
    "usa": {"bbox": (-125.0, 24.0, -66.0, 50.0),  # provisional contiguous-US bbox (R4 role file, section 1)
            "modis": ["MODIS_data/modis_*_United_States.csv"],
            "viirs": ["VIIRS-SNPP_data/viirs-snpp_*_United_States.csv",
                      "VIIRS-JPSS_data/viirs-jpss1_*_United_States.csv"]},
}


def _files(root: Path, patterns: list[str]) -> list[str]:
    return sorted(p.as_posix() for pat in patterns for p in root.glob(pat))


def celldays_from_files(files: dict[str, list[str]], bbox, modis_min_conf=30, viirs_keep=("n", "h"),
                        count_res=6, mask_res=8, log=print) -> tuple[pd.DataFrame, pd.DataFrame]:
    """SD-02 filters, SD-18 static mask for rows without type, SD-03 local day, SD-04 res-6 cell-days (both passes),
    membership by cell centre inside the bbox, SD-08 coverage from raw-row presence (rule 3). DuckDB does the
    reading and filtering; h3 runs only on rows that passed the filters."""
    import duckdb

    con = duckdb.connect()
    parts = []
    for family, flist in files.items():
        if not flist:
            continue
        rel = f"raw_{family}"
        con.execute(f"CREATE TEMP TABLE {rel} AS SELECT DISTINCT * FROM read_csv(?, all_varchar = true, "
                    f"header = true, union_by_name = true)", [flist])
        sats = {r[0] for r in con.execute(f"SELECT DISTINCT satellite FROM {rel}").fetchall()}
        unknown = sats - set(SATELLITES[family])
        if unknown:
            raise ValueError(f"unknown {family} satellite values {sorted(unknown)}")
        mapping = " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in SATELLITES[family].items())
        parts.append(f"""
            SELECT '{family}' AS family, CASE satellite {mapping} END AS sensor,
                   TRY_CAST(latitude AS DOUBLE) AS lat, TRY_CAST(longitude AS DOUBLE) AS lon,
                   TRY_CAST(frp AS DOUBLE) AS frp,
                   TRY_STRPTIME(acq_date || ' ' || lpad(acq_time, 4, '0'), '%Y-%m-%d %H%M') AS utc,
                   daynight, confidence, coalesce(type, '') AS type
            FROM {rel}""")
    con.execute("CREATE TEMP TABLE det AS " + " UNION ALL ".join(parts))
    n_raw = con.execute("SELECT count(*) FROM det").fetchone()[0]

    raw_days = con.execute("SELECT sensor, CAST(utc AS DATE) AS d FROM det WHERE utc IS NOT NULL "
                           "GROUP BY 1, 2").df()

    west, south, east, north = bbox
    con.execute("""
        CREATE TEMP TABLE kept AS SELECT * FROM det
        WHERE utc IS NOT NULL AND lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180
          AND lon BETWEEN $w AND $e AND lat BETWEEN $s AND $n
          AND ((family = 'modis' AND TRY_CAST(confidence AS INTEGER) >= $mc)
               OR (family = 'viirs' AND lower(left(confidence, 1)) IN (SELECT unnest($vk))))
          AND type IN ('0', '')
    """, {"w": west, "e": east, "s": south, "n": north, "mc": modis_min_conf, "vk": list(viirs_keep)})

    n_no_type = con.execute("SELECT count(*) FROM kept WHERE type = ''").fetchone()[0]
    if n_no_type:  # SD-18: build the static mask from standard rows of every sensor, then drop masked rows
        st = con.execute("SELECT lat, lon FROM det WHERE type IN ('1', '2', '3') AND lat IS NOT NULL").df()
        r8 = pd.Series([h3.latlng_to_cell(a, b, mask_res) for a, b in zip(st["lat"], st["lon"])])
        counts = r8.value_counts()
        mask = set().union(*[h3.grid_disk(c, 1) for c in counts[counts >= 3].index]) if len(counts) else set()
        nt = con.execute("SELECT rowid, lat, lon FROM kept WHERE type = ''").df()
        drop = nt["rowid"][[h3.latlng_to_cell(a, b, mask_res) in mask for a, b in zip(nt["lat"], nt["lon"])]]
        con.register("drop_ids", pd.DataFrame({"rid": drop.to_numpy()}))
        con.execute("DELETE FROM kept WHERE rowid IN (SELECT rid FROM drop_ids)")

    kept = con.execute("""
        SELECT sensor, daynight, lat, lon, frp,
               CAST(utc + to_microseconds(CAST(round(lon / 15.0 * 3600e6) AS BIGINT)) AS DATE) AS local_day
        FROM kept""").df()
    log(f"rows read {n_raw:,}; kept after SD-02 and bbox {len(kept):,}")

    t0 = time.time()
    r6 = np.array([h3.latlng_to_cell(a, b, count_res) for a, b in zip(kept["lat"].to_numpy(),
                                                                      kept["lon"].to_numpy())], dtype=object)
    log(f"h3 res {count_res} for {len(kept):,} rows in {time.time() - t0:.0f} s")
    cells = pd.unique(r6)
    centre = np.array([h3.cell_to_latlng(c) for c in cells]).reshape(-1, 2)
    inside = (centre[:, 0] >= south) & (centre[:, 0] <= north) & (centre[:, 1] >= west) & (centre[:, 1] <= east)
    cell_tab = pd.DataFrame({"h3_r6": cells, "inside": inside,
                             "h3_r5": [h3.cell_to_parent(c, count_res - 1) for c in cells]})
    kept["h3_r6"] = r6
    con.register("kept_df", kept)
    con.register("cell_tab", cell_tab)
    cd = con.execute("""
        SELECT k.sensor, k.local_day, k.daynight, k.h3_r6, c.h3_r5,
               CAST(count(*) AS INTEGER) AS n_det, CAST(sum(k.frp) AS FLOAT) AS frp_sum,
               CAST(max(k.frp) AS FLOAT) AS frp_max
        FROM kept_df k JOIN cell_tab c USING (h3_r6)
        WHERE c.inside
        GROUP BY ALL ORDER BY k.sensor, k.local_day, k.daynight, k.h3_r6""").df()
    con.close()
    cd["local_day"] = pd.to_datetime(cd["local_day"]).dt.date

    raw_days["d"] = pd.to_datetime(raw_days["d"]).dt.date
    have = raw_days.groupby("sensor")["d"].agg(set)
    last_day = max(max(v) for v in have)
    days = [RECORD_START + timedelta(days=i) for i in range((last_day - RECORD_START).days + 1)]
    rows = []
    for sensor in sorted(have.index):
        h = have[sensor]
        first, last = min(h), max(h)
        for d in days:
            reason = "before_start" if d < first else "after_end" if d > last else "ok" if d in h else "no_raw_rows"
            rows.append({"sensor": sensor, "local_day": d, "covered": reason == "ok", "reason": reason})
    return cd[CELLDAY_COLUMNS], pd.DataFrame(rows)


def main(argv=None) -> int:
    repo = Path(__file__).resolve().parents[3]
    sys.path.insert(0, str(repo))
    from pipeline.eyesight import compat

    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--from-raw", required=True, metavar="REGION", choices=sorted(STAND_IN_SOURCES))
    p.add_argument("--data-root", default=None)
    args = p.parse_args(argv)
    compat.set_data_root(args.data_root)
    src = STAND_IN_SOURCES[args.from_raw]
    root = compat.raw_dir(args.from_raw).parents[1]  # the data root
    files = {fam: _files(root, src[fam]) for fam in ("modis", "viirs")}
    print(f"stand-in ingest {args.from_raw}: {sum(len(v) for v in files.values())} files under {root}")
    t0 = time.time()
    cd, cov = celldays_from_files(files, src["bbox"])
    out = compat.grid_dir(args.from_raw)
    compat.write_parquet(cd, out / "celldays.parquet", "celldays")
    compat.write_parquet(cov, out / "coverage.parquet", "coverage")
    (out / "STAND_IN_BY_R4.txt").write_text(
        "celldays.parquet and coverage.parquet here were written by R4's stand-in ingest "
        "(pipeline/eyesight/tests/fabricate.py), not by R2's pipeline.ingest. Re-run ingest to replace them.\n",
        encoding="utf-8")
    print(f"stand-in ingest {args.from_raw}: celldays={len(cd):,} coverage={len(cov):,} -> {out} "
          f"in {time.time() - t0:.0f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
