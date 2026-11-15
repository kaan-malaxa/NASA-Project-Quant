import { describe, expect, it } from "vitest";
import {
  doyToIso,
  formatNumber,
  formatPercentile,
  formatRange,
  formatSignedPercent,
  formatWeek,
  isoToDoy,
  weekDateRange,
  weekOfDoy,
  weekToPhrase,
} from "../format";

describe("SD-08 weeks", () => {
  it("week 1 is 1–7 January", () => {
    expect(weekDateRange(2023, 1)).toEqual({ from: "2023-01-01", to: "2023-01-07" });
  });
  it("week 52 holds 8 days, 9 in leap years", () => {
    expect(weekDateRange(2023, 52)).toEqual({ from: "2023-12-24", to: "2023-12-31" });
    expect(weekDateRange(2024, 52)).toEqual({ from: "2024-12-23", to: "2024-12-31" });
  });
  it("weekOfDoy caps at 52", () => {
    expect(weekOfDoy(1)).toBe(1);
    expect(weekOfDoy(7)).toBe(1);
    expect(weekOfDoy(8)).toBe(2);
    expect(weekOfDoy(364)).toBe(52);
    expect(weekOfDoy(366)).toBe(52);
  });
  it("doy round-trips", () => {
    expect(doyToIso(2024, 60)).toBe("2024-02-29");
    expect(isoToDoy("2024-12-31")).toBe(366);
  });
  it("formats week labels", () => {
    expect(formatWeek(2023, 1)).toBe("1–7 Jan 2023");
    expect(formatWeek(2023, 52)).toBe("24–31 Dec 2023");
  });
  it("describes a week in words", () => {
    expect(weekToPhrase(1)).toBe("early January");
    expect(weekToPhrase(43)).toBe("late October");
  });
});

describe("number formatting", () => {
  it("never shows missing as zero", () => {
    expect(formatNumber(null)).toBe("no data");
    expect(formatNumber(Number.NaN)).toBe("no data");
    expect(formatNumber(0)).toBe("0");
  });
  it("adapts precision", () => {
    expect(formatNumber(812.4)).toBe("812");
    expect(formatNumber(12.34)).toBe("12.3");
    expect(formatNumber(1.234)).toBe("1.23");
    expect(formatNumber(-3.5)).toBe("−3.5");
  });
  it("ranges", () => {
    expect(formatRange(700, 900)).toBe("700–900");
    expect(formatRange(5, 5)).toBe("");
    expect(formatRange(null, 5)).toBe("");
  });
  it("signed percents and percentiles", () => {
    expect(formatSignedPercent(12)).toBe("+12%");
    expect(formatSignedPercent(-3.46)).toBe("−3.5%");
    expect(formatSignedPercent(0)).toBe("0%");
    expect(formatPercentile(95.65)).toBe("96th percentile");
    expect(formatPercentile(11)).toBe("11th percentile");
    expect(formatPercentile(22)).toBe("22nd percentile");
  });
});
