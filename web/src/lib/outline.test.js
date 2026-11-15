import { describe, expect, it } from "vitest";
import { outlinePath } from "./outline.js";

const square = (x0, y0, s) => [[[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s], [x0, y0]]];

describe("outlinePath", () => {
  it("fits an equator square into the box, centred, north up", () => {
    const fc = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: square(0, 0, 1) } }] };
    // 100x100 box, pad 10 -> scale 80; cos(0.5deg) ~ 0.99996, so x span ~80
    const { d } = outlinePath(fc, 100, 100, 10);
    expect(d.startsWith("M10,90L90,90L90,10L10,10L10,90Z")).toBe(true);
  });

  it("shrinks longitude by cos(latitude)", () => {
    // 2deg wide x 1deg tall at 60N: x span = 2*cos(60.5deg) ~ 0.985 -> nearly square
    const { d } = outlinePath({ type: "Polygon", coordinates: square(10, 60, 1).map((r) => r.map(([x, y]) => [10 + (x - 10) * 2, y])) }, 100, 100, 0);
    const xs = [...d.matchAll(/[ML]([\d.]+),/g)].map((m) => Number(m[1]));
    const width = Math.max(...xs) - Math.min(...xs);
    expect(width).toBeGreaterThan(95);
    expect(width).toBeLessThanOrEqual(100);
  });

  it("draws every ring of a MultiPolygon and returns null for nothing", () => {
    const mp = { type: "MultiPolygon", coordinates: [square(0, 0, 1), square(5, 5, 1)] };
    expect((outlinePath(mp).d.match(/M/g) || []).length).toBe(2);
    expect(outlinePath(null)).toBeNull();
    expect(outlinePath({ type: "FeatureCollection", features: [] })).toBeNull();
  });
});
