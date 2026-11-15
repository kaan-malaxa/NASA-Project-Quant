import { describe, expect, it } from "vitest";
import {
  easeInOutCubic,
  fibonacciSphere,
  lineTargets,
  markLoaderSeen,
  projectPoint,
  shouldShowLoader,
  slotCount,
} from "./loaderMath.js";

describe("fibonacciSphere", () => {
  it("puts every point on the unit sphere, pole to pole", () => {
    const pts = fibonacciSphere(200);
    expect(pts).toHaveLength(200);
    for (const p of pts) expect(Math.hypot(...p)).toBeCloseTo(1, 10);
    expect(pts[0][1]).toBe(1);
    expect(pts[199][1]).toBe(-1);
  });
});

describe("projectPoint", () => {
  it("maps the front of the sphere to the centre and turns about the vertical axis", () => {
    expect(projectPoint([0, 0, 1], 0, 0, 100, 50, 10)).toEqual({ x: 100, y: 50, z: 1 });
    const q = projectPoint([0, 0, 1], Math.PI / 2, 0, 100, 50, 10);
    expect(q.x).toBeCloseTo(110, 10);
    expect(q.z).toBeCloseTo(0, 10);
    expect(projectPoint([0, 1, 0], 0, 0, 100, 50, 10).y).toBe(40); // up on the sphere is up on the screen
  });
});

describe("lineTargets", () => {
  it("shares the dots out left to right over evenly spaced slots", () => {
    const t = lineTargets([5, 1, 3, 9], 50, 20, 2);
    expect(t).toEqual([60, 40, 40, 60]);
    const many = lineTargets([0, 1, 2, 3, 4, 5], 0, 10, 3);
    expect([...new Set(many)]).toEqual([-5, 0, 5]);
  });

  it("chooses about one dot every 12 px, within limits", () => {
    expect(slotCount(600)).toBe(50);
    expect(slotCount(50)).toBe(16);
    expect(slotCount(5000)).toBe(64);
  });
});

describe("easeInOutCubic", () => {
  it("runs from 0 to 1 through the middle", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
  });
});

describe("shouldShowLoader", () => {
  const fakeWindow = ({ reduced = false, store = {}, broken = false } = {}) => ({
    matchMedia: () => ({ matches: reduced }),
    sessionStorage: {
      getItem: (k) => {
        if (broken) throw new Error("blocked");
        return store[k] ?? null;
      },
      setItem: (k, v) => {
        if (broken) throw new Error("blocked");
        store[k] = v;
      },
    },
  });

  it("shows once per session", () => {
    const w = fakeWindow();
    expect(shouldShowLoader(w)).toBe(true);
    markLoaderSeen(w);
    expect(shouldShowLoader(w)).toBe(false);
  });

  it("never shows with reduced motion, without a window, or when storage is blocked", () => {
    expect(shouldShowLoader(fakeWindow({ reduced: true }))).toBe(false);
    expect(shouldShowLoader(null)).toBe(false);
    const blocked = fakeWindow({ broken: true });
    expect(shouldShowLoader(blocked)).toBe(false);
    expect(() => markLoaderSeen(blocked)).not.toThrow();
  });
});
