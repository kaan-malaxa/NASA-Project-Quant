// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { spatialAreaSeries } from "./spatial.js";

const directory = resolve(process.env.AOI_DATA_DIR || fileURLToPath(new URL("../../public/data/", import.meta.url)));
const json = (path) => JSON.parse(readFileSync(resolve(directory, path), "utf8"));
const regions = json("regions.json").regions;

it("has required real region fixtures", () => expect(regions.length).toBeGreaterThan(0));
for (const region of regions) {
  it(`${region.id}: whole-region contributions match EVERY nonmissing month within 0.5%`, () => {
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
      const error = reference.value === 0 ? Math.abs(actual.value) : Math.abs(actual.value - reference.value) / Math.abs(reference.value);
      expect(error, `${reference.year}-${reference.month}: ${actual.value} vs ${reference.value}`).toBeLessThanOrEqual(0.005);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
    console.log(`[aoi] ${region.id}: ${checked} nonmissing months checked, including outages and partial coverage`);
  });
}
