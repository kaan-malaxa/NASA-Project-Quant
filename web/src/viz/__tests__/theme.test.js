import { lab, rgb } from "d3";
import { describe, expect, it } from "vitest";
import {
  ANOMALY_NEUTRAL,
  KIND_STYLE,
  NO_DATA_FILL,
  ZERO_FILL,
  activityDomainMax,
  activityInterpolator,
  activityScale,
  anomalyScale,
} from "../theme";

describe("activityScale", () => {
  it("maps exactly 0 to the zero colour, not the lowest ramp colour", () => {
    const s = activityScale(120);
    expect(s(0)).toBe(ZERO_FILL);
    expect(s(0.001)).not.toBe(ZERO_FILL);
  });

  it("is strictly increasing in lightness on (0, max]", () => {
    const max = 120;
    const s = activityScale(max);
    let prev = -Infinity;
    for (let i = 1; i <= 60; i++) {
      const l = lab(s((max * i) / 60)).l;
      expect(l).toBeGreaterThan(prev);
      prev = l;
    }
  });

  it("clamps above max and uses the ramp ends [0.10, 0.98]", () => {
    const s = activityScale(10);
    expect(s(10)).toBe(s(1000));
    expect(rgb(s(10)).formatHex()).toBe(rgb(activityInterpolator(1)).formatHex());
  });

  it("never colours a non-number (missing is hatched)", () => {
    expect(activityScale(10)(Number.NaN)).toBe(NO_DATA_FILL);
  });

  it("survives a zero or invalid max", () => {
    expect(activityScale(0)(0.5)).toMatch(/^rgb|^#/);
    expect(activityScale(Number.NaN)(0.5)).toMatch(/^rgb|^#/);
  });
});

describe("activityDomainMax", () => {
  it("is the p99 of finite values, ignoring missing", () => {
    const values = Array.from({ length: 101 }, (_, i) => i);
    values.push(null, Number.NaN);
    expect(activityDomainMax(values)).toBeCloseTo(99, 6);
  });
  it("falls back to 1 when nothing is positive", () => {
    expect(activityDomainMax([])).toBe(1);
    expect(activityDomainMax([0, 0, null])).toBe(1);
  });
});

describe("anomalyScale", () => {
  const s = anomalyScale();

  it("maps the 50th percentile to the neutral colour", () => {
    expect(s(50)).toBe(ANOMALY_NEUTRAL);
    const c = lab(s(50));
    // Neutral = light and nearly without hue (PuOr's midpoint is #f3eeea).
    expect(Math.hypot(c.a, c.b)).toBeLessThan(5);
    expect(c.l).toBeGreaterThan(90);
  });

  it("is orange for busier (high) and purple for quieter (low)", () => {
    const busy = rgb(s(100));
    const quiet = rgb(s(0));
    expect(busy.r).toBeGreaterThan(busy.b); // orange/brown
    expect(quiet.b).toBeGreaterThan(quiet.r); // purple
    expect(quiet.b).toBeGreaterThan(quiet.g);
    // Mid-range too, not just the ends.
    expect(rgb(s(80)).r).toBeGreaterThan(rgb(s(80)).b);
    expect(rgb(s(20)).b).toBeGreaterThan(rgb(s(20)).r);
  });

  it("never colours a non-number", () => {
    expect(s(Number.NaN)).toBe(NO_DATA_FILL);
  });
});

describe("KIND_STYLE", () => {
  it("missing never uses a ramp; estimated is lighter and dashed", () => {
    expect(KIND_STYLE.missing.useRamp).toBe(false);
    expect(KIND_STYLE.missing.fill).toBe(NO_DATA_FILL);
    expect(KIND_STYLE.estimated.fillOpacity).toBeLessThan(KIND_STYLE.observed.fillOpacity);
    expect(KIND_STYLE.estimated.strokeDasharray).toBeTruthy();
  });
});
