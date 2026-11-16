// @vitest-environment node
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { spatialAreaSeries } from "./spatial.js";

const directory = resolve(process.env.AOI_DATA_DIR || fileURLToPath(new URL("../../public/data/", import.meta.url)));
// World-country publications are stored gzipped (losslessly); fetchJson reads both forms.
const json = (path) => {
  const bytes = readFileSync(resolve(directory, path));
  return JSON.parse((bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString("utf8"));
};
const regions = json("regions.json").regions;
// Each per-cell contribution is published at 3 decimals (up to ±0.0005 each), so a sum over a region's cells can
// differ from the regional series by up to 0.0005 × cells of rounding. Values are compared within 0.5%, or within
// that worst-case rounding bound, whichever is larger; the bound only matters for low-activity months.
const withinTolerance = (actual, reference, nCells) =>
  Math.abs(actual - reference) <= Math.max(0.005 * Math.abs(reference), 0.0005 * nCells);

it("has required real region fixtures", () => expect(regions.length).toBeGreaterThan(0));
for (const region of regions) {
  it(`${region.id}: whole-region contributions match EVERY nonmissing month within 0.5% (or the 3-decimal rounding bound)`, { timeout: 120000 }, () => {
    expect(region.files).toContain("spatial_index");
    const index = json(`${region.id}/spatial_index.json`);
    const shards = index.years.map((entry) => json(`${region.id}/${entry.path}`));
    const cells = [...new Set(shards.flatMap((shard) => shard.cells))];
    const monthly = json(`${region.id}/monthly.json`);
    const area = spatialAreaSeries({shards, cells});
    const byMonth = new Map(area.map((row) => [`${row.year}-${row.month}`, row]));
    let checked = 0;
    for (const reference of monthly.rows.filter((row) => row.series === "harmonized" && row.value !== null && row.kind !== "missing")) {
      const actual = byMonth.get(`${reference.year}-${reference.month}`);
      expect(actual, `missing ${reference.year}-${reference.month}`).toBeDefined();
      expect(withinTolerance(actual.value, reference.value, cells.length), `${reference.year}-${reference.month}: ${actual.value} vs ${reference.value}`).toBe(true);
      for (const bound of ["lo", "hi"]) {
        if (reference[bound] === null) continue;
        expect(withinTolerance(actual[bound], reference[bound], cells.length), `${reference.year}-${reference.month} ${bound}: ${actual[bound]} vs ${reference[bound]}`).toBe(true);
      }
      expect(actual.kind).toBe(reference.kind);
      expect(actual.source).toBe(reference.source);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
    console.log(`[aoi] ${region.id}: ${checked} nonmissing months checked, including outages and partial coverage`);
  });
}
