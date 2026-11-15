import { describe, expect, it } from "vitest";
import {
  harmonizedSegments,
  indexDomainMax,
  isolatedIndexes,
  jumpLabel,
  missingRuns,
  rulerAriaLabel,
  separateLabels,
  sortRows,
  switchYear,
  yearTicks,
} from "../rulerLayout";

const row = (year, over = {}) => ({
  year,
  naive_index: 1,
  harmonized_index: 1,
  naive_source: year < 2012 ? "modis" : "snpp",
  kind: "observed",
  ...over,
});

describe("switchYear", () => {
  it("is the first year whose naive source changes, read from the data", () => {
    const rows = [2009, 2010, 2011, 2012, 2013].map((y) => row(y));
    expect(switchYear(rows)).toEqual({ year: 2012, source: "snpp" });
  });
  it("is null with no change or no rows", () => {
    expect(switchYear([row(2003), row(2004)])).toBeNull();
    expect(switchYear([])).toBeNull();
  });
});

describe("yearTicks", () => {
  it("every 5 years", () => {
    expect(yearTicks(2003, 2025)).toEqual([2005, 2010, 2015, 2020, 2025]);
  });
  it("falls back for short spans and single years", () => {
    expect(yearTicks(2011, 2013)).toEqual([2011, 2013]);
    expect(yearTicks(2007, 2007)).toEqual([2007]);
  });
});

describe("indexDomainMax", () => {
  it("is 1.1 × the largest index, ignoring missing", () => {
    expect(
      indexDomainMax([
        row(2003, { naive_index: 2 }),
        row(2004, { naive_index: null, harmonized_index: null }),
      ]),
    ).toBeCloseTo(2.2, 9);
  });
  it("is at least 1.2 (y starts at 0 and 1.0 is never the top)", () => {
    expect(indexDomainMax([])).toBe(1.2);
    expect(indexDomainMax([row(2003, { naive_index: 0, harmonized_index: 0 })])).toBe(1.2);
  });
});

describe("harmonizedSegments", () => {
  it("splits on estimated and joins neighbouring segments", () => {
    const rows = [
      row(2020),
      row(2021),
      row(2022, { kind: "estimated" }),
      row(2023, { kind: "estimated" }),
      row(2024),
    ];
    const segs = harmonizedSegments(rows);
    expect(segs.map((s) => [s.estimated, s.rows.map((r) => r.year)])).toEqual([
      [false, [2020, 2021]],
      [true, [2021, 2022, 2023]],
      [false, [2023, 2024]],
    ]);
  });
  it("one segment when nothing is estimated; none when empty", () => {
    expect(harmonizedSegments([row(2003), row(2004)])).toHaveLength(1);
    expect(harmonizedSegments([])).toEqual([]);
  });
});

describe("missingRuns", () => {
  it("merges consecutive missing years; null indices count as missing", () => {
    const rows = [
      row(2003),
      row(2004, { kind: "missing", naive_index: null, harmonized_index: null }),
      row(2005, { naive_index: null, harmonized_index: null }),
      row(2006),
      row(2007, { kind: "missing" }),
    ];
    expect(missingRuns(rows)).toEqual([
      { from: 2004, to: 2005 },
      { from: 2007, to: 2007 },
    ]);
  });
});

describe("isolatedIndexes", () => {
  it("finds points a line cannot draw", () => {
    expect(isolatedIndexes([1, null, 2, null, null, 3, 4])).toEqual([0, 2]);
    expect(isolatedIndexes([5])).toEqual([0]);
  });
});

describe("separateLabels", () => {
  it("leaves far-apart labels alone", () => {
    expect(separateLabels([10, 100], 16, 0, 200)).toEqual([10, 100]);
  });
  it("pushes close labels apart, keeping input order", () => {
    const [a, b] = separateLabels([50, 45], 16, 0, 200);
    expect(Math.abs(a - b)).toBeGreaterThanOrEqual(16);
    expect(a).toBeGreaterThan(b);
  });
  it("stays inside the bounds", () => {
    const out = separateLabels([198, 199], 16, 0, 200);
    expect(Math.max(...out)).toBeLessThanOrEqual(200);
    expect(Math.abs(out[0] - out[1])).toBeGreaterThanOrEqual(16);
  });
});

describe("jumpLabel", () => {
  const j = { value: 1.94, lo: 1.6, hi: 2.21, years: [2013, 2022], definition: "Def." };
  it("formats ×value with the range in the title", () => {
    const l = jumpLabel(j);
    expect(l.text).toBe("×1.9");
    expect(l.title).toBe("Jump multiple ×1.9, range 1.6–2.2, 2013–2022. Def.");
  });
  it("is null for an unusable value (placeholder 0, NaN, absent)", () => {
    expect(jumpLabel({ ...j, value: 0 })).toBeNull();
    expect(jumpLabel({ ...j, value: Number.NaN })).toBeNull();
    expect(jumpLabel(undefined)).toBeNull();
  });
});

describe("rulerAriaLabel", () => {
  const base = { index_base_years: [2003, 2011], rows: [] };
  it("uses the pipeline sentence", () => {
    expect(rulerAriaLabel({ ...base, sentence: "The sentence." }, [])).toBe("The sentence.");
  });
  it("falls back for a placeholder sentence, from data only", () => {
    const rows = sortRows([row(2025), row(2003)]);
    expect(rulerAriaLabel({ ...base, sentence: "…" }, rows)).toContain("2003 to 2025");
    expect(rulerAriaLabel({ ...base, sentence: "" }, [])).toContain("no data");
  });
});
