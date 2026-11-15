"""Print a processed-data profile and a labeled local-source fallback."""
import sys
from datetime import UTC, datetime

import duckdb
import numpy as np
import pandas as pd

from pipeline.common import cli, config, io, paths, sensors, timebins

SENSORS = ("aqua", "terra", "snpp", "noaa20")


def daily_summary(frame):
    """Aggregate observations without filtering, filling missing days, or mixing sensors."""
    required = {"sensor", "local_day", "product"}
    if not required <= set(frame):
        raise ValueError("Profile input requires sensor, local_day and product")
    if frame[list(required)].isna().any().any():
        raise ValueError("Cannot profile observations without sensor, local_day or product")
    if not set(frame.sensor) <= set(SENSORS):
        raise ValueError("Unexpected sensor in profile input")
    if not set(frame["product"]) <= {"SP", "NRT"}:
        raise ValueError("Unexpected product in profile input")
    work = frame[list(required)].copy()
    work["nrt"] = work["product"].eq("NRT").astype("int64")
    return work.groupby(["sensor", "local_day"], as_index=False).agg(
        rows=("sensor", "size"), nrt_rows=("nrt", "sum"),
    )


def source_summary():
    """Inspect only original local US CSVs; source observations remain unfiltered."""
    inputs = paths.source_country_files()
    if not inputs:
        raise FileNotFoundError(f"No local US CSVs found in {paths.source_data_root()}")
    daily, files = [], []
    with duckdb.connect() as connection:
        paths.tmp_dir().mkdir(parents=True, exist_ok=True)
        connection.execute("SET memory_limit = '4GB'")
        connection.execute("SET temp_directory = ?", [str(paths.tmp_dir())])
        for product, path in inputs:
            relation = connection.read_csv(str(path), header=True, all_varchar=True)
            required = {"satellite", "longitude", "acq_date", "acq_time", "version"}
            if not required <= set(relation.columns):
                raise ValueError(f"Missing profile source columns: {path.name}")
            columns = "satellite, longitude, acq_date, acq_time, version"
            columns += ", type" if "type" in relation.columns else ""
            frame = relation.project(columns).df()
            files.append((path, path.stat().st_size))
            if frame.empty:
                continue
            family = "modis" if product == "modis" else "viirs"
            aliases = {value: sensors.normalise_sensor(value, family) for value in frame.satellite.unique()}
            frame["sensor"] = frame.satellite.map(aliases)
            longitude = pd.to_numeric(frame.longitude, errors="raise")
            if not np.isfinite(longitude).all() or not longitude.between(-180, 180).all():
                raise ValueError(f"Invalid source longitude: {path.name}")
            times = frame.acq_time.fillna("").str.zfill(4)
            timestamps = pd.to_datetime(
                frame.acq_date + " " + times.where(times.str.fullmatch(r"\d{4}")),
                format="%Y-%m-%d %H%M", errors="raise",
            )
            if timestamps.isna().any():
                raise ValueError(f"Invalid source acquisition date/time: {path.name}")
            frame["local_day"] = timebins.local_day(timestamps, longitude)
            missing_type = frame["type"].isna() if "type" in frame else pd.Series(True, index=frame.index)
            frame["product"] = np.where(
                frame.version.fillna("").str.contains("NRT", case=False) | missing_type, "NRT", "SP",
            )
            daily.append(daily_summary(frame))
    combined = (
        pd.concat(daily).groupby(["sensor", "local_day"], as_index=False)[["rows", "nrt_rows"]].sum()
        if daily else pd.DataFrame(columns=["sensor", "local_day", "rows", "nrt_rows"])
    )
    return combined, files


def summarise(daily, min_n20_days=300):
    """The requested reporting criterion is >=300 distinct local days, not elapsed days."""
    frame = daily.copy()
    frame["year"] = pd.to_datetime(frame.local_day).dt.year
    annual = frame.groupby(["sensor", "year"], as_index=False)[["rows", "nrt_rows"]].sum()
    bounds = frame.groupby("sensor").local_day.agg(["min", "max"])
    n20 = frame.loc[frame.sensor.eq("noaa20")].groupby("year").local_day.nunique()
    qualifying = n20[n20 >= min_n20_days]
    return annual, bounds, n20, int(qualifying.index.min()) if len(qualifying) else None


def peak_aqua_week(cells, covered):
    aqua = cells.loc[cells.sensor.eq("aqua") & cells.daynight.eq("D")]
    days = aqua.groupby("local_day").h3_r6.nunique()
    frame = covered.loc[covered.sensor.eq("aqua"), ["local_day", "covered"]].copy()
    frame["value"] = frame.local_day.map(days).fillna(0).astype(float)
    frame.loc[~frame.covered, "value"] = np.nan
    weekly = timebins.aggregate(frame, "week", value_cols=("value",))
    usable = weekly.loc[~weekly.missing]
    if usable.empty:
        return None
    row = usable.sort_values(["value", "year", "week"], ascending=[False, True, True]).iloc[0]
    return int(row.year), int(row.week), float(row.value)


def render_summary(daily):
    annual, bounds, n20, first = summarise(daily)
    lines = ["| Sensor | First local_day | Last local_day |", "|---|---|---|"]
    for sensor in SENSORS:
        if sensor in bounds.index:
            lines.append(f"| {sensor} | {bounds.loc[sensor, 'min']} | {bounds.loc[sensor, 'max']} |")
        else:
            lines.append(f"| {sensor} | unavailable | unavailable |")
    lines += ["", "Rows per sensor/year; each entry is rows (NRT share). Years use local solar dates.",
              "", "| Year | aqua | terra | snpp | noaa20 |", "|---|---:|---:|---:|---:|"]
    values = {(row.sensor, row.year): row for row in annual.itertuples()}
    for year in sorted(annual.year.unique()):
        entries = []
        for sensor in SENSORS:
            row = values.get((sensor, year))
            entries.append(f"{row.rows} ({100 * row.nrt_rows / row.rows:.3f}%)" if row is not None else "unavailable")
        lines.append("| " + str(year) + " | " + " | ".join(entries) + " |")
    lines += ["", f"n20_first_full_year: {first if first is not None else 'unavailable'}",
              "Criterion: NOAA-20 detections on >=300 distinct local days in a calendar year.",
              "", "| NOAA-20 year | Distinct local days |", "|---|---:|"]
    for year, count in n20.items():
        lines.append(f"| {year} | {count} |")
    return lines


def build_report(region):
    config.get_region(region)
    lines = ["# US data profile", "", f"Generated at: {datetime.now(UTC).isoformat()}",
             f"Code version: {io.code_version()}", ""]
    clean_paths = [paths.detections(region, sensor) for sensor in SENSORS]
    available = [path for path in clean_paths if path.is_file()]
    files = []
    if len(available) == len(clean_paths):
        frames = [io.read_parquet(path, "detections") for path in clean_paths]
        daily = daily_summary(pd.concat(frames, ignore_index=True))
        lines += ["Basis: cleaned detections; all sensor files are present.",
                  "Scope is the existing cleaning outputs, which may cover only a staged subset of the archive.", "",
                  *render_summary(daily)]
        files += [(path, path.stat().st_size) for path in clean_paths]
    else:
        lines += ["Processed-data profile: unavailable (complete cleaning outputs are absent).",
                  "The following is a PROVISIONAL, UNFILTERED source inventory, not validated calibration input.",
                  "It includes all local source years and detections outside the counting polygon.",
                  "These records have not passed SD-02, deduplication, or the static mask.",
                  "R3 must confirm n20_first_full_year after clean/grid succeeds.", "",
                  "Source directory: NASA-Project-Quant/data/", ""]
        daily, source_files = source_summary()
        files += source_files
        lines += render_summary(daily)
        if available:
            lines += ["", "Partial cleaning outputs exist but were not mixed with raw source observations."]
    for path in sorted(paths.raw_dir(region).glob("*.csv")):
        files.append((path, path.stat().st_size))
    coverage_path, cells_path, members_path = paths.coverage(region), paths.celldays(region), paths.region_cells(region)
    lines += ["", "## Grid and coverage", ""]
    covered = None
    if coverage_path.is_file():
        covered = io.read_parquet(coverage_path, "coverage")
        reasons = covered.loc[~covered.covered].groupby(["sensor", "reason"]).size()
        lines += ["| Sensor | Uncovered reason | Days |", "|---|---|---:|"]
        for (sensor, reason), count in reasons.items():
            lines.append(f"| {sensor} | {reason} | {count} |")
        if reasons.empty:
            lines.append("No uncovered days in the coverage file.")
    else:
        lines.append("Uncovered days per sensor/reason: unavailable (coverage.parquet is missing).")
    if members_path.is_file():
        members = io.read_parquet(members_path, "region_cells")
        lines.append(f"Region cells: {len(members)}; membership: {members.attrs['membership']}.")
    else:
        lines.append("Region cells: unavailable (region_cells.parquet is missing).")
    if cells_path.is_file() and covered is not None:
        if not paths.config_file("science.yaml").is_file():
            lines.append("Peak Aqua week: unavailable (science.yaml is missing; weekly coverage thresholds required).")
        else:
            peak = peak_aqua_week(io.read_parquet(cells_path, "celldays"), covered)
            lines.append(
                f"Peak Aqua daytime week: year={peak[0]}, week={peak[1]}, fire cell-days per 7 days={peak[2]:.3f}."
                if peak else "Peak Aqua week: unavailable (no adequately covered Aqua weeks)."
            )
    else:
        lines.append("Peak Aqua week: unavailable (cell-day and/or coverage output is missing).")
    for path in (coverage_path, cells_path, members_path):
        if path.is_file():
            files.append((path, path.stat().st_size))
    lines += ["", "## File sizes", "", "| File | Bytes |", "|---|---:|"]
    for path, size in sorted(dict(files).items(), key=lambda item: str(item[0])):
        label = (
            "../data/" + path.relative_to(paths.source_data_root()).as_posix()
            if path.is_relative_to(paths.source_data_root()) else path.relative_to(paths.data_root()).as_posix()
        )
        lines.append(f"| {label} | {size} |")
    return "\n".join(lines) + "\n"


def main(argv=None):
    parser = cli.stage_parser("ingest.profile")
    args = parser.parse_args(argv)
    try:
        region = args.region or "us"
        report = build_report(region)
        destination = paths.profile_report(region)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("w", encoding="utf-8", newline="\n") as handle:
            handle.write(report)
        print(report, end="")
        return 0
    except (OSError, ValueError, KeyError, duckdb.Error) as error:
        print(f"FAIL profile: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
