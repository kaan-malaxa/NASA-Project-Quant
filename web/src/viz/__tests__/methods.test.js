import { describe, expect, it } from "vitest";
import {
  binRadius,
  ceilingPercent,
  cleanCurve,
  doyLabel,
  doyTicks,
  driftDomain,
  excludesZero,
  seasonRows,
  theilSenLine,
  trustedMean,
  unwrapDoy,
  windowCenterDoy,
  wrapDoy,
  yearOfIso,
} from "../methodsLayout";

describe("season helpers", () => {
  it("excludesZero: only a range wholly on one side of zero is a clear shift", () => {
    expect(excludesZero({ value: -4, lo: -5.3, hi: -2.7 })).toBe(true);
    expect(excludesZero({ value: 3, lo: 1, hi: 5 })).toBe(true);
    expect(excludesZero({ value: -1, lo: -3, hi: 0.5 })).toBe(false);
    expect(excludesZero({ value: 0, lo: 0, hi: 0 })).toBe(false);
    expect(excludesZero({ value: 1, lo: null, hi: 2 })).toBe(false);
    expect(excludesZero(undefined)).toBe(false);
  });

  it("windowCenterDoy: middle day of the peak week", () => {
    expect(windowCenterDoy({ peak_week: 1 })).toBe(4);
    expect(windowCenterDoy({ peak_week: 44 })).toBe(305);
  });

  it("unwrap/wrap: a window across 31 December plots as one run", () => {
    expect(unwrapDoy(20, 360)).toBe(385);
    expect(unwrapDoy(350, 10)).toBe(-15);
    expect(unwrapDoy(200, 210)).toBe(200);
    expect(wrapDoy(385)).toBe(20);
    expect(wrapDoy(-15)).toBe(350);
    expect(wrapDoy(365)).toBe(365);
  });

  it("seasonRows: keeps missing years as missing, unwraps a year-end season", () => {
    const rows = seasonRows({
      peak_week: 52,
      by_year: [
        { year: 2004, start_doy: 350, centroid_doy: 2, end_doy: 20, kind: "observed" },
        { year: 2003, start_doy: null, centroid_doy: null, end_doy: null, kind: "missing" },
      ],
    });
    expect(rows.map((r) => r.year)).toEqual([2003, 2004]);
    expect(rows[0].missing).toBe(true);
    expect(rows[1]).toMatchObject({ start: 350, centroid: 367, end: 385, missing: false });
  });

  it("theilSenLine: intercept is the median of y − slope·x", () => {
    // y = 2x + 1 except one outlier; the median intercept ignores it.
    const pts = [
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 5 },
      { x: 3, y: 100 },
      { x: 4, y: 9 },
    ];
    expect(theilSenLine(pts, 2)).toEqual({ x0: 0, y0: 1, x1: 4, y1: 9 });
    expect(theilSenLine(pts.slice(0, 1), 2)).toBeNull();
    expect(theilSenLine(pts, null)).toBeNull();
  });

  it("doyTicks: month starts inside the range, thinned to the maximum", () => {
    expect(doyTicks(180, 280)).toEqual([182, 213, 244, 274]);
    expect(doyTicks(1, 365, 6).length).toBeLessThanOrEqual(6);
    expect(doyTicks(350, 380)).toEqual([366]); // 1 Jan of the next year
    expect(doyLabel(366)).toBe("1 Jan");
    expect(doyLabel(182)).toBe("1 Jul");
  });
});

describe("eyesight helpers", () => {
  it("ceilingPercent rounds c to a whole percent", () => {
    expect(ceilingPercent(0.82)).toBe(82);
    expect(ceilingPercent(0.825)).toBe(83);
    expect(ceilingPercent(null)).toBeNull();
  });

  it("binRadius: area grows with n, bounded", () => {
    expect(binRadius(0, 100)).toBe(2.5);
    expect(binRadius(100, 100)).toBe(9);
    expect(binRadius(400, 100)).toBe(9);
    expect(binRadius(25, 100)).toBeCloseTo(2.5 + 6.5 * 0.5);
  });

  it("cleanCurve drops non-numbers and sorts by FRP", () => {
    const c = cleanCurve([
      { frp_mw: 10, p: 0.5 },
      { frp_mw: 1, p: 0.2 },
      { frp_mw: 0, p: 0.1 },
      { frp_mw: 5, p: null },
    ]);
    expect(c.map((p) => p.frp_mw)).toEqual([1, 10]);
  });
});

describe("drift helpers", () => {
  const rows = [
    { year: 2013, k_annual: 0.4, lo: 0.3, hi: 0.5 },
    { year: 2014, k_annual: 0.6, lo: 0.5, hi: 0.7 },
    { year: 2015, k_annual: null, lo: null, hi: null },
    { year: 2023, k_annual: 0.2, lo: 0.1, hi: 0.3 },
  ];

  it("yearOfIso", () => {
    expect(yearOfIso("2022-12-31")).toBe(2022);
    expect(yearOfIso("")).toBeNull();
    expect(yearOfIso(undefined)).toBeNull();
  });

  it("trustedMean: years up to the trusted year, missing excluded", () => {
    const m = trustedMean(rows, 2022);
    expect(m.k).toBeCloseTo(0.5);
    expect(m.lo).toBeCloseTo(0.4);
    expect(m.hi).toBeCloseTo(0.6);
    expect(m).toMatchObject({ from: 2013, to: 2014, n: 2 });
    expect(trustedMean([{ year: 2013, k_annual: null }], 2022)).toBeNull();
  });

  it("driftDomain covers every value with padding and never goes below 0", () => {
    const [lo, hi] = driftDomain(rows, [trustedMean(rows, 2022)]);
    expect(lo).toBeLessThan(0.1);
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeGreaterThan(0.7);
    expect(driftDomain([], [])).toEqual([0, 1]);
  });
});
