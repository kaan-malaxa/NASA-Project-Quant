import { describe, expect, it } from "vitest";
import { cellDetail } from "./cellDetail.js";

// Stand-in for R6's percentileRank, only to check what cellDetail passes in.
const spy = (value, others) => ({ value, others: [...others].sort((a, b) => a - b) });

const row = (year, week, value, series = "harmonized", kind = "observed") => ({
  year, week, series, value, lo: value, hi: value, kind, source: "aqua",
});

describe("cellDetail", () => {
  const weekly = {
    rows: [
      row(2003, 44, 10), row(2004, 44, 20), row(2005, 44, null, "harmonized", "missing"), row(2006, 44, 40),
      row(2027, 44, 99), row(2004, 45, 77),
      row(2010, 44, 5, "aqua_raw"), row(2013, 44, 50, "viirs_raw"),
    ],
  };

  it("returns the row and ranks it among other baseline years, skipping missing", () => {
    const d = cellDetail(weekly, { year: 2004, week: 44 }, "harmonized", [2003, 2006], spy);
    expect(d).toMatchObject({ value: 20, kind: "observed", source: "aqua", grain: "week", slot: 44, nOthers: 3 });
    expect(d.percentile).toEqual({ value: 20, others: [10, 20, 40] });
  });

  it("reports a missing cell as missing with no percentile", () => {
    const d = cellDetail(weekly, { year: 2005, week: 44 }, "harmonized", [2003, 2006], spy);
    expect(d).toMatchObject({ value: null, kind: "missing", percentile: null });
  });

  it("uses the right stored series for the naive splice", () => {
    expect(cellDetail(weekly, { year: 2010, week: 44 }, "naive_splice", [2003, 2025], spy).value).toBe(5);
    expect(cellDetail(weekly, { year: 2013, week: 44 }, "naive_splice", [2003, 2025], spy).series).toBe("viirs_raw");
  });

  it("works for months and without a percentile helper", () => {
    const monthly = { rows: [{ year: 2010, month: 11, series: "harmonized", value: 3, lo: 2, hi: 4, kind: "harmonized", source: "snpp" }] };
    expect(cellDetail(monthly, { year: 2010, month: 11 }, "harmonized", [2003, 2025], undefined)).toMatchObject({
      grain: "month", slot: 11, value: 3, lo: 2, hi: 4, percentile: null,
    });
  });
});
