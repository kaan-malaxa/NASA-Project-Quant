import { describe, expect, it } from "vitest";
import { activePreset, computeRange, presetRange } from "./range.js";

/** Fabricated daily.json: `values` from `start`, harmonized with lo/hi = value -/+ 1. */
function daily(start, values, extra = {}) {
  return {
    start,
    configuration: {timebins:{month_min_covered_frac:0.8,year_min_covered_frac:0.9}},
    n_days: values.length,
    series: {
      harmonized: {
        unit: "Aqua-equivalent fire cell-days per day",
        value: values,
        lo: values.map((v) => (v === null ? null : v - 1)),
        hi: values.map((v) => (v === null ? null : v + 1)),
      },
      ...extra,
    },
    kind_runs: [
      { series: "harmonized", from: start, to: "2022-12-31", kind: "observed", source: "aqua" },
      { series: "harmonized", from: "2023-01-01", to: null, kind: "harmonized", source: "snpp" },
    ],
  };
}

describe("computeRange", () => {
  it("totals a fabricated series with its lo-hi", () => {
    const r = computeRange(daily("2010-01-01", [1, 2, 3, 4, 5]), { from: "2010-01-02", to: "2010-01-04" });
    expect(r).toMatchObject({ nDays: 3, nWithData: 3, nMissing: 0, total: 9, lo: 6, hi: 12, kinds: ["observed"] });
    expect(r.busiestDay).toEqual({ date: "2010-01-04", value: 4 });
  });

  it("skips and counts nulls, never treating them as zero", () => {
    const r = computeRange(daily("2010-01-01", [2, null, null, 7]), { from: "2010-01-01", to: "2010-01-04" });
    expect(r).toMatchObject({ nDays: 4, nWithData: 2, nMissing: 2, total: 9 });
    expect(r.kinds).toEqual(["observed", "missing"]);
    const allMissing = computeRange(daily("2010-01-01", [null, null]), { from: "2010-01-01", to: "2010-01-02" });
    expect(allMissing.total).toBeNull();
  });

  it("excludes incomplete years and months from the rankings and the mean", () => {
    // 2010: 365 days of 1 (complete). 2011: 365 days of 5 but 40 days missing -> 325/365 = 89 % (< 90 %, incomplete).
    const y2010 = Array(365).fill(1);
    const y2011 = Array(365).fill(5).map((v, i) => (i < 40 ? null : v));
    const r = computeRange(daily("2010-01-01", [...y2010, ...y2011]), { from: "2010-01-01", to: "2011-12-31" });
    expect(r.years.find((y) => y.year === 2011).complete).toBe(false);
    expect(r.topYears.map((y) => y.year)).toEqual([2010]);
    expect(r.busiestYear.year).toBe(2010);
    expect(r.meanPerYear).toMatchObject({ value: 365, years: [2010] });
    // Jan and Feb 2011 are (mostly) missing -> below 80 %, not ranked; Dec 2011 (all 5s) is the busiest month.
    expect(r.topMonths.some((m) => m.key === "2011-01")).toBe(false);
    expect(r.busiestMonth.key).toBe("2011-03");
    expect(r.topMonths).toHaveLength(5);
  });

  it("marks months and years cut by the range as incomplete", () => {
    const r = computeRange(daily("2010-01-01", Array(365).fill(1)), { from: "2010-01-10", to: "2010-12-31" });
    expect(r.months.find((m) => m.key === "2010-01")).toMatchObject({ days: 22, complete: false }); // 22/31 = 71 %
    expect(r.months.find((m) => m.key === "2010-02").complete).toBe(true);
    // 356/365 covered (>= 90 %) so 2010 is ranked, but it is not fully inside the range, so no mean per year.
    expect(r.years[0]).toMatchObject({ complete: true, fullyInside: false });
    expect(r.topYears.map((y) => y.year)).toEqual([2010]);
    expect(r.meanPerYear).toBeNull();
  });

  it("clips the range to the available data", () => {
    const r = computeRange(daily("2010-01-01", [1, 1, 1]), { from: "2003-01-01", to: "2030-01-01" });
    expect(r).toMatchObject({ from: "2010-01-01", to: "2010-01-03", clipped: true, nDays: 3, total: 3 });
    const outside = computeRange(daily("2010-01-01", [1]), { from: "2011-01-01", to: "2011-02-01" });
    expect(outside.empty).toBe(true);
  });

  it("handles the leap day", () => {
    const feb2024 = Array(29).fill(1);
    const r = computeRange(daily("2024-02-01", [...feb2024, 1]), { from: "2024-02-28", to: "2024-03-01" });
    expect(r.nDays).toBe(3);
    expect(r.busiestDay.date).toBe("2024-02-28");
    const full = computeRange(daily("2024-02-01", feb2024), { from: "2024-02-01", to: "2024-02-29" });
    expect(full.months[0]).toMatchObject({ key: "2024-02", days: 29, coverage: 1, complete: true });
  });

  it("falls back to harmonized for lenses not in daily.json and builds the naive splice", () => {
    const d = daily("2011-12-31", [5, 5], {
      aqua_raw: { unit: "fire cell-days per day", value: [10, 11] },
      viirs_raw: { unit: "fire cell-days per day", value: [20, 30] },
    });
    expect(computeRange(d, { lens: "viirs_equiv", from: "2011-12-31", to: "2012-01-01" })).toMatchObject({ lens: "harmonized", fellBack: true, total: 10 });
    expect(computeRange(d, { lens: "naive_splice", from: "2011-12-31", to: "2012-01-01" })).toMatchObject({ lens: "naive_splice", total: 40, kinds: ["observed"] });
  });
});

describe("presets", () => {
  const L = "2026-11-13";
  it("computes each preset relative to the last data day", () => {
    expect(presetRange("all", L)).toEqual({ from: "2003-01-01", to: L });
    expect(presetRange("last10", L)).toEqual({ from: "2016-11-14", to: L });
    expect(presetRange("viirs", L)).toEqual({ from: "2012-01-01", to: L });
    expect(presetRange("this_year", L)).toEqual({ from: "2026-01-01", to: L });
    expect(presetRange("last12m", L)).toEqual({ from: "2025-11-14", to: L });
    expect(presetRange("last10", "2024-02-29")).toEqual({ from: "2014-03-01", to: "2024-02-29" });
    expect(activePreset({ from: "2012-01-01", to: L }, L)).toBe("viirs");
    expect(activePreset({ from: "2012-01-02", to: L }, L)).toBeNull();
  });
});
