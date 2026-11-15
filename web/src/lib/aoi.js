/**
 * Area-of-interest lens (contracts 6.11, 6.12; SD-05, SD-06, SD-07). Pure; no DOM.
 * Monthly harmonized series for a set of res-5 cells:
 *   months in an Aqua era   -> Aqua fire cell-days (lo = hi = value)
 *   months in a VIIRS era   -> primary-VIIRS fire cell-days x that sensor's monthly k (lo / hi from k lo / hi)
 * Eras and k come from calibration.json. Monthly and VIIRS counts are never added together.
 */
import { cellArea } from "h3-js";

const ymKey = (year, month) => `${year}${String(month).padStart(2, "0")}`;

/** Sum the CSV rows (h3_r5, ym, aqua, viirs) over the selected cells, per month. */
export function aggregateCells(rows, cells) {
  const want = cells instanceof Set ? cells : new Set(cells);
  const out = new Map();
  for (const r of rows) {
    if (!want.has(r.h3_r5)) continue;
    const key = String(r.ym);
    const acc = out.get(key) ?? { aqua: 0, viirs: 0 };
    acc.aqua += Number(r.aqua) || 0;
    acc.viirs += Number(r.viirs) || 0;
    out.set(key, acc);
  }
  return out;
}

/** The calibration era that contains the first day of a month, or null. */
export function eraFor(calibration, year, month) {
  const d = `${year}-${String(month).padStart(2, "0")}-01`;
  return (calibration.eras || []).find((e) => e.from <= d && (e.to === null || e.to === undefined || d <= e.to)) ?? null;
}

/** Monthly k for a sensor ({k, lo, hi}); falls back to the annual k when the month has no entry. */
export function kFor(calibration, sensor, month) {
  const m = (calibration.k?.[sensor] || []).find((x) => x.month === month);
  if (m) return { k: m.k, lo: m.lo, hi: m.hi };
  const a = calibration.k_annual?.[sensor];
  return a ? { k: a.k, lo: a.lo, hi: a.hi } : null;
}

/** Months to compute: from the region's monthly.json harmonized rows (keeps its missing marks), else from the CSV. */
export function monthList(regionMonthly, rows) {
  const h = (regionMonthly?.rows || []).filter((r) => r.series === "harmonized");
  if (h.length) {
    return h
      .map((r) => ({ year: r.year, month: r.month, missing: r.value === null || r.kind === "missing" }))
      .sort((a, b) => a.year - b.year || a.month - b.month);
  }
  const yms = [...new Set(rows.map((r) => String(r.ym)))].sort();
  if (!yms.length) return [];
  const out = [];
  let y = Number(yms[0].slice(0, 4));
  let m = Number(yms[0].slice(4, 6));
  const last = yms.at(-1);
  while (ymKey(y, m) <= last) {
    out.push({ year: y, month: m, missing: false });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/**
 * @param {{ rows: object[], calibration: object, cells: string[] | Set<string>, regionMonthly?: object }} input
 * @returns {{ year, month, value, lo, hi, kind, source }[]}
 */
export function areaSeries({ rows, calibration, cells, regionMonthly }) {
  const sums = aggregateCells(rows, cells);
  const out = [];
  for (const { year, month, missing } of monthList(regionMonthly, rows)) {
    const era = eraFor(calibration, year, month);
    if (missing || !era) {
      out.push({ year, month, value: null, lo: null, hi: null, kind: "missing", source: null });
      continue;
    }
    const s = sums.get(ymKey(year, month)) ?? { aqua: 0, viirs: 0 }; // CSV omits rows where both are zero
    if (era.source === "aqua") {
      out.push({ year, month, value: s.aqua, lo: s.aqua, hi: s.aqua, kind: era.kind, source: "aqua" });
      continue;
    }
    const k = kFor(calibration, era.source, month);
    if (!k) {
      out.push({ year, month, value: null, lo: null, hi: null, kind: "missing", source: null });
      continue;
    }
    out.push({ year, month, value: s.viirs * k.k, lo: s.viirs * k.lo, hi: s.viirs * k.hi, kind: era.kind, source: era.source });
  }
  return out;
}

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
export function toMonthlyJson(series, base) {
  return {
    schema_version: base?.schema_version ?? "1.0",
    generated_at: base?.generated_at,
    code_version: base?.code_version,
    region: base?.region,
    series_meta: { harmonized: { label: "Your area", unit: "Aqua-equivalent fire cell-days per month" } },
    rows: series.map((s) => ({ ...s, series: "harmonized" })),
  };
}

/** Total area of res-5 cells in km² (h3-js exact cell areas). */
export function areaKm2(cells) {
  let total = 0;
  for (const c of cells) total += cellArea(c, "km2");
  return total;
}
