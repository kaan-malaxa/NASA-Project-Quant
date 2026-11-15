import { seriesForLens } from "./lenses.js";
import { isLowActivity, lensActivityThreshold } from "../viz/cellStyle.js";
import { quantile } from "d3";

/**
 * Detail for one selected calendar cell (week or month of a year) under a lens.
 * Percentile = this value among the same week/month in the other baseline years, via the injected
 * percentileRank (R6's SD-11 helper from "@/viz"); missing values are excluded, never treated as zero.
 * @param {import("../data/types").SeriesJson & {baseline_rows?: import("../data/types").SeriesRow[], configuration?: any, calibration?: any}} table weekly.json or monthly.json
 * @param {{ year: number, week?: number, month?: number }} cell
 * @param {string} lens
 * @param {number[]} baselineYears [first, last]
 * @param {((value: number, others: number[]) => number) | undefined} percentileRank
 */
export function cellDetail(table, cell, lens, baselineYears, percentileRank) {
  const grain = cell.week != null ? "week" : "month";
  const slot = cell[grain];
  const pick = (year) =>
    (table?.baseline_rows || table?.rows || []).find((r) => r.year === year && r[grain] === slot && r.series === seriesForLens(lens, year));

  const row = pick(cell.year);
  const value = row?.value ?? null;
  const [y0, y1] = baselineYears || [];
  let percentile = null;
  let nOthers = 0;
  let unranked = false;
  if (value !== null && row?.kind !== "missing" && y0 != null && typeof percentileRank === "function") {
    const others = [];
    for (let y = y0; y <= y1; y++) {

      const r = pick(y);
      if (r && r.value !== null && r.kind !== "missing") others.push(r.value);
    }
    nOthers = others.length;
    unranked = isLowActivity(value, quantile(others, 0.9), lensActivityThreshold({grain, period:slot,
      year:cell.year, lens, source:row?.source, configuration:table.configuration, calibration:table.calibration}));
    if (nOthers) percentile = percentileRank(value, others);
  }

  return {
    grain,
    slot,
    year: cell.year,
    series: seriesForLens(lens, cell.year),
    value,
    lo: row?.lo ?? null,
    hi: row?.hi ?? null,
    kind: row ? (value === null ? "missing" : row.kind) : "missing",
    source: row?.source ?? null,
    percentile,
    nOthers,
    unranked,
  };
}
