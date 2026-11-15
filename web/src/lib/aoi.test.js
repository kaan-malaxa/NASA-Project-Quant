import { describe, expect, it } from "vitest";
import { latLngToCell } from "h3-js";
import {
  aggregateCells, areaClimatology, areaKm2, areaSeries, eraFor, kFor, latestRatio, monthList, monthTable, quantile, topMonths,
} from "./aoi.js";

const A = "85283473fffffff";
const B = "85283477fffffff";

const calibration = {
  eras: [
    { from: "2003-01-01", to: "2022-12-31", source: "aqua", kind: "observed" },
    { from: "2023-01-01", to: "2025-12-31", source: "snpp", kind: "harmonized" },
    { from: "2026-01-01", to: null, source: "noaa20", kind: "harmonized" },
  ],
  k_annual: { snpp: { k: 0.5, lo: 0.45, hi: 0.55 }, noaa20: { k: 0.4, lo: 0.3, hi: 0.5 } },
  k: { snpp: [{ month: 1, k: 0.6, lo: 0.5, hi: 0.7 }], noaa20: [] },
};

const rows = [
  { h3_r5: A, ym: "202212", aqua: 10, viirs: 30 },
  { h3_r5: B, ym: "202212", aqua: 5, viirs: 100 },
  { h3_r5: A, ym: "202301", aqua: 99, viirs: 20 },
  { h3_r5: A, ym: "202302", aqua: 1, viirs: 10 },
  { h3_r5: A, ym: "202601", aqua: 0, viirs: 10 },
];

describe("aoi", () => {
  it("sums only the selected cells, per month", () => {
    expect(aggregateCells(rows, [A]).get("202212")).toEqual({ aqua: 10, viirs: 30 });
    expect(aggregateCells(rows, new Set([A, B])).get("202212")).toEqual({ aqua: 15, viirs: 130 });
  });

  it("finds eras and monthly k, falling back to the annual k", () => {
    expect(eraFor(calibration, 2022, 12).source).toBe("aqua");
    expect(eraFor(calibration, 2023, 1).source).toBe("snpp");
    expect(eraFor(calibration, 2030, 5).source).toBe("noaa20");
    expect(eraFor(calibration, 2002, 5)).toBeNull();
    expect(kFor(calibration, "snpp", 1)).toEqual({ k: 0.6, lo: 0.5, hi: 0.7 });
    expect(kFor(calibration, "snpp", 2)).toEqual({ k: 0.5, lo: 0.45, hi: 0.55 });
  });

  it("uses Aqua in the Aqua era and VIIRS x k afterwards, never adding them", () => {
    const s = areaSeries({ rows, calibration, cells: [A, B] });
    const at = (y, m) => s.find((x) => x.year === y && x.month === m);
    expect(at(2022, 12)).toEqual({ year: 2022, month: 12, value: 15, lo: 15, hi: 15, kind: "observed", source: "aqua" });
    expect(at(2023, 1)).toMatchObject({ value: 12, kind: "harmonized", source: "snpp" });
    expect(at(2023, 1).lo).toBeCloseTo(10);
    expect(at(2023, 1).hi).toBeCloseTo(14);
    expect(at(2023, 2)).toMatchObject({ value: 5 }); // annual k 0.5
    expect(at(2023, 3)).toMatchObject({ value: 0, kind: "harmonized" }); // no CSV row = zero, not missing
    expect(at(2026, 1)).toMatchObject({ value: 4, source: "noaa20" });
  });

  it("keeps the region's missing months missing", () => {
    const regionMonthly = { rows: [
      { year: 2022, month: 12, series: "harmonized", value: 15, kind: "observed" },
      { year: 2023, month: 1, series: "harmonized", value: null, kind: "missing" },
      { year: 2023, month: 1, series: "aqua_raw", value: 1, kind: "observed" },
    ] };
    expect(monthList(regionMonthly, rows)).toEqual([{ year: 2022, month: 12, missing: false }, { year: 2023, month: 1, missing: true }]);
    const s = areaSeries({ rows, calibration, cells: [A], regionMonthly });
    expect(s[1]).toMatchObject({ value: null, kind: "missing" });
  });

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
