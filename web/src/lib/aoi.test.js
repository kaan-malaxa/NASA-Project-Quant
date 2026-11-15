import { describe, expect, it } from "vitest";
import { latLngToCell } from "h3-js";
import { areaClimatology, areaKm2, latestRatio, monthTable, quantile, topMonths } from "./aoi.js";

describe("area summaries", () => {
  it("builds medians, the latest ratio, the table and the top months", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([], 0.5)).toBeNull();
    const series = [2003, 2004, 2005].flatMap((y, i) => [{ year: y, month: 11, value: (i + 1) * 10, kind: "observed" }]);
    series.push({ year: 2026, month: 11, value: 40, kind: "harmonized" }, { year: 2026, month: 12, value: null, kind: "missing" });
    const clim = areaClimatology(series, [2003, 2025]);
    expect(clim[10]).toMatchObject({ month: 11, p50: 20, min: 10, max: 30, n_years: 3 });
    expect(latestRatio(series, clim)).toMatchObject({ year: 2026, month: 11, value: 40, median: 20, ratio: 2 });
    expect(monthTable(series).values[2026][10]).toBe(40);
    expect(topMonths(series, { from: "2004-01-01", to: "2026-11-13" }, 2).map((s) => s.year)).toEqual([2026, 2005]);
  });

  it("measures the area", () => {
    const cell = latLngToCell(30, 75, 5);
    const km2 = areaKm2([cell]);
    expect(km2).toBeGreaterThan(200); // res-5 cells average about 250 km²
    expect(km2).toBeLessThan(300);
  });
});
