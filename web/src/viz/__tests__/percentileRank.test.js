import { describe, expect, it } from "vitest";
import { percentileRank } from "../percentile";

describe("percentileRank (SD-11)", () => {
  it("value above 22 of 23 past years → 95.65 (role file §10 check)", () => {
    const others = [...Array.from({ length: 22 }, (_, i) => i), 100];
    expect(percentileRank(50, others)).toBeCloseTo(95.652, 3);
  });

  it("counts ties as half", () => {
    // below: 1, equal: 2 → (1 + 1) / 4
    expect(percentileRank(2, [1, 2, 2, 3])).toBe(50);
    // all equal → 50
    expect(percentileRank(7, [7, 7, 7])).toBe(50);
    // one tie, two below → (2 + 0.5) / 3
    expect(percentileRank(5, [1, 2, 5])).toBeCloseTo(83.333, 3);
  });

  it("is 0 below every value and 100 above every value", () => {
    expect(percentileRank(-1, [0, 1, 2])).toBe(0);
    expect(percentileRank(10, [0, 1, 2])).toBe(100);
  });

  it("stays within [0, 100] and never decreases as value grows", () => {
    const others = [0, 0, 0, 3, 3, 8, 12, 12, 40, 41, 90];
    let prev = -Infinity;
    for (let v = -5; v <= 100; v += 0.5) {
      const p = percentileRank(v, others);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });

  it("excludes non-finite (missing) comparison values from N", () => {
    expect(percentileRank(5, [1, Number.NaN, 9])).toBe(50);
  });

  it("returns NaN when it cannot rank", () => {
    expect(percentileRank(5, [])).toBeNaN();
    expect(percentileRank(5, [Number.NaN])).toBeNaN();
    expect(percentileRank(Number.NaN, [1, 2])).toBeNaN();
  });
});
