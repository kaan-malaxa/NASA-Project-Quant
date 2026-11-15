import { describe, expect, it } from "vitest";
import { VIEW, arrowsGeometry, switchX } from "./sensorArrows.js";

const years = { first: 2003, switch: 2012, last: 2025 };

describe("switchX", () => {
  it("places the switch year on the axis from the JSON years, or in the middle without them", () => {
    expect(switchX(years)).toBeCloseTo(VIEW.left + (520 * 9) / 22, 10);
    expect(switchX(null)).toBe(300);
  });
});

describe("arrowsGeometry", () => {
  it("starts with nothing drawn, and only the axis years from the JSON", () => {
    const g = arrowsGeometry({ intro: 0, merge: 0, years });
    expect(g.modis.x2).toBe(VIEW.left);
    expect(g.viirs.opacity).toBe(0);
    expect(g.ticks.map((t) => t.label)).toEqual(["2003", "2012", "2025"]);
    expect(arrowsGeometry({ intro: 0, merge: 0, years: null }).ticks).toEqual([]);
  });

  it("collides at the switch year, on one level", () => {
    const g = arrowsGeometry({ intro: 0.55, merge: 0, years });
    const sx = switchX(years);
    expect(g.modis.x2).toBeCloseTo(sx, 6);
    expect(g.viirs.x2).toBeCloseTo(sx, 6);
    expect(g.viirs.y).toBe(VIEW.lowY);
    expect(g.spark.opacity).toBeGreaterThan(0.9);
  });

  it("settles apart with a gap and a step: VIIRS higher, the jump bracketed", () => {
    const g = arrowsGeometry({ intro: 1, merge: 0, years });
    const sx = switchX(years);
    expect(g.modis.x2).toBeCloseTo(sx - VIEW.gap, 6);
    expect(g.viirs.x2).toBeCloseTo(sx + VIEW.gap, 6);
    expect(g.viirs.y).toBe(VIEW.highY);
    expect(g.bracket).toMatchObject({ opacity: 1, y1: VIEW.highY, y2: VIEW.lowY });
    expect(g.settled).toBe(true);
  });

  it("solution: VIIRS comes down onto the MODIS scale and the two join into one harmonized arrow", () => {
    const mid = arrowsGeometry({ intro: 1, merge: 0.5, years });
    expect(mid.viirs.y).toBeGreaterThan(VIEW.highY);
    expect(mid.viirs.y).toBeLessThan(VIEW.lowY);
    const g = arrowsGeometry({ intro: 1, merge: 1, years });
    expect(g.viirs.y).toBe(VIEW.lowY);
    expect(g.modis.x2).toBeCloseTo(switchX(years), 6);
    expect(g.joined.opacity).toBe(1);
    expect(g.modis.opacity).toBe(0);
    expect(g.bracket.opacity).toBe(0);
    expect(g.labels.harmonized.opacity).toBe(1);
    // starting the move before the intro finished still starts from the settled picture
    expect(arrowsGeometry({ intro: 0.2, merge: 0.01, years }).viirs.opacity).toBeGreaterThan(0);
  });
});
