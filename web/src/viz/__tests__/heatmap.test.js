import { describe, expect, it } from "vitest";
import { cellStyle, isLowActivity, lowActivityThreshold } from "../cellStyle";
import { buildHeatGrid, criticalColumns, lensRows, monthStartWeeks, outsideRange } from "../heatmapData";
import { NO_DATA_FILL, UNRANKED_FILL, ZERO_FILL, activityScale, anomalyScale } from "../theme";

const wrow = (series, year, week, value, kind = "observed", source = "aqua") => ({
  series,
  year,
  week,
  value,
  lo: value,
  hi: value,
  kind,
  source,
});

const clim = (p90) => ({
  schema_version: "1.0",
  region: "t",
  baseline_years: [2003, 2025],
  unit_week: "u",
  unit_month: "u",
  weeks: Array.from({ length: 52 }, (_, i) => ({
    week: i + 1,
    min: 0,
    p10: 0,
    p25: 0,
    p50: 0,
    p75: 0,
    p90,
    max: 0,
    n_years: 23,
  })),
  months: [],
});

const fullYears = (series, years, value) =>
  years.flatMap((y) => Array.from({ length: 52 }, (_, i) => wrow(series, y, i + 1, value(y, i + 1))));

describe("buildHeatGrid", () => {
  it("one cell per row of the chosen lens (cell count)", () => {
    const rows = [
      ...fullYears("harmonized", [2003, 2004, 2005], () => 3),
      ...fullYears("aqua_raw", [2003, 2004, 2005], () => 3),
    ];
    const g = buildHeatGrid({
      rows,
      grain: "week",
      lens: "harmonized",
      mode: "activity",
      climatology: clim(10),
      unit: "u",
    });
    expect(g.cells).toHaveLength(3 * 52);
    expect(g.years).toEqual([2003, 2004, 2005]);
  });

  it("a missing row yields hatch fills only, never a colour", () => {
    const rows = [
      ...fullYears("harmonized", [2003], () => 4),
      ...Array.from({ length: 52 }, (_, i) => wrow("harmonized", 2004, i + 1, null, "missing", null)),
    ];
    for (const mode of ["activity", "anomaly"]) {
      const g = buildHeatGrid({
        rows,
        grain: "week",
        lens: "harmonized",
        mode,
        climatology: clim(10),
        unit: "u",
      });
      const missingRow = g.cells.filter((c) => c.year === 2004);
      expect(missingRow).toHaveLength(52);
      expect(missingRow.every((c) => c.style.fill === NO_DATA_FILL && c.style.state === "missing")).toBe(
        true,
      );
      expect(g.cells.filter((c) => c.year === 2003).every((c) => c.style.fill !== NO_DATA_FILL)).toBe(true);
    }
  });

  it("a missing kind is hatched even if a number is present", () => {
    const g = buildHeatGrid({
      rows: [wrow("harmonized", 2003, 1, 5, "missing")],
      grain: "week",
      lens: "harmonized",
      mode: "activity",
      climatology: clim(10),
      unit: "u",
    });
    expect(g.cells[0].style.fill).toBe(NO_DATA_FILL);
  });

  it("anomaly: SD-11 low_activity cells are neutral 'too little to rank', not orange", () => {
    // p90 = 2 (< 5) and value 3 (< 5): unranked, even though 3 beats every baseline 0.
    const rows = fullYears(
      "harmonized",
      Array.from({ length: 23 }, (_, i) => 2003 + i),
      (y) => (y === 2025 ? 3 : 0),
    );
    const g = buildHeatGrid({
      rows,
      grain: "week",
      lens: "harmonized",
      mode: "anomaly",
      climatology: clim(2),
      configuration: {anomaly:{low_activity_threshold:5},timebins:{week_days:7,weeks_per_year:52}},
      unit: "u",
    });
    const cell = g.cells.find((c) => c.year === 2025 && c.period === 10);
    expect(cell.unranked).toBe(true);
    expect(cell.style.state).toBe("unranked");
    expect(cell.style.fill).toBe(UNRANKED_FILL);
    // With a busier climatology the same cell is ranked (top of the baseline → orange end).
    const g2 = buildHeatGrid({
      rows,
      grain: "week",
      lens: "harmonized",
      mode: "anomaly",
      climatology: clim(50),
      baselineRows: fullYears("harmonized", Array.from({length:23},(_,i)=>2003+i), (year)=>year===2025?3:50),
      configuration: {anomaly:{low_activity_threshold:5},timebins:{week_days:7,weeks_per_year:52}},
      unit: "u",
    });
    const c2 = g2.cells.find((c) => c.year === 2025 && c.period === 10);
    expect(c2.unranked).toBe(false);
    expect(c2.percentile).toBeCloseTo((100 * 0.5) / 23, 6);
  });

  it("dims cells outside the range", () => {
    const rows = fullYears("harmonized", [2010], () => 1);
    const g = buildHeatGrid({
      rows,
      grain: "week",
      lens: "harmonized",
      mode: "activity",
      climatology: clim(10),
      range: { from: "2010-03-01", to: "2010-03-31" },
      unit: "u",
    });
    const inside = g.cells.filter((c) => !c.outside).map((c) => c.period);
    expect(inside).toEqual([9, 10, 11, 12, 13]);
  });

  it("era strip source is the row's dominant source", () => {
    const rows = [
      ...fullYears("harmonized", [2022], () => 1),
      ...Array.from({ length: 52 }, (_, i) => wrow("harmonized", 2023, i + 1, 1, "harmonized", "snpp")),
    ];
    const g = buildHeatGrid({
      rows,
      grain: "week",
      lens: "harmonized",
      mode: "activity",
      climatology: clim(10),
      unit: "u",
    });
    expect(g.rowSource.get(2022)).toBe("aqua");
    expect(g.rowSource.get(2023)).toBe("snpp");
  });
});

describe("naive_splice lens", () => {
  it("takes aqua_raw before 2012 and viirs_raw from 2012", () => {
    const rows = [
      wrow("aqua_raw", 2011, 1, 1),
      wrow("viirs_raw", 2011, 1, 100, "missing", null),
      wrow("aqua_raw", 2012, 1, 2),
      wrow("viirs_raw", 2012, 1, 200, "observed", "snpp"),
      wrow("harmonized", 2012, 1, 9),
    ];
    const picked = lensRows(rows, "naive_splice");
    expect(picked.map((r) => [r.year, r.series])).toEqual([
      [2011, "aqua_raw"],
      [2012, "viirs_raw"],
    ]);
  });
});

describe("cellStyle", () => {
  const scales = { activity: activityScale(10), anomaly: anomalyScale() };
  it("zero is the zero style, distinct from the lowest non-zero", () => {
    expect(cellStyle({ value: 0, kind: "observed" }, "activity", scales).fill).toBe(ZERO_FILL);
    expect(cellStyle({ value: 0.01, kind: "observed" }, "activity", scales).fill).not.toBe(ZERO_FILL);
  });
  it("estimated: same fill, lighter, dashed outline", () => {
    const o = cellStyle({ value: 5, kind: "observed" }, "activity", scales);
    const e = cellStyle({ value: 5, kind: "estimated" }, "activity", scales);
    expect(e.fill).toBe(o.fill);
    expect(e.fillOpacity).toBeLessThan(o.fillOpacity);
    expect(e.strokeDasharray).toBeTruthy();
  });
  it("is a pure function: same input, equal style object (clock = heatmap)", () => {
    const a = cellStyle({ value: 7, kind: "harmonized", percentile: 80 }, "anomaly", scales);
    const b = cellStyle({ value: 7, kind: "harmonized", percentile: 80 }, "anomaly", scales);
    expect(a).toEqual(b);
  });
});

describe("low activity rule (SD-11)", () => {
  it("needs both x and p90 below the threshold", () => {
    expect(isLowActivity(3, 2, 5)).toBe(true);
    expect(isLowActivity(8, 2, 5)).toBe(false);
    expect(isLowActivity(3, 6, 5)).toBe(false);
    expect(isLowActivity(3, undefined, 5)).toBe(false);
  });
  it("week threshold is 5; a month scales it by its length", () => {
    expect(lowActivityThreshold("week", 10, 5)).toBe(5);
    expect(lowActivityThreshold("month", 1, 5)).toBeCloseTo((5 * 31) / 7, 9);
    expect(lowActivityThreshold("month", 2, 5)).toBeCloseTo((5 * 28) / 7, 9);
  });
});

describe("calendar helpers", () => {
  it("critical weeks → months containing any critical week", () => {
    expect([...criticalColumns("week", [43, 44])]).toEqual([43, 44]);
    // week 44 = 29 Oct – 4 Nov (non-leap reference) → October and November
    expect([...criticalColumns("month", [44])].sort((a, b) => a - b)).toEqual([10, 11]);
    expect([...criticalColumns("month", [])]).toEqual([]);
  });
  it("month labels start at the right week", () => {
    const m = monthStartWeeks();
    expect(m[0]).toEqual({ month: 1, week: 1 });
    expect(m[11]).toEqual({ month: 12, week: 48 });
  });
  it("outsideRange counts partial overlap as inside", () => {
    expect(outsideRange(2010, "month", 3, { from: "2010-03-31", to: "2010-04-02" })).toBe(false);
    expect(outsideRange(2010, "month", 5, { from: "2010-03-31", to: "2010-04-02" })).toBe(true);
  });
});
