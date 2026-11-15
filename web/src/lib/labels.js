/** Plain-language labels for enum values (contracts section 9). Fixed copy; the value itself comes from JSON. */

export const STATUS_LABELS = {
  unavailable: "No recent data",
  low_activity: "Too little burning to rank",
  below_normal: "Below normal",
  normal: "Normal",
  above_normal: "Above normal",
  extreme: "Extreme",
};

export function statusLabel(status) {
  return STATUS_LABELS[status] ?? "Unknown status";
}

/** Satellite / sensor codes (contracts section 9) in words. */
export const SENSOR_LABELS = {
  aqua: "MODIS Aqua",
  terra: "MODIS Terra",
  snpp: "VIIRS on Suomi NPP",
  noaa20: "VIIRS on NOAA-20",
  noaa21: "VIIRS on NOAA-21",
  modis: "MODIS (Terra + Aqua)",
};

export function sensorLabel(code) {
  return SENSOR_LABELS[code] ?? code ?? "unknown";
}

export const DIRECTION_LABELS = {
  rising: "Rising",
  falling: "Falling",
  no_clear_change: "No clear change",
};

/** Robustness variants of SD-14, described in words (method descriptions, not results). */
export const VARIANT_LABELS = {
  aqua_only_2003_2022: "MODIS Aqua only, 2003–2022",
  translated_from_2012: "Translated from 2012 (S-NPP from 2012 instead of 2023)",
};

export function variantLabel(id) {
  return VARIANT_LABELS[id] ?? id;
}

/**
 * Validation tests (contracts 6.13 ValidationRow.test; meaning from 03_SCIENCE_DECISIONS section G).
 * better: "lower" = smaller is better; "abs" = closer to zero is better; "higher"; null = no direction.
 */
export const TEST_INFO = {
  loyo_weekly_wape: { label: "Weekly error with each year held out (WAPE)", better: "lower" },
  loyo_weekly_r: { label: "Weekly correlation with each year held out (r)", better: "higher" },
  loyo_bias: { label: "Bias with each year held out", better: "abs" },
  handoff_annual_mape: {
    label: "Yearly totals at the handoff: Aqua vs translated S-NPP (mean absolute % difference)",
    better: "lower",
    note: "These totals match partly by construction, because the factor was fitted on the same years.",
  },
  step_naive: { label: "Size of the 2012 step in the raw record", better: null },
  step_harmonized: { label: "Size of the 2012 step in the harmonized record", better: null },
  sat_agreement_wape: { label: "Two VIIRS satellites, both translated: weekly disagreement (WAPE)", better: "lower" },
  k_direct_vs_chained_pct: { label: "NOAA-20 factor fitted directly vs through S-NPP (% difference)", better: "abs" },
  backcast_weekly_wape: { label: "Backcast: VIIRS weeks predicted from Aqua, each year held out (WAPE)", better: "lower" },
  t1_t2_wape: { label: "Two methods compared: Tier 1 vs Tier 2, held-out years (WAPE)", better: "lower" },
  reliability_err: { label: "Eyesight curve: predicted vs observed detections (reliability error)", better: "abs" },
  reliability_year_absolute_err: { label: "Eyesight curve: absolute yearly disagreement (diagnostic)", better: "lower" },
  saturation_r5: { label: "Share of map cells active per day in the peak week, coarser grid (res 5)", better: null },
  saturation_r6: { label: "Share of map cells active per day in the peak week, counting grid (res 6)", better: null },
};

export function testLabel(id) {
  return TEST_INFO[id]?.label ?? id;
}

export const BASELINE_LABELS = {
  raw_viirs: "Raw VIIRS, no correction",
  annual_ratio: "One factor for the whole year",
};

export function baselineLabel(id) {
  return BASELINE_LABELS[id] ?? id;
}

export const METHOD_LABELS = { tier1: "Tier 1", tier2: "Tier 2", none: "—" };

export const EYESIGHT_STATUS_LABELS = {
  validated: "Validated",
  exploratory: "Exploratory: shown for comparison, not used for results",
  absent: "Not available",
};
