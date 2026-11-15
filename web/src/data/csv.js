import Papa from "papaparse";
import { dataUrl } from "./fetchJson.js";
import { regionFilePath } from "./files.js";
import { containsSampleKind, markSample } from "./sample.js";

/** Exact headers from contracts 6.12. */
export const CSV_HEADERS = {
  cells_monthly: ["h3_r5", "ym", "aqua", "viirs"],
  hotspots_recent: [
    "latitude", "longitude", "acq_date", "acq_time", "satellite", "confidence", "frp", "daynight", "local_day", "h3_r6",
  ],
};

// Columns kept as text even when they look numeric (H3 ids, dates, codes).
const TEXT_COLUMNS = new Set(["h3_r5", "h3_r6", "ym", "acq_date", "acq_time", "local_day", "satellite", "confidence", "daynight"]);

const cache = new Map();

/** Parse CSV text and check its header. Pure; exported for tests. */
export function parseCsv(text, name) {
  const parsed = Papa.parse(text.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: (col) => !TEXT_COLUMNS.has(col),
  });
  const want = CSV_HEADERS[name];
  const got = parsed.meta.fields || [];
  if (want && (got.length !== want.length || want.some((h, i) => got[i] !== h))) {
    return { ok: false, reason: "invalid", detail: `header is "${got.join(",")}", expected "${want.join(",")}"` };
  }
  if (parsed.errors.length) {
    const e = parsed.errors[0];
    return { ok: false, reason: "invalid", detail: `row ${e.row}: ${e.message} (${parsed.errors.length} errors)` };
  }
  return { ok: true, data: parsed.data };
}

async function loadCsv(path, name) {
  let res;
  try {
    res = await fetch(dataUrl(path), { headers: { Accept: "text/csv" } });
  } catch (err) {
    return { ok: false, reason: "network", detail: String(err?.message || err), path };
  }
  if (res.status === 404 || res.status === 410) return { ok: false, reason: "missing", detail: `HTTP ${res.status}`, path };
  if (!res.ok) return { ok: false, reason: "network", detail: `HTTP ${res.status}`, path };
  if ((res.headers.get("content-type") || "").includes("text/html")) {
    return { ok: false, reason: "missing", detail: "server returned HTML instead of the data file", path };
  }
  const result = parseCsv(await res.text(), name);
  if (result.ok && containsSampleKind(result.data)) markSample(path);
  return { ...result, path };
}

function lazy(regionId, name) {
  const path = regionFilePath(regionId, name);
  if (!cache.has(path)) cache.set(path, loadCsv(path, name));
  return cache.get(path);
}

/** Rows {h3_r5, ym, aqua, viirs}. Loaded only when called. */
export const loadCellsMonthly = (regionId) => lazy(regionId, "cells_monthly");
/** Rows of the last 31 days of NOAA-20 NRT detections. Loaded only when called. */
export const loadHotspotsRecent = (regionId) => lazy(regionId, "hotspots_recent");

/** Test helper. */
export function clearCsvCache() {
  cache.clear();
}
