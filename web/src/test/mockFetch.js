import { vi } from "vitest";

/**
 * Stub global fetch with a map of data paths -> response.
 * Value: an object (served as JSON 200), a string (served as text/csv 200), { status } for an error code,
 * or "NETWORK" to make fetch reject. Unlisted paths return 404.
 */
export function mockFetch(files) {
  const fn = vi.fn(async (url) => {
    const path = String(url).replace(/^.*?data\//, "");
    const entry = files[path];
    if (entry === undefined) return new Response("Not found", { status: 404 });
    if (entry === "NETWORK") throw new TypeError("Failed to fetch");
    if (entry && typeof entry === "object" && "status" in entry && Object.keys(entry).length === 1) {
      return new Response("error", { status: entry.status });
    }
    if (typeof entry === "string") {
      return new Response(entry, { status: 200, headers: { "content-type": "text/csv" } });
    }
    return new Response(JSON.stringify(entry), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
