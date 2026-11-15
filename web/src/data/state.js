/**
 * One file's state as seen by a screen section.
 * @typedef {{ status: "loading" } |
 *           { status: "ok", data: any } |
 *           { status: "absent", detail?: string } |
 *           { status: "invalid", detail: string } |
 *           { status: "network", detail: string } |
 *           { status: "lazy" }} FileState
 *   absent  = not listed for the region, or the file is not on the server
 *   lazy    = listed and available on request (CSV files; see csv.js)
 */

export const LOADING = Object.freeze({ status: "loading" });

/** @param {import("./fetchJson.js").FetchResult} r @returns {FileState} */
export function toFileState(r) {
  if (r.ok === true) return { status: "ok", data: r.data };
  if (r.reason === "missing") return { status: "absent", detail: r.detail };
  return { status: r.reason, detail: r.detail };
}
