/**
 * THE AOI ACCEPTANCE TEST (R5 prompt D1): selecting ALL cells of a region must reproduce monthly.json "harmonized"
 * within 0.5 %. Runs on whatever is in web/public/data (R1's sample data, then real data on Sunday):
 *   npx vitest run src/lib/aoi.region.test.js
 *
 * Fully covered months (every day has data and comes from the era's own sensor) must match within 0.5 %.
 * Partly covered months are reported but not failed: monthly.json scales them to a full month (SD-08) and fills Aqua
 * outage days from S-NPP (SD-05), which cells_monthly.csv (raw sums) cannot reproduce. R1's own cross-check uses
 * "every fully covered month"; R5's prompt says "every non-missing month" — see the handoff note.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { areaSeries, eraFor } from "./aoi.js";
import { parseCsv } from "@/data/csv.js";
import { addDays } from "./range.js";

// AOI_DATA_DIR (absolute path to a data/ folder) overrides the default, e.g. to run on a fabricated region.
const DATA = process.env.AOI_DATA_DIR
  ? new URL(`file://${process.env.AOI_DATA_DIR.replace(/\/?$/, "/")}`)
  : new URL("../../public/data/", import.meta.url);
const file = (p) => new URL(p, DATA);
const readJson = (p) => JSON.parse(readFileSync(file(p), "utf8"));
const TOLERANCE = 0.005;

function candidates() {
  if (!existsSync(file("regions.json"))) return [];
  return readJson("regions.json").regions.filter((r) =>
    ["cells_monthly", "monthly", "calibration"].every((f) => [...r.files, ...(r.optional_files || [])].includes(f)),
  );
}

/** "YYYYMM" -> true when every day has data and every day's source is the era's own sensor. */
function fullyCovered(daily, calibration) {
  const runs = (daily.kind_runs || []).filter((r) => r.series === "harmonized");
  const byMonth = new Map();
  const h = daily.series.harmonized;
  for (let i = 0; i < daily.n_days; i++) {
    const d = addDays(daily.start, i);
    const ym = d.slice(0, 4) + d.slice(5, 7);
    const era = eraFor(calibration, Number(d.slice(0, 4)), Number(d.slice(5, 7)));
    const run = runs.find((r) => r.from <= d && (r.to === null || d <= r.to));
    const ok = h.value[i] !== null && era && run && run.source === era.source;
    byMonth.set(ym, (byMonth.get(ym) ?? true) && Boolean(ok));
  }
  return byMonth;
}

const regions = candidates();

describe("AOI = whole region reproduces monthly.json harmonized", () => {
  if (!regions.length) it.skip("no web/public/data region with cells_monthly.csv yet (R1's sample data)", () => {});

  for (const region of regions) {
    it(`${region.id}: all cells match every fully covered month within 0.5 %`, () => {
      const csv = parseCsv(readFileSync(file(`${region.id}/cells_monthly.csv`), "utf8"), "cells_monthly");
      expect(csv.ok, csv.detail).toBe(true);
      const monthly = readJson(`${region.id}/monthly.json`);
      const calibration = readJson(`${region.id}/calibration.json`);
      const daily = existsSync(file(`${region.id}/daily.json`)) ? readJson(`${region.id}/daily.json`) : null;
      const covered = daily ? fullyCovered(daily, calibration) : null;

      const allCells = [...new Set(csv.data.map((r) => r.h3_r5))];
      const area = areaSeries({ rows: csv.data, calibration, cells: allCells, regionMonthly: monthly });
      const want = new Map(
        monthly.rows.filter((r) => r.series === "harmonized").map((r) => [`${r.year}${String(r.month).padStart(2, "0")}`, r]),
      );

      const failures = [];
      const partial = [];
      let checked = 0;
      for (const s of area) {
        const key = `${s.year}${String(s.month).padStart(2, "0")}`;
        const ref = want.get(key);
        if (!ref || ref.value === null || ref.kind === "missing") continue;
        const err = ref.value === 0 ? Math.abs(s.value) : Math.abs(s.value - ref.value) / Math.abs(ref.value);
        const isFull = covered ? covered.get(key) !== false : true;
        if (!isFull) {
          if (err > TOLERANCE) partial.push(`${key} ours=${s.value.toFixed(3)} monthly=${ref.value} (${(err * 100).toFixed(2)} %)`);
          continue;
        }
        checked++;
        if (err > TOLERANCE) failures.push(`${key} ours=${s.value.toFixed(3)} monthly=${ref.value} (${(err * 100).toFixed(2)} %)`);
      }
      console.log(`[aoi] ${region.id}: ${checked} fully covered months checked, ${failures.length} over 0.5 %; ${partial.length} partly covered months differ (not failed)`);
      if (partial.length) console.log(`[aoi] ${region.id} partly covered, first 10:\n  ${partial.slice(0, 10).join("\n  ")}`);
      expect(checked).toBeGreaterThan(0);
      expect(failures, failures.slice(0, 20).join("\n")).toEqual([]);
    });
  }
});
