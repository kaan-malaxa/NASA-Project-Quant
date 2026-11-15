import { describe, expect, it } from "vitest";
import { percentileRank } from "../percentile";
import { crossesZero, statusFromPercentile, stripBands, stripMax, trendDomain, wrapText } from "../smallLayout";

describe("TrendBars helpers", () => {
  it("crossesZero: a range including 0 is 'no clear change'", () => {
    expect(crossesZero({ pct_per_decade: 3, lo: -4, hi: 9 })).toBe(true);
    expect(crossesZero({ pct_per_decade: 0, lo: 0, hi: 5 })).toBe(true);
    expect(crossesZero({ pct_per_decade: 20, lo: 8, hi: 30 })).toBe(false);
    expect(crossesZero({ pct_per_decade: -12, lo: -20, hi: -4 })).toBe(false);
    expect(crossesZero(undefined)).toBe(false);
  });
  it("trendDomain always contains 0 and both ranges, at least ±10", () => {
    const [lo, hi] = trendDomain([
      { pct_per_decade: 34, lo: 21, hi: 47 },
      { pct_per_decade: 2, lo: -4, hi: 9 },
    ]);
    expect(lo).toBeLessThan(-4);
    expect(hi).toBeGreaterThan(47);
    expect(trendDomain([])).toEqual([-10, 10]);
  });
});

describe("PercentileStrip bands (SD-11)", () => {
  it("status thresholds", () => {
    expect(statusFromPercentile(10)).toBe("below_normal");
    expect(statusFromPercentile(25)).toBe("normal");
    expect(statusFromPercentile(75)).toBe("normal");
    expect(statusFromPercentile(76)).toBe("above_normal");
    expect(statusFromPercentile(95)).toBe("extreme");
    expect(statusFromPercentile(null)).toBe("unavailable");
  });

  it("bands are contiguous over [0, max], in status order, and agree with percentileRank", () => {
    const history = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, null, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200];
    const max = 220;
    const bands = stripBands(history, max);
    expect(bands[0].from).toBe(0);
    expect(bands[bands.length - 1].to).toBe(max);
    for (let i = 1; i < bands.length; i++) expect(bands[i].from).toBe(bands[i - 1].to);
    expect(bands.map((b) => b.status)).toEqual(["below_normal", "normal", "above_normal", "extreme"]);
    // Any value inside a band ranks into that band's status.
    const past = history.filter((v) => v !== null);
    for (const b of bands) {
      const mid = (b.from + b.to) / 2;
      expect(statusFromPercentile(percentileRank(mid, past))).toBe(b.status);
    }
  });

  it("no history → no bands; missing years are not zeros", () => {
    expect(stripBands([], 10)).toEqual([]);
    expect(stripBands([null, null], 10)).toEqual([]);
    expect(stripMax([null, 5], null, null)).toBeCloseTo(5.5, 9);
    expect(stripMax([], null, null)).toBe(1);
  });
});

describe("wrapText", () => {
  it("wraps on words within the width", () => {
    const lines = wrapText("Too little burning at this time of year to rank.", 120, 14);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe("Too little burning at this time of year to rank.");
  });
});
