import { describe, expect, it } from "vitest";
import { fmtAsOf, fmtSignedPct, monthName, ordinal } from "./format.js";

describe("format", () => {
  it("formats signed percentages", () => {
    expect(fmtSignedPct(12.34)).toBe("+12.3%");
    expect(fmtSignedPct(-4)).toBe("−4%");
    expect(fmtSignedPct(0)).toBe("0%");
    expect(fmtSignedPct(null)).toBe("no data");
  });
  it("formats ordinals, months and UTC times", () => {
    expect([1, 2, 3, 11, 12, 13, 21, 87, 100].map(ordinal)).toEqual(["1st", "2nd", "3rd", "11th", "12th", "13th", "21st", "87th", "100th"]);
    expect(monthName(11)).toBe("November");
    expect(fmtAsOf("2026-11-15T12:00:00Z").utc).toBe("2026-11-15 12:00 UTC");
  });
});
