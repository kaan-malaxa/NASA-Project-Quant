import { describe, expect, it } from "vitest";
import { bundleForState } from "../gallery/states";

const weekly = {
  schema_version: "1.0",
  region: "test",
  series_meta: { harmonized: { label: "Harmonized record", unit: "u" } },
  rows: [2003, 2004, 2005].flatMap((year) =>
    [1, 2].map((week) => ({
      year,
      week,
      series: "harmonized",
      value: week === 1 ? 0 : 10,
      lo: week === 1 ? 0 : 10,
      hi: week === 1 ? 0 : 10,
      kind: "observed",
      source: "aqua",
    })),
  ),
};

describe("gallery states", () => {
  it("all_missing nulls every value (never zero) and marks kind missing", () => {
    const rows = bundleForState({ weekly }, "all_missing").weekly.rows;
    expect(rows).toHaveLength(6);
    expect(
      rows.every((r) => r.value === null && r.lo === null && r.hi === null && r.kind === "missing"),
    ).toBe(true);
  });
  it("estimated marks the last two years only and gives them a band", () => {
    const rows = bundleForState({ weekly }, "estimated").weekly.rows;
    expect(rows.filter((r) => r.kind === "estimated").map((r) => r.year)).toEqual([2004, 2004, 2005, 2005]);
    const est = rows.find((r) => r.year === 2005 && r.week === 2);
    expect([est.lo, est.hi]).toEqual([8, 12]);
  });
  it("single_year keeps the first year; empty keeps nothing", () => {
    expect(bundleForState({ weekly }, "single_year").weekly.rows.map((r) => r.year)).toEqual([2003, 2003]);
    expect(bundleForState({ weekly }, "empty").weekly.rows).toEqual([]);
  });
  it("does not mutate the input", () => {
    bundleForState({ weekly }, "all_missing");
    expect(weekly.rows[1].value).toBe(10);
  });
});
