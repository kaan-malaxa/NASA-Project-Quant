import Ajv from "ajv";
import { getSchema, schemaNameForPath } from "./schemas.js";
import { containsSampleKind, markSample } from "./sample.js";

/**
 * @typedef {{ ok: true, data: any, path: string }} FetchOk
 * @typedef {{ ok: false, reason: "missing" | "invalid" | "network", detail: string, path: string }} FetchFail
 * @typedef {FetchOk | FetchFail} FetchResult
 */

const ajv = new Ajv({ allErrors: true, strict: false });
const validators = new Map();
/** @type {Map<string, Promise<FetchResult>>} */
const cache = new Map();

/** URL of a file in the site's own data/ folder (contracts section 6: `{BASE}data/<path>`). */
export function dataUrl(path) {
  return `${import.meta.env.BASE_URL}data/${path}`;
}

function getValidator(name) {
  if (validators.has(name)) return validators.get(name);
  const schema = getSchema(name);
  const validate = schema ? ajv.compile(schema) : null;
  validators.set(name, validate);
  return validate;
}

function formatErrors(errors) {
  return (errors || [])
    .slice(0, 8)
    .map((e) => `${e.instancePath || "(root)"} ${e.message}${e.params?.missingProperty ? `: ${e.params.missingProperty}` : ""}`)
    .join("; ");
}

/**
 * Fetch, parse and validate one data file. Never throws; never rejects.
 * @param {string} path  path under data/, e.g. "punjab/weekly.json"
 * @param {{ schema?: string | null }} [opts]  schema name override; null skips validation
 * @returns {Promise<FetchResult>}
 */
export function fetchJson(path, opts = {}) {
  if (!cache.has(path)) cache.set(path, load(path, opts));
  return cache.get(path);
}

async function load(path, opts) {
  let res;
  try {
    res = await fetch(dataUrl(path), { headers: { Accept: "application/json" } });
  } catch (err) {
    return { ok: false, reason: "network", detail: String(err?.message || err), path };
  }
  if (res.status === 404 || res.status === 410) {
    return { ok: false, reason: "missing", detail: `HTTP ${res.status}`, path };
  }
  if (!res.ok) {
    return { ok: false, reason: "network", detail: `HTTP ${res.status}`, path };
  }
  // A dev server or host may answer a missing file with the HTML app shell.
  const type = res.headers.get("content-type") || "";
  if (type.includes("text/html")) {
    return { ok: false, reason: "missing", detail: "server returned HTML instead of the data file", path };
  }

  let data;
  try {
    data = JSON.parse(await res.text());
  } catch (err) {
    return { ok: false, reason: "invalid", detail: `not valid JSON: ${err?.message || err}`, path };
  }

  const name = opts.schema === undefined ? schemaNameForPath(path) : opts.schema;
  if (name) {
    const validate = getValidator(name);
    if (!validate) {
      return { ok: false, reason: "invalid", detail: `no schema named "${name}"`, path };
    }
    if (!validate(data)) {
      return { ok: false, reason: "invalid", detail: formatErrors(validate.errors), path };
    }
  }

  if (data?.code_version === "sample" || containsSampleKind(data)) markSample(path);
  return { ok: true, data, path };
}

/** Test helper. */
export function clearFetchCache() {
  cache.clear();
}
