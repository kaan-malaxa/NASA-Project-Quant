import { LENSES } from "./urlState.js";

/**
 * The calendar's lens choices: every series in weekly.json series_meta plus the browser-built naive splice,
 * in contract order, with plain labels from series_meta.
 * @param {Record<string, {label: string, unit: string}>} seriesMeta
 * @returns {{ id: string, label: string, unit: string | null }[]}
 */
export function buildLensList(seriesMeta) {
  const meta = seriesMeta || {};
  return LENSES.filter((id) => id === "naive_splice" || meta[id]).map((id) =>
    id === "naive_splice"
      ? { id, label: "Naive splice", unit: meta.aqua_raw?.unit ?? meta.viirs_raw?.unit ?? null }
      : { id, label: meta[id].label, unit: meta[id].unit },
  );
}

/** First year that the naive splice takes from VIIRS (contracts 6.2: aqua_raw before 2012, viirs_raw from 2012). */
export const NAIVE_SPLICE_SWITCH_YEAR = 2012;

/** The stored series that holds a lens's value for a given year. */
export function seriesForLens(lens, year) {
  if (lens === "naive_splice") return year < NAIVE_SPLICE_SWITCH_YEAR ? "aqua_raw" : "viirs_raw";
  return lens;
}
