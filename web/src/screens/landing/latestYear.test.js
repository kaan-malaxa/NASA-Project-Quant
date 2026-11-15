import { describe, expect, it } from "vitest";
import { compareWithBaseline, latestCompleteYear, weekStrip } from "./latestYear.js";

describe("latestCompleteYear", () => {
  it("uses the year of the last data day only when that year is complete", () => {
    expect(latestCompleteYear("2025-12-31")).toBe(2025);
    expect(latestCompleteYear("2026-11-13")).toBe(2025);
    expect(latestCompleteYear("2026-01-01")).toBe(2025);
    expect(latestCompleteYear(null)).toBeNull();
  });
});

describe("compareWithBaseline", () => {
  const annual = [2003, 2004, 2005, 2006].map((year, i) => ({
    year,
    harmonized: [10, 30, 20, 99][i],
    lo: 1,
    hi: 2,
    kind: "observed",
  }));

  it("leaves the shown year out of its own baseline", () => {
    const c = compareWithBaseline(annual, 2006, [2003, 2006]);
    expect(c.row.harmonized).toBe(99);
    expect(c.median).toBe(20); // median of 10, 30, 20 — not of all four
    expect(c).toMatchObject({ n: 3, baseline: [2003, 2006], others: true });
  });

  it("uses the whole baseline when the year is outside it, and says so", () => {
    const c = compareWithBaseline(annual, 2006, [2003, 2005]);
    expect(c.median).toBe(20);
    expect(c.others).toBe(false);
  });

  it("returns null when the year has no harmonized value", () => {
    expect(compareWithBaseline(annual, 2010, [2003, 2005])).toBeNull();
    expect(compareWithBaseline([{ year: 2006, harmonized: null }], 2006, [2003, 2005])).toBeNull();
  });
});

describe("weekStrip", () => {
  it("one slot per week; missing weeks are null, never zero", () => {
    const rows = [
      { year: 2025, week: 1, series: "harmonized", value: 5, kind: "harmonized" },
      { year: 2025, week: 3, series: "harmonized", value: 0, kind: "harmonized" },
      { year: 2025, week: 2, series: "aqua_raw", value: 9, kind: "observed" },
      { year: 2024, week: 2, series: "harmonized", value: 9, kind: "observed" },
    ];
    const s = weekStrip(rows, 2025);
    expect(s).toHaveLength(52);
    expect(s[0]).toEqual({ week: 1, value: 5, kind: "harmonized" });
    expect(s[1]).toEqual({ week: 2, value: null, kind: "missing" });
    expect(s[2].value).toBe(0); // a real zero stays a zero
  });
});
