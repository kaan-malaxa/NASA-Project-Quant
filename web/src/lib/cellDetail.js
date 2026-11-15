import { seriesForLens } from "./lenses.js";

/**
 * Detail for one selected calendar cell (week or month of a year) under a lens.
 * Percentile = this value among the same week/month in the other baseline years, via the injected
 * percentileRank (R6's SD-11 helper from "@/viz"); missing values are excluded, never treated as zero.
 * @param {{ rows: object[] }} table weekly.json or monthly.json
 * @param {{ year: number, week?: number, month?: number }} cell
 * @param {string} lens
 * @param {number[]} baselineYears [first, last]
 * @param {((value: number, others: number[]) => number) | undefined} percentileRank
 */
export function cellDetail(table, cell, lens, baselineYears, percentileRank) {
  const grain = cell.week != null ? "week" : "month";
  const slot = cell[grain];
  const pick = (year) =>
    (table?.rows || []).find((r) => r.year === year && r[grain] === slot && r.series === seriesForLens(lens, year));

  const row = pick(cell.year);
  const value = row?.value ?? null;
  const [y0, y1] = baselineYears || [];
  let percentile = null;
  let nOthers = 0;
  if (value !== null && row?.kind !== "missing" && y0 != null && typeof percentileRank === "function") {
    const others = [];
    for (let y = y0; y <= y1; y++) {
      if (y === cell.year) continue;
      const r = pick(y);
      if (r && r.value !== null && r.kind !== "missing") others.push(r.value);
    }
    nOthers = others.length;
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
  };
}
