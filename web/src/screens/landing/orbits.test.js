import { describe, expect, it } from "vitest";
import { cameraDistance, orbitPoint, orbitRing } from "./orbits.js";

const len = ([x, y, z]) => Math.hypot(x, y, z);

describe("orbitPoint", () => {
  it("stays at the orbit radius all the way round", () => {
    for (let a = 0; a < 7; a += 0.37) expect(len(orbitPoint(1.5, 98, 40, a))).toBeCloseTo(1.5, 10);
  });

  it("starts on the equator and a polar orbit passes over the pole a quarter turn later", () => {
    expect(orbitPoint(2, 90, 0, 0)).toEqual([2, 0, 0]);
    const [x, y, z] = orbitPoint(2, 90, 0, Math.PI / 2);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(2, 10);
    expect(z).toBeCloseTo(0, 10);
  });

  it("an equatorial orbit never leaves the equator, and the plane angle turns it about the pole", () => {
    expect(orbitPoint(1, 0, 0, 1)[1]).toBeCloseTo(0, 10);
    const [x, y, z] = orbitPoint(1, 90, 90, 0);
    expect([x, y, z].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 0, -1]);
  });

  it("a near-polar orbit reaches high latitude but not the pole itself", () => {
    const top = orbitPoint(1, 98, 0, Math.PI / 2)[1];
    expect(top).toBeGreaterThan(0.98);
    expect(top).toBeLessThan(1);
  });
});

describe("orbitRing and cameraDistance", () => {
  it("closes the ring", () => {
    const ring = orbitRing(1.2, 98, 10, 16);
    expect(ring).toHaveLength(17);
    ring[16].forEach((v, k) => expect(v).toBeCloseTo(ring[0][k], 10));
  });

  it("moves the camera back on narrow screens", () => {
    const wide = cameraDistance(2, 40, 16 / 9);
    expect(wide).toBeCloseTo(2 / Math.tan((20 * Math.PI) / 180), 10);
    expect(cameraDistance(2, 40, 0.5)).toBeCloseTo(wide * 2, 10);
  });
});
