import { describe, expect, it } from "vitest";
import { quantityLabel, trueTrend, truthCheck } from "./plantedTruth.js";

const harmonized = { pct_per_decade: 12.459, lo: 11.027, hi: 13.565 };

describe("planted truth", () => {
  it("finds the planted true trend, or null", () => {
    expect(
      trueTrend([
        { quantity: "g", truth: 1 },
        { quantity: "trend_pct_per_decade", truth: 12.512 },
      ]),
    ).toBe(12.512);
    expect(trueTrend([{ quantity: "g", truth: 1 }])).toBeNull();
    expect(trueTrend(undefined)).toBeNull();
  });

  it("writes the inside / outside sentence from the numbers", () => {
    const inside = truthCheck(12.512, harmonized);
    expect(inside.inside).toBe(true);
    expect(inside.sentence).toContain("inside the likely range");
    expect(inside.sentence).toContain("+12.5%");
    const outside = truthCheck(20, harmonized);
    expect(outside.inside).toBe(false);
    expect(outside.sentence).toContain("outside the likely range");
  });

  it("says nothing when the truth or the range is missing", () => {
    expect(truthCheck(null, harmonized)).toBeNull();
    expect(truthCheck(12, { pct_per_decade: null, lo: null, hi: null })).toBeNull();
  });

  it("labels known quantities in words and leaves unknown ids as they are", () => {
    expect(quantityLabel("peak_week_main")).toBe("Main peak week of the season");
    expect(quantityLabel("new_check")).toBe("new_check");
  });
});
