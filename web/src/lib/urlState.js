import { getResolution, isValidCell } from "h3-js";

/** Region-page URL parameters, exactly as contracts section 7. Pure; used by data/useUrlState.js. */

export const LENSES = ["harmonized", "aqua_raw", "viirs_raw", "naive_splice", "viirs_as_aqua", "viirs_equiv"];
export const VIEWS = ["clock", "weeks", "months"];
export const MODES = ["activity", "anomaly"];
export const FIRST_DAY = "2003-01-01";
export const URL_KEYS = ["from", "to", "lens", "view", "mode", "aoi"];

/** True for a real calendar date written YYYY-MM-DD. */
export function isIsoDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function isR5Cell(id) {
  try {
    return isValidCell(id) && getResolution(id) === 5;
  } catch {
    return false;
  }
}

export function defaultUrlState(lastDataDay) {
  return {
    from: FIRST_DAY,
    to: isIsoDate(lastDataDay) ? lastDataDay : null,
    lens: "harmonized",
    view: "clock",
    mode: "activity",
    aoi: [],
  };
}

/**
 * Read the state from URL search params. Any invalid value falls back to its default, silently.
 * @param {URLSearchParams} params
 * @param {string | null} lastDataDay regions.json last_data_day (default and upper bound of `to`)
 */
export function parseUrlState(params, lastDataDay = null) {
  const d = defaultUrlState(lastDataDay);
  const get = (k) => params.get(k);
  const max = d.to;
  const inBounds = (s) => isIsoDate(s) && s >= FIRST_DAY && (!max || s <= max);

  let from = inBounds(get("from")) ? get("from") : d.from;
  let to = inBounds(get("to")) ? get("to") : d.to;
  if (to && from > to) {
    from = d.from;
    to = d.to;
  }
  const lens = LENSES.includes(get("lens")) ? get("lens") : d.lens;
  const view = VIEWS.includes(get("view")) ? get("view") : d.view;
  const mode = MODES.includes(get("mode")) ? get("mode") : d.mode;
  const aoi = [...new Set((get("aoi") || "").split(",").map((s) => s.trim().toLowerCase()).filter(isR5Cell))];
  return { from, to, lens, view, mode, aoi };
}

/**
 * Write the state into a copy of `params`: parameters equal to their default are removed, so shared URLs stay short;
 * parameters this page does not own (e.g. debug) are kept.
 */
export function writeUrlState(params, state, lastDataDay = null) {
  const d = defaultUrlState(lastDataDay);
  const next = new URLSearchParams(params);
  for (const k of URL_KEYS) {
    const v = k === "aoi" ? (state.aoi || []).join(",") : state[k];
    const dv = k === "aoi" ? "" : d[k];
    if (v === undefined || v === null || v === "" || v === dv) next.delete(k);
    else next.set(k, v);
  }
  return next;
}
