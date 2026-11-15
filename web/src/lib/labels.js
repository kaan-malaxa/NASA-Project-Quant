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
