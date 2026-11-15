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
/** path -> { loaded, total, listeners:Set } so every caller of a lazy file sees the same download progress. */
const progress = new Map();

function report(path, loaded, total) {
  const p = progress.get(path);
  if (!p) return;
  p.loaded = loaded;
  p.total = total;
  for (const fn of p.listeners) fn({ loaded, total });
}

/** Read a response body as text, reporting bytes received (total = Content-Length, or null when unknown). */
async function readText(res, path) {
  const total = Number(res.headers.get("content-length")) || null;
  if (!res.body?.getReader) {
    const t = await res.text();
    report(path, t.length, total);
    return t;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value.byteLength;
    text += decoder.decode(value, { stream: true });
    report(path, loaded, total);
  }
  return text + decoder.decode();
}

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
  const result = parseCsv(await readText(res, path), name);
  if (result.ok && containsSampleKind(result.data)) markSample(path);
  return { ...result, path };
}

function lazy(regionId, name, onProgress) {
  const path = regionFilePath(regionId, name);
  if (!progress.has(path)) progress.set(path, { loaded: 0, total: null, listeners: new Set() });
  const p = progress.get(path);
  if (onProgress) {
    p.listeners.add(onProgress);
    onProgress({ loaded: p.loaded, total: p.total });
  }
  if (!cache.has(path)) cache.set(path, loadCsv(path, name));
  return cache.get(path).finally(() => onProgress && p.listeners.delete(onProgress));
}

/** Rows {h3_r5, ym, aqua, viirs}. Loaded only when called; onProgress({loaded, total}) gets bytes received. */
export const loadCellsMonthly = (regionId, onProgress) => lazy(regionId, "cells_monthly", onProgress);
/** Rows of the last 31 days of NOAA-20 NRT detections. Loaded only when called. */
export const loadHotspotsRecent = (regionId, onProgress) => lazy(regionId, "hotspots_recent", onProgress);

/** Test helper. */
export function clearCsvCache() {
  cache.clear();
  progress.clear();
}
