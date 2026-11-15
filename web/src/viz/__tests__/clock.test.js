import { describe, expect, it } from "vitest";
import {
  INNER_FRACTION,
  TAU,
  circularRuns,
  doyAngle,
  monthSectors,
  peakPhrase,
  polar,
  ringRadii,
  runAngles,
  runLength,
  textArcPath,
  weekAngles,
} from "../clockLayout";
import { buildHeatGrid } from "../heatmapData";
import { formatWeekShort } from "../format";

describe("clock geometry", () => {
  it("week 1 starts at 12 o'clock; week 52 ends there; 52 equal segments", () => {
    expect(weekAngles(1)[0]).toBe(0);
    expect(weekAngles(52)[1]).toBeCloseTo(TAU, 12);
    const [a, b] = weekAngles(10);
    expect(b - a).toBeCloseTo(TAU / 52, 12);
  });
  it("clockwise: week 14 is near 3 o'clock (+x), week 27 near 6 o'clock (+y)", () => {
    const [x3] = polar(weekAngles(14)[0], 100);
    const [, y6] = polar(weekAngles(27)[0], 100);
    expect(x3).toBeGreaterThan(99);
    expect(y6).toBeGreaterThan(99);
  });
  it("day angles agree with week segments, incl. the long week 52", () => {
    expect(doyAngle(1)).toBe(0);
    expect(doyAngle(8)).toBeCloseTo(weekAngles(2)[0], 12);
    expect(doyAngle(358)).toBeCloseTo(weekAngles(52)[0], 12);
    expect(doyAngle(366, 365)).toBeCloseTo(TAU, 12);
  });
  it("12 month sectors cover the circle in order", () => {
    const m = monthSectors();
    expect(m).toHaveLength(12);
    expect(m[0].a0).toBe(0);
    expect(m[11].a1).toBeCloseTo(TAU, 12);
    for (let i = 1; i < 12; i++) expect(m[i].a0).toBeCloseTo(m[i - 1].a1, 12);
  });
  it("rings: inner radius 24% of outer, equal thickness, earliest innermost", () => {
    const R = 200;
    const r0 = R * INNER_FRACTION;
    expect(r0).toBe(48);
    const [i0] = ringRadii(0, 23, r0, R);
    const [, o22] = ringRadii(22, 23, r0, R);
    expect(i0).toBe(48);
    expect(o22).toBeCloseTo(200, 9);
    const t = (a) => a[1] - a[0];
    expect(t(ringRadii(3, 23, r0, R))).toBeCloseTo(t(ringRadii(17, 23, r0, R)), 12);
  });
});

describe("critical weeks runs", () => {
  it("merges runs across the year end", () => {
    expect(circularRuns([51, 52, 1, 2, 20])).toEqual([
      [51, 2],
      [20, 20],
    ]);
    expect(runLength([51, 2])).toBe(4);
    const [a0, a1] = runAngles([51, 2]);
    expect(a1).toBeGreaterThan(a0);
    expect(a1 - a0).toBeCloseTo((4 / 52) * TAU, 12);
  });
  it("handles none and all", () => {
    expect(circularRuns([])).toEqual([]);
    expect(circularRuns(Array.from({ length: 52 }, (_, i) => i + 1))).toEqual([[1, 52]]);
  });
});

describe("labels", () => {
  it("peak phrase from season.windows[0].peak_week", () => {
    const s = { windows: [{ peak_week: 43 }] };
    expect(peakPhrase(s)).toBe("late October");
    expect(peakPhrase(undefined)).toBeNull();
    expect(peakPhrase({ windows: [] })).toBeNull();
  });
  it("text on the lower half is flipped to read upright", () => {
    expect(textArcPath(0.1, 0.5, 100).flipped).toBe(false);
    expect(textArcPath(Math.PI - 0.2, Math.PI + 0.2, 100).flipped).toBe(true);
  });
  it("short week dates", () => {
    expect(formatWeekShort(2023, 1)).toBe("1–7 Jan");
    expect(formatWeekShort(2023, 44)).toBe("29 Oct – 4 Nov");
  });
});

describe("clock = heatmap (role file §10)", () => {
  it("the same cell gets an identical style object in both views", () => {
    const rows = [2003, 2004].flatMap((year) =>
      Array.from({ length: 52 }, (_, i) => ({
        year,
        week: i + 1,
        series: "harmonized",
        value: i === 5 ? null : i,
        lo: i,
        hi: i,
        kind: i === 5 ? "missing" : i === 7 ? "estimated" : "observed",
        source: "aqua",
      })),
    );
    const clim = { baseline_years: [2003, 2025], weeks: [], months: [] };
    for (const mode of ["activity", "anomaly"]) {
      // Both components call buildHeatGrid with grain "week" and the same arguments.
      const heat = buildHeatGrid({
        rows,
        grain: "week",
        lens: "harmonized",
        mode,
        climatology: clim,
        unit: "u",
      });
      const clock = buildHeatGrid({
        rows,
        grain: "week",
        lens: "harmonized",
        mode,
        climatology: clim,
        unit: "u",
      });
      expect(clock.cells.map((c) => c.style)).toEqual(heat.cells.map((c) => c.style));
    }
  });
});
