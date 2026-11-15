// Scales and mark styles for every chart (spec: plan/roles/R6_visualization.md §9.2).
// No hard-coded colours outside this file and tokens.css. Values that must follow the theme are
// CSS variable references; ramp colours are computed (they are identical in both themes).

import { interpolateInferno, interpolatePuOr, quantile, scaleDiverging, scaleSequentialSqrt } from "d3";

export { VizDefs, HATCH_ID } from "./defs";
export * from "./format";

// ---------------------------------------------------------------------------------------
// Fills that are not ramp colours
// ---------------------------------------------------------------------------------------

/** Exactly zero: covered, nothing burning. Surface colour plus a faint outline (ZERO_STYLE). */
export const ZERO_FILL = "var(--fr-zero-fill)";
/** No data: the 45° hatch pattern from <VizDefs/>. Never a colour from either ramp. */
export const NO_DATA_FILL = "url(#fr-hatch)";
/** Too little activity to rank (SD-11 low_activity rule, climatological p90 < 5). */
export const UNRANKED_FILL = "var(--fr-unranked-fill)";

// ---------------------------------------------------------------------------------------
// Activity: sequential, Inferno sampled on [0.10, 0.98], sqrt, domain [0, p99]
// ---------------------------------------------------------------------------------------

export const ACTIVITY_RAMP_SPAN = [0.1, 0.98];
/** Quantile used for the top of the activity domain. The single constant C1 may change. */
export const ACTIVITY_DOMAIN_QUANTILE = 0.99;

/** The activity ramp on t ∈ [0, 1] (for legends). */
export function activityInterpolator(t) {
  const [a, b] = ACTIVITY_RAMP_SPAN;
  const u = Math.min(1, Math.max(0, t));
  return interpolateInferno(a + (b - a) * u);
}

/**
 * Top of the activity domain: the p99 of the finite values (missing values excluded).
 * Falls back to 1 when there is nothing positive to scale, so the scale is always valid.
 */
export function activityDomainMax(values) {
  const finite = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  const q = quantile(finite, ACTIVITY_DOMAIN_QUANTILE);
  return q !== undefined && q > 0 ? q : 1;
}

/**
 * Colour for an activity value on [0, max]. Values above max clamp to the top colour.
 * Exactly 0 → ZERO_FILL. Non-finite (should never be passed: missing is not a number) → NO_DATA_FILL.
 */
export function activityScale(max) {
  const top = Number.isFinite(max) && max > 0 ? max : 1;
  const scale = scaleSequentialSqrt(activityInterpolator).domain([0, top]).clamp(true);
  return (value) => {
    if (!Number.isFinite(value)) return NO_DATA_FILL;
    if (value === 0) return ZERO_FILL;
    return scale(value);
  };
}

// ---------------------------------------------------------------------------------------
// Anomaly: diverging PuOr, orange = busier, purple = quieter, centred at 50, domain 0–100
// ---------------------------------------------------------------------------------------
// Spec §9.2 says "interpolatePuOr reversed". In d3, interpolatePuOr(0) is already purple
// (#2d004b) and interpolatePuOr(1) is orange (#7f3b08), so the required outcome
// (high percentile = orange) needs NO reversal. Verified in __tests__/theme.test.js.

/** The anomaly ramp on t ∈ [0, 1]: 0 = purple (quieter), 0.5 = neutral, 1 = orange (busier). */
export function anomalyInterpolator(t) {
  const u = Math.min(1, Math.max(0, t));
  return interpolatePuOr(u);
}

/** The neutral (50th percentile) colour. */
export const ANOMALY_NEUTRAL = anomalyInterpolator(0.5);

/** Colour for a percentile in [0, 100]. Non-finite → NO_DATA_FILL. */
export function anomalyScale() {
  const scale = scaleDiverging(anomalyInterpolator).domain([0, 50, 100]).clamp(true);
  return (p) => (Number.isFinite(p) ? scale(p) : NO_DATA_FILL);
}

export const KIND_STYLE = {
  observed: {
    useRamp: true,
    fillOpacity: 1,
    stroke: "none",
    strokeWidth: 0,
    label: "Observed",
    description: "observed by the reference sensor",
  },
  harmonized: {
    useRamp: true,
    fillOpacity: 1,
    stroke: "none",
    strokeWidth: 0,
    label: "Harmonized",
    description: "translated to the Aqua scale",
  },
  estimated: {
    useRamp: true,
    fillOpacity: 0.7,
    stroke: "var(--fr-estimate-stroke)",
    strokeWidth: 1,
    strokeDasharray: "3 2",
    label: "Estimate",
    description: "an estimate, less certain than observed values",
  },
  missing: {
    useRamp: false,
    fill: NO_DATA_FILL,
    fillOpacity: 1,
    stroke: "none",
    strokeWidth: 0,
    label: "No data",
    description: "no data: the satellite record does not cover this period",
  },
  sample: {
    useRamp: true,
    fillOpacity: 1,
    stroke: "none",
    strokeWidth: 0,
    label: "Sample",
    description: "sample data for testing, not a real measurement",
  },
};

/** Style for a covered value of exactly zero (applied on top of the kind style). */
export const ZERO_STYLE = {
  useRamp: false,
  fill: ZERO_FILL,
  fillOpacity: 1,
  stroke: "var(--fr-zero-stroke)",
  // 1 px, not 0.5: in the dark theme the zero fill and the lowest ramp colour have the same lightness,
  // so this outline is what keeps "covered, nothing burning" visible without colour (E1).
  strokeWidth: 1,
};

/** Style for an anomaly cell that is too quiet to rank (SD-11 low_activity). */
export const UNRANKED_STYLE = {
  useRamp: false,
  fill: UNRANKED_FILL,
  fillOpacity: 1,
  stroke: "var(--fr-unranked-stroke)",
  strokeWidth: 0.5,
  strokeDasharray: "1 2",
};
export const UNRANKED_LABEL = "Too little burning at this time of year to rank.";

/** Anomaly cells whose climatological weekly p90 is below this are drawn UNRANKED (SD-11). */
export const LOW_ACTIVITY_P90 = 5;

// ---------------------------------------------------------------------------------------
// Sensors and nowcast status
// ---------------------------------------------------------------------------------------

export const SENSOR_STYLE = {
  aqua: { color: "var(--fr-sensor-aqua)", label: "MODIS Aqua" },
  terra: { color: "var(--fr-sensor-terra)", label: "MODIS Terra" },
  snpp: { color: "var(--fr-sensor-snpp)", label: "VIIRS S-NPP" },
  noaa20: { color: "var(--fr-sensor-noaa20)", label: "VIIRS NOAA-20" },
  noaa21: { color: "var(--fr-sensor-noaa21)", label: "VIIRS NOAA-21" },
};

export const STATUS_STYLE = {
  unavailable: {
    color: "var(--fr-status-unavailable)",
    label: "No data this week",
    icon: "CircleSlash",
    boldOutline: false,
  },
  low_activity: {
    color: "var(--fr-status-low-activity)",
    label: "Low activity",
    icon: "Minus",
    boldOutline: false,
  },
  below_normal: {
    color: "var(--fr-status-below-normal)",
    label: "Below normal",
    icon: "ArrowDown",
    boldOutline: false,
  },
  normal: { color: "var(--fr-status-normal)", label: "Normal", icon: "Equal", boldOutline: false },
  above_normal: {
    color: "var(--fr-status-above-normal)",
    label: "Above normal",
    icon: "ArrowUp",
    boldOutline: false,
  },
  extreme: { color: "var(--fr-status-extreme)", label: "Extreme", icon: "TriangleAlert", boldOutline: true },
};

/** Chart text sizes in px (charts never go below 11 px). */
export const CHART_FONT = { min: 11, small: 12, body: 14, title: 16 };
