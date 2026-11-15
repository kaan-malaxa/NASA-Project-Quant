// Pure helpers for the small components (TrendBars, PercentileStrip, Legend). No React, no DOM.
// Unit-tested in __tests__/small.test.js.

import { percentileRank } from "./percentile";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// ---- TrendBars ------------------------------------------------------------------------------

/**
 * True when a trend's range includes zero (spec §9.6: drawn neutral, "no clear change").
 * @param {{pct_per_decade: number, lo: number, hi: number} | undefined} t
 */
export function crossesZero(t) {
  return !!t && isNum(t.lo) && isNum(t.hi) && t.lo <= 0 && t.hi >= 0;
}

/** True when a trend has a usable value and range. */
export function hasTrend(t) {
  return !!t && isNum(t.pct_per_decade) && isNum(t.lo) && isNum(t.hi);
}

/**
 * Shared percent-per-decade axis for both bars: always includes 0, symmetric padding of 10%,
 * at least ±10 so a near-zero pair still has a readable axis.
 * @param {Array<{lo: number, hi: number} | undefined>} trends
 * @returns {[number, number]}
 */
export function trendDomain(trends) {
  let lo = 0;
  let hi = 0;
  for (const t of trends) {
    if (!hasTrend(t)) continue;
    lo = Math.min(lo, t.lo, t.pct_per_decade);
    hi = Math.max(hi, t.hi, t.pct_per_decade);
  }
  const pad = Math.max(hi - lo, 20) * 0.1;
  return [Math.min(lo - pad, -10), Math.max(hi + pad, 10)];
}

// ---- PercentileStrip ---------------------------------------------------------------------------

/** SD-11 status from a percentile (the value is known to be present and rankable). */
export function statusFromPercentile(p) {
  if (!isNum(p)) return "unavailable";
  if (p >= 95) return "extreme";
  if (p > 75) return "above_normal";
  if (p < 25) return "below_normal";
  return "normal";
}

/**
 * Value bands of the strip: where on the value axis a new week would be below normal, normal,
 * above normal or extreme against the past years (SD-11, using percentileRank). Missing history
 * values are excluded. Bands are contiguous over [0, max].
 * @param {Array<number|null>} history
 * @param {number} max  right end of the axis
 * @returns {Array<{status: string, from: number, to: number}>}
 */
export function stripBands(history, max) {
  const past = history.filter(isNum);
  if (past.length === 0 || !(max > 0)) return [];
  const sorted = [...new Set(past)].sort((a, b) => a - b);
  // Breakpoints: 0, each past value, max. The status is constant strictly between breakpoints,
  // and at a past value itself (a tie) it is the status of the tie point.
  const points = [0, ...sorted.filter((v) => v > 0 && v < max), max];
  const out = [];
  const push = (status, from, to) => {
    if (to <= from) return;
    const last = out[out.length - 1];
    if (last && last.status === status && last.to === from) last.to = to;
    else out.push({ status, from, to });
  };
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    push(statusFromPercentile(percentileRank((a + b) / 2, past)), a, b);
  }
  return out;
}

/** Right end of the strip's value axis: 10% beyond the largest of history, value and hi. */
export function stripMax(history, value, hi) {
  const all = [...history, value, hi].filter(isNum);
  const m = all.length ? Math.max(...all) : 0;
  return m > 0 ? m * 1.1 : 1;
}

// ---- text -----------------------------------------------------------------------------------

/**
 * Greedy word wrap by an estimated character width (SVG has no automatic wrapping).
 * @param {string} text
 * @param {number} width  px
 * @param {number} [size]  font px
 */
export function wrapText(text, width, size = 14) {
  const maxChars = Math.max(8, Math.floor(width / (size * 0.56)));
  const lines = [];
  let line = "";
  for (const word of String(text ?? "")
    .split(/\s+/)
    .filter(Boolean)) {
    if (!line) line = word;
    else if ((line + " " + word).length <= maxChars) line += " " + word;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
