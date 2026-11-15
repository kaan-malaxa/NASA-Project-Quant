import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearFetchCache, fetchJson } from "./fetchJson.js";
import { getSampleState, resetSample } from "./sample.js";
import { getSchema, schemaNameForPath } from "./schemas.js";
import { mockFetch } from "@/test/mockFetch.js";
import { regionsJson, weeklyJson } from "@/test/fixtures.js";

beforeEach(() => {
  clearFetchCache();
  resetSample();
});
afterEach(() => vi.unstubAllGlobals());

describe("fetchJson", () => {
  it("returns ok with data for a valid file", async () => {
    mockFetch({ "regions.json": regionsJson() });
    const r = await fetchJson("regions.json");
    expect(r.ok).toBe(true);
    expect(r.data.regions).toHaveLength(2);
  });

  it("returns invalid when a required field is missing", async () => {
    const bad = regionsJson();
    delete bad.regions;
    mockFetch({ "regions.json": bad });
    const r = await fetchJson("regions.json");
    expect(r).toMatchObject({ ok: false, reason: "invalid" });
    expect(r.detail).toContain("regions");
  });

  it("returns invalid when a nested required field is missing", async () => {
    const bad = weeklyJson();
    delete bad.rows[0].kind;
    mockFetch({ "testland/weekly.json": bad });
    const r = await fetchJson("testland/weekly.json");
    expect(r).toMatchObject({ ok: false, reason: "invalid" });
    expect(r.detail).toContain("kind");
  });

  it("returns invalid for text that is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{oops", { status: 200 })));
    expect(await fetchJson("regions.json")).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("returns missing for 404 and for an HTML fallback page", async () => {
    mockFetch({});
    expect(await fetchJson("testland/trend.json")).toMatchObject({ ok: false, reason: "missing" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<!doctype html>", { status: 200, headers: { "content-type": "text/html" } })),
    );
    expect(await fetchJson("testland/hex.json")).toMatchObject({ ok: false, reason: "missing" });
  });

  it("returns network when fetch rejects or the server errors, and never throws", async () => {
    mockFetch({ "regions.json": "NETWORK", "methods.json": { status: 500 } });
    await expect(fetchJson("regions.json")).resolves.toMatchObject({ ok: false, reason: "network" });
    await expect(fetchJson("methods.json")).resolves.toMatchObject({ ok: false, reason: "network" });
  });

  it("caches by path", async () => {
    const fn = mockFetch({ "regions.json": regionsJson() });
    await fetchJson("regions.json");
    await fetchJson("regions.json");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("marks sample data when a row has kind sample", async () => {
    mockFetch({ "testland/weekly.json": weeklyJson("sample") });
    await fetchJson("testland/weekly.json");
    expect(getSampleState()).toBe(true);
  });
});

describe("schemas", () => {
  it("maps paths to schema names and has a schema for every contract file", () => {
    expect(schemaNameForPath("punjab/weekly.json")).toBe("weekly");
    expect(schemaNameForPath("punjab/outline.geojson")).toBe("outline");
    for (const name of [
      "regions", "weekly", "monthly", "daily", "climatology", "season", "trend", "ruler", "nowcast", "hex",
      "calibration", "outline", "downloads", "methods", "manifest",
    ]) {
      expect(getSchema(name), name).toBeTruthy();
    }
  });
});
