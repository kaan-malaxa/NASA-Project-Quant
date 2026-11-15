/**
 * Anomaly percentile, SD-11 (plan/03_SCIENCE_DECISIONS.md):
 *   percentile = 100 × ( count(past < x) + 0.5 × count(past == x) ) / N
 *
 * Missing values are not zero (AGENTS.md science rule 3): non-finite entries in `others`
 * (NaN, ±Infinity, or nulls coerced by a caller) are excluded from both the counts and N.
 * Returns NaN when `value` is not finite or no valid comparison values remain, so a caller
 * can never mistake "cannot rank" for the 0th percentile.
 * The result is not rounded; round only for display.
 */
export function percentileRank(value, others) {
  if (!Number.isFinite(value)) return NaN;
  let below = 0;
  let equal = 0;
  let n = 0;
  for (const o of others) {
    if (!Number.isFinite(o)) continue;
    n += 1;
    if (o < value) below += 1;
    else if (o === value) equal += 1;
  }
  if (n === 0) return NaN;
  return (100 * (below + 0.5 * equal)) / n;
}
