// Pure layout helpers for the three Methods-page charts (prompt D1, spec §9.7):
// SeasonShiftChart, EyesightCurve, DriftChart. No React, no DOM: everything here is unit-tested.
// No statistics are re-estimated here: slopes, k, curves and ranges all come from the pipeline.

import { median } from "d3";
import { formatDoy } from "./format";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// ---------------------------------------------------------------------------------------
// SeasonShiftChart
// ---------------------------------------------------------------------------------------

/** Days in the reference (non-leap) year used for day-of-year labels across years. */
export const REF_YEAR_DAYS = 365;

/** True when a {value, lo, hi} range lies wholly on one side of zero (SD-13 "clear shift"). */
export function excludesZero(r) {
  if (!r || !isNum(r.lo) || !isNum(r.hi)) return false;
  return r.lo > 0 || r.hi < 0;
}

/** Middle day of a window's peak week; the centre used to unwrap days that cross the year end. */
export function windowCenterDoy(w) {
  if (isNum(w?.peak_week)) return (w.peak_week - 1) * 7 + 4;
  if (isNum(w?.start_week) && isNum(w?.end_week)) {
    const end = w.end_week < w.start_week ? w.end_week + 52 : w.end_week; // circular window
    return wrapDoy(((w.start_week + end) / 2 - 1) * 7 + 4);
  }
  return 183;
}

/**
 * Move a day of year by whole years so it lies within half a year of `center`. A window that
 * crosses 31 December (e.g. start 350, end 20) then plots as one continuous run (350 → 385).
 */
export function unwrapDoy(doy, center) {
  if (!isNum(doy)) return null;
  return doy + REF_YEAR_DAYS * Math.round((center - doy) / REF_YEAR_DAYS);
}

/** An unwrapped day back to a 1..365 day of year. */
export function wrapDoy(doy) {
  return ((((Math.round(doy) - 1) % REF_YEAR_DAYS) + REF_YEAR_DAYS) % REF_YEAR_DAYS) + 1;
}

/**
 * Per-year rows of one window, unwrapped around the window centre. Rows with kind "missing" or
 * without numbers are kept with `missing: true` (drawn hatched, never as a zero-length season).
 */
export function seasonRows(w) {
  const center = windowCenterDoy(w);
  return (w?.by_year ?? [])
    .map((r) => {
      const missing = r.kind === "missing" || !isNum(r.start_doy) || !isNum(r.end_doy);
      if (missing) return { year: r.year, kind: "missing", missing: true };
      const centroid = isNum(r.centroid_doy) ? unwrapDoy(r.centroid_doy, center) : null;
      const start = unwrapDoy(r.start_doy, centroid ?? center);
      let end = unwrapDoy(r.end_doy, centroid ?? center);
      if (end < start) end += REF_YEAR_DAYS;
      return { year: r.year, kind: r.kind, missing: false, start, end, centroid, total: r.total };
    })
    .sort((a, b) => a.year - b.year);
}

/**
 * Theil–Sen line with the pipeline's slope: intercept = median(y − slope·x) (the standard Theil–Sen
 * intercept). Returns the two end points over the years present, or null with fewer than 2 points.
 */
export function theilSenLine(points, slopePerYear) {
  const pts = points.filter((p) => isNum(p.x) && isNum(p.y));
  if (pts.length < 2 || !isNum(slopePerYear)) return null;
  const b = median(pts.map((p) => p.y - slopePerYear * p.x));
  const xs = pts.map((p) => p.x);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  return { x0, y0: b + slopePerYear * x0, x1, y1: b + slopePerYear * x1 };
}

/**
 * Month-start ticks (unwrapped days) inside [lo, hi]. When there are more than `max`, keep every
 * second, third, … month so labels never crowd.
 */
export function doyTicks(lo, hi, max = 6) {
  const starts = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
  const ticks = [];
  for (let k = Math.floor(lo / REF_YEAR_DAYS) - 1; k <= Math.ceil(hi / REF_YEAR_DAYS); k++) {
    for (const s of starts) {
      const d = s + k * REF_YEAR_DAYS;
      if (d >= lo && d <= hi) ticks.push(d);
    }
  }
  if (ticks.length <= max) return ticks;
  const step = Math.ceil(ticks.length / max);
  return ticks.filter((_, i) => i % step === 0);
}

/** "1 Jul"-style label for an unwrapped day. */
export function doyLabel(doy) {
  return formatDoy(wrapDoy(doy));
}

// ---------------------------------------------------------------------------------------
// EyesightCurve
// ---------------------------------------------------------------------------------------

/** x domain of the eyesight chart, FRP in MW (prompt D1). */
export const FRP_DOMAIN = [0.5, 2000];

/** The ceiling c (0..1) as a whole percent, or null. */
export function ceilingPercent(c) {
  return isNum(c) ? Math.round(c * 100) : null;
}

/** Radius for a binned point: area proportional to n, between rMin and rMax. */
export function binRadius(n, maxN, rMin = 2.5, rMax = 9) {
  if (!isNum(n) || n <= 0 || !isNum(maxN) || maxN <= 0) return rMin;
  return rMin + (rMax - rMin) * Math.sqrt(Math.min(n, maxN) / maxN);
}

/** Curve points with finite numbers, sorted by FRP (for the line and the band). */
export function cleanCurve(curve) {
  return (curve ?? [])
    .filter((p) => isNum(p.frp_mw) && p.frp_mw > 0 && isNum(p.p))
    .sort((a, b) => a.frp_mw - b.frp_mw);
}

// ---------------------------------------------------------------------------------------
// DriftChart
// ---------------------------------------------------------------------------------------

/** Year of an ISO date ("2022-12-31" → 2022), or null. */
export function yearOfIso(iso) {
  const y = Number(String(iso ?? "").slice(0, 4));
  return Number.isInteger(y) && y > 0 ? y : null;
}

/**
 * The trusted-period summary for one sensor's rows: the mean of k, lo and hi over the years up to
 * and including `trustedYear` (for S-NPP this is the 2013–2022 fit window). Missing years excluded.
 */
export function trustedMean(rows, trustedYear) {
  const fit = rows.filter((r) => isNum(r.k_annual) && (trustedYear === null || r.year <= trustedYear));
  if (fit.length === 0) return null;
  const mean = (key) => {
    const v = fit.map((r) => r[key]).filter(isNum);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  return {
    k: mean("k_annual"),
    lo: mean("lo"),
    hi: mean("hi"),
    from: Math.min(...fit.map((r) => r.year)),
    to: Math.max(...fit.map((r) => r.year)),
    n: fit.length,
  };
}

/** y domain covering every k, lo, hi and the mean band, padded by 10 % of the span. */
export function driftDomain(rows, bands) {
  const v = [];
  for (const r of rows) for (const k of ["k_annual", "lo", "hi"]) if (isNum(r[k])) v.push(r[k]);
  for (const b of bands) if (b) for (const k of ["k", "lo", "hi"]) if (isNum(b[k])) v.push(b[k]);
  if (v.length === 0) return [0, 1];
  let lo = Math.min(...v);
  let hi = Math.max(...v);
  const pad = hi > lo ? (hi - lo) * 0.1 : Math.max(Math.abs(hi) * 0.1, 0.05);
  lo = Math.max(0, lo - pad);
  hi += pad;
  return [lo, hi];
}
