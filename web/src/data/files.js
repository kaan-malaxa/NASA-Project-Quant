/**
 * Per-region files (contracts 6.1 `files` / `optional_files`) and where each lives under data/{region}/.
 * CSV files are not fetched up front; they are loaded lazily through csv.js.
 */
export const REGION_FILES = {
  period_index: "period_index.json",
  spatial_index: "spatial_index.json",
  weekly: "weekly.json",
  monthly: "monthly.json",
  daily: "daily.json",
  climatology: "climatology.json",
  season: "season.json",
  trend: "trend.json",
  ruler: "ruler.json",
  nowcast: "nowcast.json",
  hex: "hex.json",
  calibration: "calibration.json",
  outline: "outline.geojson",
  downloads: "downloads.json",
  cells_monthly: "cells_monthly.csv",
  hotspots_recent: "hotspots_recent.csv",
};

export const LAZY_FILES = new Set(["cells_monthly", "hotspots_recent"]);

export function regionFilePath(regionId, name) {
  return `${regionId}/${REGION_FILES[name]}`;
}
