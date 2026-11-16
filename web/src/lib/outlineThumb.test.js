import { describe, expect, it } from "vitest";
import { outlineRings, outlineThumb, unwrapCentre } from "./outlineThumb.js";

const square = (x0, y0, s) => [
  [x0, y0],
  [x0 + s, y0],
  [x0 + s, y0 + s],
  [x0, y0 + s],
  [x0, y0],
];

describe("outlineThumb", () => {
  it("reads Polygon, MultiPolygon, Feature and FeatureCollection rings", () => {
    const fc = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Polygon", coordinates: [square(0, 0, 1)] } },
        {
          type: "Feature",
          geometry: { type: "MultiPolygon", coordinates: [[square(2, 2, 1)], [square(4, 4, 1)]] },
        },
      ],
    };
    expect(outlineRings(fc)).toHaveLength(3);
  });

  it("fits the outline inside the thumbnail with its padding", () => {
    const t = outlineThumb({ type: "Polygon", coordinates: [square(10, 10, 5)] }, 96, 72, 3);
    const nums = t.d.match(/-?\d+(\.\d+)?/g).map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(3 - 0.1);
    expect(Math.max(...xs)).toBeLessThanOrEqual(93 + 0.1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(3 - 0.1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(69 + 0.1);
  });

  it("keeps a region that crosses the date line in one piece", () => {
    // Two islands either side of 180°: without unwrapping they would sit at opposite edges of the world.
    const geo = { type: "MultiPolygon", coordinates: [[square(178, 50, 1)], [square(-179, 50, 1)]] };
    expect(Math.abs(unwrapCentre(outlineRings(geo)))).toBeGreaterThan(170);
    const t = outlineThumb(geo);
    const xs = t.d.match(/[ML](-?[\d.]+),/g).map((m) => Number(m.slice(1, -1)));
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(96); // fits, not stretched across the world
  });

  it("simplifies: thousands of points become a short path, tiny rings are dropped", () => {
    const dense = [];
    for (let i = 0; i <= 4000; i++) {
      const a = (i / 4000) * Math.PI * 2;
      dense.push([Math.cos(a) * 10, Math.sin(a) * 10]);
    }
    const t = outlineThumb({ type: "MultiPolygon", coordinates: [[dense], [square(30, 30, 0.0001)]] });
    expect(t.d.split("M")).toHaveLength(2); // one ring kept
    expect(t.d.length).toBeLessThan(4000);
  });

  it("returns null for an empty outline", () => {
    expect(outlineThumb({ type: "FeatureCollection", features: [] })).toBeNull();
  });
});
