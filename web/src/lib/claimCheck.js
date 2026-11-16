/**
 * Claim Checker (science SD-20). Pure: no React, no fetching. Every threshold, template and note comes from the
 * region's claim_check.json (built by pipeline/export/claim_check.py from science.yaml).
 * The Python reference is pipeline/common/claim_check.py; contracts/fixtures/claim_check_parity.json pins both
 * to identical output (numbers rounded half away from zero to 3 decimals).
 */
import { quantile } from "./aoi.js";

export const DIRECTIONS = ["increased", "decreased"];
const KIND_ORDER = ["observed", "harmonized", "estimated", "missing", "sample"];
export const AOI_PLACE_NAME = "your drawn area";
const MINUS = "−";

/** Round half away from zero to 3 decimals; never -0. */
export function r3(x) {
  const v = Math.floor(Math.abs(x) * 1000 + 0.5) / 1000;
  return (x >= 0 ? v : -v) + 0;
}

function whole(x) {
  const n = Math.floor(Math.abs(x) + 0.5);
  return x >= 0 || n === 0 ? n : -n;
}

/** +21%, −30%, 0% (whole percent, half away from zero). */
export function signedPct(x) {
  const n = whole(x);
  return n > 0 ? `+${n}%` : n < 0 ? `${MINUS}${-n}%` : "0%";
}

function plainNumber(x) {
  const v = r3(x);
  return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

/** `width` years centred on `center` (the earlier side gets the extra year when even), trimmed to the record. */
export function claimWindow(center, record, width) {
  const start = center - Math.floor(width / 2);
  return [Math.max(start, record[0]), Math.min(start + width - 1, record[1])];
}

export function windowText(w) {
  return w[0] === w[1] ? String(w[0]) : `${w[0]}–${w[1]}`;
}

function mean(values) {
  let total = 0;
  for (const v of values) total += v;
  return total / values.length;
}

const change = (start, end) => (end / start - 1) * 100;

export function fill(template, slots) {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    if (!(key in slots)) throw new Error(`template slot {${key}} has no value`);
    return slots[key];
  });
}

/** The `config` argument of checkClaim, from a claim_check.json document. */
export function configFromDoc(doc) {
  return { ...doc.config, templates: doc.templates, notes: doc.notes };
}

/** The `series` argument of checkClaim for a whole region, from a claim_check.json document. */
export function seriesFromDoc(doc, placeName) {
  return { place_name: placeName, naive_unit: doc.naive_unit, annual: doc.annual, replicates: doc.replicates };
}

/**
 * The `series` argument for a drawn area, from two monthly area series (lib/spatial.js spatialAreaSeries) of the
 * `harmonized` and `naive_splice` lenses. A year is missing unless all 12 months are present in both. No
 * replicates exist per area, so checkClaim uses the envelope of the summed SD-07 bounds (SD-20).
 */
export function seriesFromArea(harmonizedMonths, naiveMonths, config) {
  const record = config.record_years;
  const source = (year) => (year < config.sensor_change_year ? "modis" : "snpp");
  const byYear = (rows) => {
    const out = new Map();
    for (const row of rows) {
      const list = out.get(row.year) ?? [];
      list.push(row);
      out.set(row.year, list);
    }
    return out;
  };
  const h = byYear(harmonizedMonths);
  const n = byYear(naiveMonths);
  const complete = (rows) => rows?.length === 12 && rows.every((row) => row.value !== null && row.kind !== "missing");
  const sum = (rows, key) => {
    let total = 0;
    for (const row of [...rows].sort((a, b) => a.month - b.month)) total += row[key] ?? row.value;
    return total;
  };
  const annual = [];
  for (let year = record[0]; year <= record[1]; year++) {
    const hm = h.get(year);
    const nm = n.get(year);
    if (!complete(hm) || !complete(nm)) {
      annual.push({ year, harmonized: null, lo: null, hi: null, kind: "missing", naive_count: null, naive_source: source(year) });
      continue;
    }
    const kinds = new Set(hm.map((row) => row.kind));
    const kind = kinds.has("sample") ? "sample" : kinds.has("estimated") ? "estimated" : kinds.has("harmonized") ? "harmonized" : "observed";
    annual.push({ year, harmonized: sum(hm, "value"), lo: sum(hm, "lo"), hi: sum(hm, "hi"), kind, naive_count: sum(nm, "value"), naive_source: source(year) });
  }
  return { place_name: AOI_PLACE_NAME, naive_unit: "fire cell-days", annual, replicates: null };
}

function empty(error = null) {
  return {
    ok: error === null, error, claimed_change_pct: null, verdict: null, template_id: null, sentence: null, windows: null,
    missing_years: [], naive: null, naive_unit: null, harmonized: null, artifact_share: null, same_sensor: null, notes: [], kinds: [],
  };
}

function kindsOf(rows) {
  const seen = new Set();
  for (const row of rows) {
    if (!row || row.harmonized === null || row.naive_count === null) {
      seen.add("missing");
      continue;
    }
    seen.add(row.kind);
    seen.add(row.kind === "sample" ? "sample" : "observed"); // the naive lens is counted as recorded
  }
  return KIND_ORDER.filter((k) => seen.has(k));
}

const isYear = (y, record) => Number.isInteger(y) && y >= record[0] && y <= record[1];
const range = (w) => Array.from({ length: w[1] - w[0] + 1 }, (_, i) => w[0] + i);

/**
 * SD-20 check. claim: {place: "region"|"aoi", direction, claimed_pct, from_year, to_year};
 * series: seriesFromDoc / seriesFromArea; config: configFromDoc. Returns the contract `result`.
 */
export function checkClaim(claim, series, config) {
  const record = config.record_years;
  const pct = claim.claimed_pct;
  const y0 = claim.from_year;
  const y1 = claim.to_year;
  if (!DIRECTIONS.includes(claim.direction)) return empty("direction");
  if (typeof pct !== "number" || !Number.isFinite(pct) || !(pct > 0 && pct <= config.max_claim_pct)) return empty("claimed_pct_range");
  if (!isYear(y0, record) || !isYear(y1, record)) return empty("years_range");
  if (y0 >= y1) return empty("years_order");

  const out = empty();
  const claimed = r3(claim.direction === "increased" ? pct : -pct);
  const width = Math.trunc(config.window_years);
  const wStart = claimWindow(y0, record, width);
  const wEnd = claimWindow(y1, record, width);
  const byYear = new Map(series.annual.map((row) => [row.year, row]));
  const startYears = range(wStart);
  const endYears = range(wEnd);
  const allYears = [...new Set([...startYears, ...endYears])].sort((a, b) => a - b);
  const rows = allYears.map((y) => byYear.get(y) ?? null);
  const missing = allYears.filter((y, i) => !rows[i] || rows[i].harmonized === null || rows[i].naive_count === null);
  const scy = config.sensor_change_year;
  const sameSensor = allYears.every((y) => y < scy) || allYears.every((y) => y >= scy);
  const aoi = claim.place === "aoi";
  const texts = config.notes;
  const slots = {
    place: series.place_name, claimed: signedPct(claimed), start_window: windowText(wStart), end_window: windowText(wEnd),
    window_years: String(width), tolerance: plainNumber(config.agreement_tolerance_pct_points), sensor_change_year: String(scy),
  };
  Object.assign(out, {
    claimed_change_pct: claimed, windows: { start: wStart, end: wEnd }, missing_years: missing,
    naive_unit: series.naive_unit, same_sensor: sameSensor, kinds: kindsOf(rows),
  });
  const aoiNote = aoi ? [{ id: "aoi_calibration", text: fill(texts.aoi_calibration, slots) }] : [];
  const cantTell = (templateId) =>
    Object.assign(out, { verdict: "cant_tell_missing", template_id: templateId, sentence: fill(config.templates[templateId], slots), notes: aoiNote });

  if (missing.length) {
    slots.missing_years = missing.join(", ");
    return cantTell("cant_tell_missing");
  }
  const means = (key, years) => mean(years.map((y) => Number(byYear.get(y)[key])));
  const ns = means("naive_count", startYears);
  const ne = means("naive_count", endYears);
  const hs = means("harmonized", startYears);
  const he = means("harmonized", endYears);
  const reps = series.replicates ?? null;
  const useReps = reps !== null;
  let hsLo, hsHi, heLo, heHi;
  if (!useReps) {
    hsLo = means("lo", startYears);
    hsHi = means("hi", startYears);
    heLo = means("lo", endYears);
    heHi = means("hi", endYears);
  }
  if (ns === 0 || hs === 0 || (!useReps && hsLo === 0)) return cantTell("cant_tell_zero_start");

  const nChange = r3(change(ns, ne));
  const mid = r3(change(hs, he));
  let lo, hi, source;
  if (useReps) {
    const index = new Map(reps.years.map((y, i) => [y, i]));
    const changes = [];
    for (const values of reps.values) {
      const value = (y) => (index.has(y) ? Number(values[index.get(y)]) : Number(byYear.get(y).harmonized));
      const s = mean(startYears.map(value));
      if (s !== 0) changes.push(change(s, mean(endYears.map(value))));
    }
    if (changes.length) {
      changes.sort((a, b) => a - b);
      const [pLo, pHi] = config.interval_percentiles;
      lo = r3(quantile(changes, pLo / 100));
      hi = r3(quantile(changes, pHi / 100));
    } else {
      lo = mid;
      hi = mid;
    }
    source = "replicates";
  } else {
    lo = r3(change(hsHi, heLo));
    hi = r3(change(hsLo, heHi));
    source = "envelope";
  }
  lo = Math.min(lo, mid);
  hi = Math.max(hi, mid);
  const tol = config.agreement_tolerance_pct_points;
  const bandLo = r3(lo - tol);
  const bandHi = r3(hi + tol);

  const sign = claimed > 0 ? 1 : -1;
  const containsZero = bandLo <= 0 && 0 <= bandHi;
  let verdict;
  if ((sign > 0 && bandHi < 0) || (sign < 0 && bandLo > 0)) verdict = "contradicted";
  else if (nChange * sign > 0 && Math.abs(nChange) >= config.artifact_min_naive_pct && containsZero) verdict = "sensor_artifact";
  else if (containsZero) verdict = "no_clear_change";
  else if (bandLo <= claimed && claimed <= bandHi) verdict = "holds_up";
  else if ((sign > 0 && claimed > bandHi) || (sign < 0 && claimed < bandLo)) verdict = "weaker_than_claimed";
  else verdict = "stronger_than_claimed";

  let share = null;
  if (!sameSensor && nChange !== 0 && nChange * mid > 0) {
    const s = r3((nChange - mid) / nChange);
    share = s > 0 ? s : null;
  }
  Object.assign(slots, { h_mid: signedPct(mid), h_lo: signedPct(lo), h_hi: signedPct(hi), naive: signedPct(nChange) });
  if (share !== null) slots.artifact_share = `${whole(share * 100)}%`;
  const notes = [
    { id: "windows", text: fill(texts.windows, slots) },
    { id: "tolerance", text: fill(texts.tolerance, slots) },
  ];
  if (share !== null) notes.push({ id: "artifact_share", text: fill(texts.artifact_share, slots) });
  if (sameSensor) notes.push({ id: "same_sensor", text: fill(texts.same_sensor, slots) });
  return Object.assign(out, {
    verdict, template_id: verdict, sentence: fill(config.templates[verdict], slots),
    naive: { start_mean: r3(ns), end_mean: r3(ne), change_pct: nChange },
    harmonized: { start_mean: r3(hs), end_mean: r3(he), mid, lo, hi, band_lo: bandLo, band_hi: bandHi, range_source: source },
    artifact_share: share, notes: [...notes, ...aoiNote],
  });
}
