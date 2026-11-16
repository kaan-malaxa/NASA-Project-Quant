import { fmtSignedPct } from "@/lib/format.js";

/**
 * The planted truth for the simulation page, from methods.json `planted_truth` (the simulated region's known answers).
 * Labels are fixed words for each quantity id; every number comes from the JSON.
 */
export const QUANTITY_LABELS = {
  k_annual_snpp: "Calibration factor, Suomi NPP",
  k_annual_noaa20: "Calibration factor, NOAA-20",
  k_month_snpp_max_abs_err: "Largest monthly calibration error, Suomi NPP",
  g: "Eyesight-curve parameter",
  reliability_err: "Eyesight-curve reliability error",
  trend_pct_per_decade: "Long-term trend (% per decade)",
  peak_week_main: "Main peak week of the season",
  peak_week_second: "Second peak week of the season",
  aqua_outage_days_missing: "Days missing in a planted Aqua outage",
  static_rows_surviving: "Rows left after the static heat-source filter",
};

export const quantityLabel = (id) => QUANTITY_LABELS[id] ?? id;

/** The planted true trend (% per decade), or null when the JSON has none. */
export function trueTrend(plantedTruth) {
  const row = (plantedTruth || []).find((r) => r.quantity === "trend_pct_per_decade");
  return row && typeof row.truth === "number" ? row.truth : null;
}

/**
 * One plain sentence, built from the numbers: does the planted true trend fall inside the harmonized likely range?
 * @param {number | null} truth planted true trend, % per decade
 * @param {{ pct_per_decade: number | null, lo: number | null, hi: number | null } | null} harmonized trend.json harmonized
 * @returns {{ inside: boolean, sentence: string } | null} null when either side is missing
 */
export function truthCheck(truth, harmonized) {
  if (truth === null || !harmonized) return null;
  const { lo, hi, pct_per_decade: est } = harmonized;
  if ([lo, hi, est].some((v) => typeof v !== "number")) return null;
  const inside = truth >= lo && truth <= hi;
  return {
    inside,
    sentence: `The true trend we planted is ${fmtSignedPct(truth)} per decade. The harmonized result is ${fmtSignedPct(est)}, with a likely range of ${fmtSignedPct(lo)} to ${fmtSignedPct(hi)}, so the truth falls ${inside ? "inside" : "outside"} the likely range.`,
  };
}
