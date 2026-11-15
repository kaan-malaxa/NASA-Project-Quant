"""Local US country exports -> the exact gridded inputs consumed by R3.

No network sources, bounding-box guesses, other regions or synthetic inputs
are used. Country membership comes from the supplied FIRMS US exports; there
is no local US polygon from which to manufacture a region-cell denominator.
"""

from datetime import datetime, timezone
from pathlib import Path

import h3
import pandas as pd

from pipeline.common import config, io, paths, sensors, timebins


def _coverage(raw_counts, end, science):
    days = pd.date_range(science["eras"]["record_start"], end)
    result = []
    for sensor in ("aqua", "terra", "snpp", "noaa20"):
        raw = raw_counts.loc[raw_counts["sensor"].eq(sensor)].copy()
        raw["utc_date"] = pd.to_datetime(raw["utc_date"])
        counts = raw.set_index("utc_date")["n_raw_rows"].reindex(days, fill_value=0)
        first = pd.Timestamp(science["eras"]["snpp_first_day"]) if sensor == "snpp" else raw["utc_date"].min()
        last = raw["utc_date"].max()
        reasons = pd.Series("ok", index=days)
        reasons.loc[counts.eq(0)] = "no_raw_rows"
        for outage in config.load_outages():
            if outage["sensor"] == sensor:
                stop = pd.Timestamp(outage["end"]) if outage["end"] else days[-1]
                reasons.loc[(days >= pd.Timestamp(outage["start"])) & (days <= stop)] = "outage_list"
        if pd.isna(first):
            reasons[:] = "before_start"
        else:
            reasons.loc[days < first] = "before_start"
            reasons.loc[days > last] = "after_end"
        result.append(
            pd.DataFrame(
                {
                    "sensor": sensor,
                    "local_day": days.date,
                    "covered": reasons.eq("ok").to_numpy(),
                    "reason": reasons.to_numpy(),
                }
            )
        )
    return pd.concat(result, ignore_index=True)


def ingest_us(region):
    """Build all three R3 inputs and attest their exact local US source hashes."""
    config.get_region(region)
    science = config.load_science()
    config_hashes = {name: io.sha256(paths.config_file(name)) for name in ("science.yaml", "outages.yaml")}
    initial = io.source_inventory()
    log = []
    with io.us_database() as con:
        io.register_us_csvs(con)
        alias_rows = [
            (family, key, value)
            for family, mapping in (("modis", sensors.MODIS_ALIASES), ("viirs", sensors.VIIRS_ALIASES))
            for key, value in mapping.items()
        ]
        con.register("aliases", pd.DataFrame(alias_rows, columns=["family", "raw", "sensor"]))
        print("Reading local United States exports", flush=True)
        con.execute("""CREATE TABLE raw AS
            SELECT data.*, aliases.sensor,
                try_cast(latitude AS DOUBLE) AS lat, try_cast(longitude AS DOUBLE) AS lon,
                try_strptime(acq_date || lpad(acq_time, 4, '0'), '%Y-%m-%d%H%M') AS utc_time,
                try_cast(frp AS FLOAT) AS frp_value, try_cast(type AS INTEGER) AS type_value
            FROM us_csvs data LEFT JOIN aliases
            ON data.family=aliases.family AND lower(trim(satellite))=aliases.raw""")
        unknown = con.execute(
            "SELECT DISTINCT satellite, instrument, file_family FROM raw WHERE sensor IS NULL OR (family='modis' AND lower(instrument)<>'modis') OR (family='viirs' AND lower(instrument)<>'viirs') OR (file_family<>'modis' AND sensor<>file_family)"
        ).fetchall()
        if unknown:
            raise ValueError(f"Unexpected satellite/instrument in US files: {unknown}")
        wrong_year = con.execute(
            "SELECT DISTINCT filename FROM raw WHERE utc_time IS NOT NULL AND year(utc_time)<>try_cast(regexp_extract(filename, '_([0-9]{4})_United_States.csv$', 1) AS INTEGER)"
        ).fetchall()
        if wrong_year:
            raise ValueError(f"US CSV acquisition year does not match its filename: {wrong_year}")
        unknown_confidence = con.execute(
            "SELECT DISTINCT confidence FROM raw WHERE family='viirs' AND lower(left(confidence,1)) NOT IN ('l','n','h')"
        ).fetchall()
        if unknown_confidence:
            raise ValueError(f"Unexpected VIIRS confidence: {unknown_confidence}")
        n_raw = con.execute("SELECT count(*) FROM raw").fetchone()[0]
        raw_counts = con.execute(
            "SELECT sensor, CAST(utc_time AS DATE) utc_date, count(*) n_raw_rows FROM raw WHERE utc_time IS NOT NULL GROUP BY sensor, utc_date ORDER BY sensor, utc_date"
        ).fetchdf()
        raw_counts["utc_date"] = pd.to_datetime(raw_counts["utc_date"]).dt.date
        con.create_function("solar_day", timebins.local_day, ["TIMESTAMP", "DOUBLE"], "DATE")
        con.execute("""CREATE TABLE valid AS SELECT *, solar_day(utc_time,lon) AS local_day
            FROM raw WHERE lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180 AND utc_time IS NOT NULL
            AND daynight IN ('D','N')
            QUALIFY row_number() OVER (PARTITION BY sensor,lat,lon,utc_time ORDER BY filename)=1""")
        n_valid = con.execute("SELECT count(*) FROM valid").fetchone()[0]
        log.append(
            {
                "sensor": "all",
                "step": "valid_coordinates_date_and_duplicates",
                "rows_in": n_raw,
                "rows_dropped": n_raw - n_valid,
            }
        )
        end = con.execute("SELECT max(local_day) FROM valid").fetchone()[0]
        if end is None:
            raise ValueError("The local US exports contain no valid detections")
        con.execute(
            "CREATE TABLE record AS SELECT * FROM valid WHERE local_day >= CAST(? AS DATE)",
            [science["eras"]["record_start"]],
        )
        resolutions = science["grid"]
        con.create_function(
            "count_cell",
            lambda lat, lon: h3.latlng_to_cell(lat, lon, resolutions["count_res"]),
            ["DOUBLE", "DOUBLE"],
            "VARCHAR",
        )
        con.create_function(
            "mask_cell",
            lambda lat, lon: h3.latlng_to_cell(lat, lon, resolutions["mask_res"]),
            ["DOUBLE", "DOUBLE"],
            "VARCHAR",
        )
        con.create_function(
            "map_parent", lambda cell: h3.cell_to_parent(cell, resolutions["map_res"]), ["VARCHAR"], "VARCHAR"
        )
        print("Building the US static-source mask and filtering detections", flush=True)
        static = con.execute(
            "SELECT mask_cell(lat,lon) h3_r8, count(*) n_static FROM record WHERE type_value IN (SELECT unnest(?)) GROUP BY h3_r8 HAVING count(*) >= ?",
            [science["static_mask"]["types"], science["static_mask"]["min_static_detections"]],
        ).fetchdf()
        mask = sorted(
            {
                neighbor
                for cell in static["h3_r8"]
                for neighbor in h3.grid_disk(cell, science["static_mask"]["dilate_rings"])
            }
        )
        con.register("static_mask", pd.DataFrame({"h3_r8": pd.Series(mask, dtype=str)}))
        n_record = con.execute("SELECT count(*) FROM record").fetchone()[0]
        con.execute(
            "CREATE TABLE typed AS SELECT * FROM record WHERE type_value=? OR type_value IS NULL",
            [science["filters"]["keep_type"]],
        )
        n_typed = con.execute("SELECT count(*) FROM typed").fetchone()[0]
        log.append({"sensor": "all", "step": "type", "rows_in": n_record, "rows_dropped": n_record - n_typed})
        con.execute(
            """CREATE TABLE confident AS SELECT * FROM typed
            WHERE (family='modis' AND try_cast(confidence AS DOUBLE)>=?)
            OR (family='viirs' AND lower(left(confidence,1)) IN (SELECT unnest(?)))""",
            [science["filters"]["modis_min_confidence"], science["filters"]["viirs_keep"]],
        )
        n_confident = con.execute("SELECT count(*) FROM confident").fetchone()[0]
        log.append(
            {"sensor": "all", "step": "confidence", "rows_in": n_typed, "rows_dropped": n_typed - n_confident}
        )
        con.execute("""CREATE TABLE cleaned AS SELECT * FROM confident
            WHERE type_value IS NOT NULL OR NOT EXISTS
            (SELECT 1 FROM static_mask m WHERE m.h3_r8=mask_cell(confident.lat,confident.lon))""")
        n_cleaned = con.execute("SELECT count(*) FROM cleaned").fetchone()[0]
        log.append(
            {
                "sensor": "all",
                "step": "static_mask_for_missing_type",
                "rows_in": n_confident,
                "rows_dropped": n_confident - n_cleaned,
            }
        )
        print(f"Gridding {n_cleaned} filtered US detections", flush=True)
        con.execute("CREATE TABLE cells AS SELECT *, count_cell(lat,lon) h3_r6 FROM cleaned")
        celldays = con.execute("""SELECT sensor,local_day,daynight,h3_r6,map_parent(h3_r6) h3_r5,
            CAST(count(*) AS INTEGER) n_det, CAST(sum(frp_value) AS FLOAT) frp_sum, max(frp_value) frp_max
            FROM cells GROUP BY sensor,local_day,daynight,h3_r6 ORDER BY sensor,local_day,daynight,h3_r6""").fetchdf()
        hotspots = con.execute(
            "SELECT sensor,local_day,CAST(count(*) AS INTEGER) n_det_all FROM cleaned GROUP BY sensor,local_day ORDER BY sensor,local_day"
        ).fetchdf()
        profile = con.execute(
            "SELECT filename,count(*) n_rows,min(CAST(utc_time AS DATE)) first_date,max(CAST(utc_time AS DATE)) last_date FROM raw GROUP BY filename ORDER BY filename"
        ).fetchall()
    for frame in (celldays, hotspots):
        frame["local_day"] = pd.to_datetime(frame["local_day"]).dt.date
    coverage = _coverage(raw_counts, end, science)
    outputs = [
        (celldays, paths.celldays(region), "celldays"),
        (coverage, paths.coverage(region), "coverage"),
        (hotspots, paths.grid_dir(region) / "hotspot_counts_daily.parquet", "hotspot_counts_daily"),
        (raw_counts, paths.clean_dir(region) / "raw_daily_counts.parquet", "raw_daily_counts"),
        (pd.DataFrame({"h3_r8": mask}), paths.grid_dir(region) / "static_mask.parquet", "static_mask"),
    ]
    for frame, path, name in outputs:
        io.write_parquet(frame, path, name)
    io.write_json(log, paths.clean_dir(region) / "filter_log.json")
    inventory = io.source_inventory()
    if inventory != initial:
        raise ValueError("US input files changed during ingestion; outputs were not attested")
    if config_hashes != {name: io.sha256(paths.config_file(name)) for name in config_hashes}:
        raise ValueError("Ingestion configuration changed during processing; outputs were not attested")
    by_name = {entry["file"]: entry for entry in inventory}
    manifest = []
    for filename, rows, first, last in profile:
        key = Path(filename).relative_to(paths.source_root()).as_posix()
        manifest.append(
            {
                "file": key,
                "source": "NASA FIRMS United States country CSV",
                "via": "local_country_csv",
                "downloaded_at": None,
                "rows": rows,
                "sha256": by_name[key]["sha256"],
                "first_date": first.isoformat() if first else None,
                "last_date": last.isoformat() if last else None,
            }
        )
    io.write_json(manifest, paths.raw_dir(region) / "MANIFEST.json")
    io.write_json(
        {
            "schema_version": "1.0",
            "region": region,
            "source_files": inventory,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "membership": "US country-export records; no polygon supplied",
            "config_sha256": config_hashes,
            "outputs": [
                {"file": path.relative_to(paths.data_root()).as_posix(), "sha256": io.sha256(path)}
                for _, path, _ in outputs
            ],
        },
        paths.provenance(region),
    )
    return len(celldays)
