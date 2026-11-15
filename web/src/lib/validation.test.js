import { describe, expect, it } from "vitest";
import { compareToBaselines, groupByRegion } from "./validation.js";
import { TEST_INFO, testLabel } from "./labels.js";

const ALL_TESTS = [
  "loyo_weekly_wape", "loyo_weekly_r", "loyo_bias", "handoff_annual_mape", "step_naive", "step_harmonized",
  "sat_agreement_wape", "k_direct_vs_chained_pct", "backcast_weekly_wape", "t1_t2_wape", "reliability_err",
  "saturation_r5", "saturation_r6",
];

describe("validation helpers", () => {
  it("has a plain label for every test id in the contract", () => {
    for (const t of ALL_TESTS) expect(testLabel(t), t).not.toBe(t);
    expect(Object.keys(TEST_INFO).sort()).toEqual([...ALL_TESTS].sort());
  });

  it("says which is lower for lower-is-better tests", () => {
    const row = { test: "loyo_weekly_wape", value: 0.2, baselines: { raw_viirs: 0.9, annual_ratio: 0.15 } };
    expect(compareToBaselines(row)).toEqual({ ours: 0.2, beats: ["raw_viirs"], loses: ["annual_ratio"], lowest: false, abs: false });
    expect(compareToBaselines({ ...row, value: 0.1 }).lowest).toBe(true);
  });

  it("compares absolute size for closer-to-zero tests, and skips tests without a direction or baselines", () => {
    expect(compareToBaselines({ test: "loyo_bias", value: -0.05, baselines: { raw_viirs: 0.5 } }).lowest).toBe(true);
    expect(compareToBaselines({ test: "loyo_weekly_r", value: 0.9, baselines: { raw_viirs: 0.5 } })).toBeNull();
    expect(compareToBaselines({ test: "loyo_weekly_wape", value: 0.2 })).toBeNull();
    expect(compareToBaselines({ test: "loyo_weekly_wape", value: null, baselines: { raw_viirs: 1 } })).toBeNull();
  });

  it("groups rows by region in order", () => {
    const g = groupByRegion([{ region: "b" }, { region: "a" }, { region: "b" }]);
    expect([...g.keys()]).toEqual(["b", "a"]);
    expect(g.get("b")).toHaveLength(2);
  });
});
