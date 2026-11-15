import { TEST_INFO } from "./labels.js";

/**
 * Compare a validation row's value with its baselines, for tests where lower (or closer to zero) is better.
 * @returns {null | { ours: number, beats: string[], loses: string[], lowest: boolean, abs: boolean }}
 *   null when the test has no "lower is better" reading, no value, or no numeric baselines.
 */
export function compareToBaselines(row) {
  const better = TEST_INFO[row?.test]?.better;
  if (better !== "lower" && better !== "abs") return null;
  if (row.value === null || row.value === undefined) return null;
  const entries = Object.entries(row.baselines || {}).filter(([, v]) => typeof v === "number");
  if (!entries.length) return null;
  const size = better === "abs" ? Math.abs : (v) => v;
  const ours = size(row.value);
  const beats = entries.filter(([, v]) => ours < size(v)).map(([k]) => k);
  const loses = entries.filter(([, v]) => ours >= size(v)).map(([k]) => k);
  return { ours, beats, loses, lowest: loses.length === 0, abs: better === "abs" };
}

/** Rows grouped by region, regions in first-seen order. */
export function groupByRegion(rows) {
  const out = new Map();
  for (const r of rows || []) {
    if (!out.has(r.region)) out.set(r.region, []);
    out.get(r.region).push(r);
  }
  return out;
}
