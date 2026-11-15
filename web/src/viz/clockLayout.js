// Pure geometry for FireYearClock (no React, no DOM). Unit-tested in __tests__/clock.test.js.
// Angles follow d3.arc: 0 at 12 o'clock, increasing clockwise, in radians.

import { weekToPhrase } from "./format";

export const TAU = Math.PI * 2;
export const WEEKS = 52;
/** Spec §9.5: inner radius = 24% of the outer radius. */
export const INNER_FRACTION = 0.24;

/** Start and end angle of an SD-08 week segment (52 equal segments, week 1 at 12 o'clock). */
export function weekAngles(week) {
  return [((week - 1) / WEEKS) * TAU, (week / WEEKS) * TAU];
}

/**
 * Angle of the start of a day of year, consistent with the week segments: days 1–357 are 7 per
 * segment; SD-08 week 52 holds the remaining 8 (9 in leap years) days.
 */
export function doyAngle(doy, daysInYear = 365) {
  const w52Start = 51 * 7 + 1; // day 358
  if (doy < w52Start) return ((doy - 1) / 7 / WEEKS) * TAU;
  const len = daysInYear - w52Start + 1;
  return ((51 + (doy - w52Start) / len) / WEEKS) * TAU;
}

/** Month sectors on a non-leap reference year: boundary angles and mid angle for labels. */
export function monthSectors() {
  const startDoy = (m) => Math.round((Date.UTC(2001, m - 1, 1) - Date.UTC(2001, 0, 1)) / 86_400_000) + 1;
  return Array.from({ length: 12 }, (_, i) => {
    const a0 = doyAngle(startDoy(i + 1));
    const a1 = i === 11 ? TAU : doyAngle(startDoy(i + 2));
    return { month: i + 1, a0, a1, mid: (a0 + a1) / 2 };
  });
}

/** Inner and outer radius of ring `index` (0 = innermost) of `n` equal rings between r0 and R. */
export function ringRadii(index, n, r0, R) {
  const t = (R - r0) / Math.max(1, n);
  return [r0 + index * t, r0 + (index + 1) * t];
}

/** Runs of consecutive weeks, merging across the year end (week 52 → week 1). */
export function circularRuns(weeks) {
  const set = new Set([...weeks].filter((w) => w >= 1 && w <= WEEKS));
  if (set.size === 0) return [];
  if (set.size === WEEKS) return [[1, WEEKS]];
  const runs = [];
  for (let w = 1; w <= WEEKS; w++) {
    if (!set.has(w)) continue;
    const last = runs[runs.length - 1];
    if (last && last[1] === w - 1) last[1] = w;
    else runs.push([w, w]);
  }
  if (runs.length > 1 && runs[0][0] === 1 && runs[runs.length - 1][1] === WEEKS) {
    const tail = runs.pop();
    runs[0] = [tail[0], runs[0][1]]; // wraps: start > end
  }
  return runs;
}

/** Start/end angles of a run; a wrapping run ends past TAU so arcs draw clockwise through 12 o'clock. */
export function runAngles([a, b]) {
  const a0 = weekAngles(a)[0];
  let a1 = weekAngles(b)[1];
  if (a1 <= a0) a1 += TAU;
  return [a0, a1];
}

/** Number of weeks in a run (handles wrapping runs). */
export function runLength([a, b]) {
  return b >= a ? b - a + 1 : WEEKS - a + 1 + b;
}

/** "late October" from the main season window's peak week, or null. */
export function peakPhrase(season) {
  const w = season?.windows?.[0]?.peak_week;
  return typeof w === "number" && w >= 1 && w <= WEEKS ? weekToPhrase(w) : null;
}

/** Point at (angle, radius) relative to the centre; y grows downward as in SVG. */
export function polar(angle, r) {
  return [Math.sin(angle) * r, -Math.cos(angle) * r];
}

/**
 * SVG path for an arc of radius r used as a textPath. Text on the lower half is drawn on a
 * reversed (counter-clockwise) path so it reads left to right, not upside down.
 */
export function textArcPath(a0, a1, r) {
  const mid = ((((a0 + a1) / 2) % TAU) + TAU) % TAU;
  const flipped = mid > Math.PI / 2 && mid < (3 * Math.PI) / 2;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(a0, r);
  const [x1, y1] = polar(a1, r);
  const d = flipped
    ? `M${x1},${y1} A${r},${r} 0 ${large} 0 ${x0},${y0}`
    : `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1}`;
  return { d, flipped };
}
