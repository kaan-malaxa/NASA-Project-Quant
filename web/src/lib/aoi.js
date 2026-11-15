/** Area summaries aggregate authoritative Python contributions. Raw CSVs remain download artifacts. */
import { cellArea } from "h3-js";
export { spatialAreaSeries as areaSeries } from "./spatial.js";

/** Linear-interpolated quantile (same rule as SD-10) of an already sorted array. */
export function quantile(sorted, p) {
  if (!sorted.length) return null;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (h - lo);
}

/** Per calendar month: min, p10, p25, p50, p75, p90, max, n_years over the baseline years (missing excluded). */
export function areaClimatology(series, baselineYears) {
  const [y0, y1] = baselineYears;
  return Array.from({ length: 12 }, (_, i) => {
    const vals = series
      .filter((s) => s.month === i + 1 && s.year >= y0 && s.year <= y1 && s.value !== null)
      .map((s) => s.value)
      .sort((a, b) => a - b);
    const q = (p) => quantile(vals, p);
    return { month: i + 1, min: vals[0] ?? null, p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9), max: vals.at(-1) ?? null, n_years: vals.length };
  });
}

/** The latest non-missing month and its ratio to that calendar month's baseline median (null when median is 0). */
export function latestRatio(series, climatologyMonths) {
  const last = [...series].reverse().find((s) => s.value !== null);
  if (!last) return null;
  const median = climatologyMonths[last.month - 1]?.p50 ?? null;
  return { ...last, median, ratio: median ? last.value / median : null };
}

/** Year x month table: { years: [..], values: { [year]: (number|null)[12] } }. */
export function monthTable(series) {
  const values = {};
  for (const s of series) {
    values[s.year] ??= Array(12).fill(null);
    values[s.year][s.month - 1] = s.value;
  }
  return { years: Object.keys(values).map(Number).sort((a, b) => a - b), values };
}

/** Top months by value inside a date range (non-missing only). */
export function topMonths(series, range, n = 5) {
  const from = range.from.slice(0, 7);
  const to = range.to.slice(0, 7);
  return series
    .filter((s) => s.value !== null)
    .filter((s) => {
      const ym = `${s.year}-${String(s.month).padStart(2, "0")}`;
      return ym >= from && ym <= to;
    })
    .sort((a, b) => b.value - a.value || a.year - b.year || a.month - b.month)
    .slice(0, n);
}

/** The area series as a monthly.json-shaped object, so CalendarHeatmap can draw it (grain "month"). */
export function toMonthlyJson(series, base, lens = "harmonized", unit = "Aqua-equivalent fire cell-days per month") {
  return {
    schema_version: base?.schema_version ?? "1.0",
    generated_at: base?.generated_at,
    code_version: base?.code_version,
    region: base?.region,
    series_meta: { [lens]: { label: "Your area", unit } },
    rows: series.map((s) => ({ ...s, series: lens })),
  };
}

/** Total area of res-5 cells in km² (h3-js exact cell areas). */
export function areaKm2(cells) {
  let total = 0;
  for (const c of cells) total += cellArea(c, "km2");
  return total;
}
