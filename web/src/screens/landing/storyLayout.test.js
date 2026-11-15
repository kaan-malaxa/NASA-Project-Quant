import { describe, expect, it } from "vitest";
import {
  HERO,
  ORBIT_SLACK,
  STORY_EXTRA_VH,
  heroGlobe,
  easeInOut,
  storyLayout,
  storyTarget,
} from "./storyLayout.js";

const base = { headH: 228, headW: 896, ctaH: 52, rulerH: 380, chipsH: 36, orbitFraction: 0.88 };

describe("storyTarget and easeInOut", () => {
  it("does not move before the threshold, then heads all the way to the end state", () => {
    expect(storyTarget(-60, 800, 0)).toBe(0);
    expect(storyTarget(0.19 * 800, 800, 0)).toBe(0);
    expect(storyTarget(0.2 * 800, 800, 0)).toBe(1);
    expect(storyTarget(3 * 800, 800, 0)).toBe(1);
  });

  it("goes back only below the lower line, so it does not flip around one point", () => {
    expect(storyTarget(0.15 * 800, 800, 1)).toBe(1);
    expect(storyTarget(0.08 * 800, 800, 1)).toBe(0);
    expect(storyTarget(0.15 * 800, 800, 0)).toBe(0);
    expect(storyTarget(100, 0, 1)).toBe(1);
  });

  it("eases from 0 to 1 through the middle, and the section has room to hold the end state", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 10);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(2)).toBe(1);
    expect(easeInOut(0.25)).toBeLessThan(0.25);
    expect(STORY_EXTRA_VH).toBeCloseTo(1.2, 10);
  });
});

describe("storyLayout", () => {
  it("on a laptop puts the headline bottom-left first, then top-left with the ruler and button below it", () => {
    const L = storyLayout({ ...base, w: 1280, h: 740 });
    expect(L.mobile).toBe(false);
    // state 1: button above the satellite row, headline above the button
    expect(L.ctaY0).toBe(740 - 40 - 36 - 24 - 52);
    expect(L.headY0).toBe(L.ctaY0 - 24 - 228);
    // state 2: headline scaled into the left half, ruler under it, button under the ruler
    expect(L.headS1).toBeCloseTo(0.55, 10);
    expect(L.rulerTop).toBeCloseTo(40 + 228 * 0.55 + 24, 10);
    expect(L.ctaY1).toBeCloseTo(L.rulerTop + 380 + 24, 10);
    expect(L.globe.cy).toBe(0.5);
    expect(L.globe.cx).toBeCloseTo(0.75, 1); // 0.75, held 8 px clear of the right edge when needed
    expect(L.fits).toBe(true);
  });

  it("shrinks the headline further when the left half is narrow", () => {
    const L = storyLayout({ ...base, w: 900, h: 740 });
    expect(L.headS1).toBeCloseTo((450 - 40 - 24) / 896, 10);
  });

  it("on a phone keeps the globe centred, shrinks it into the top and stacks the text below", () => {
    const L = storyLayout({ ...base, w: 390, h: 784, headH: 152, headW: 358, rulerH: 330, chipsH: 30 });
    expect(L.mobile).toBe(true);
    expect(L.globe.cx).toBe(0.5);
    expect(L.globe.cy).toBeCloseTo(Math.round(784 * 0.3) / 2 / 784, 10);
    expect(L.globe.scale * 0.88 * 390 * ORBIT_SLACK).toBeCloseTo(Math.round(784 * 0.3) - 40, 6);
    expect(L.headY1).toBe(Math.round(784 * 0.3));
    expect(L.rulerDx).toBe(0);
    expect(L.ctaFades).toBe(true);
    expect(L.fits).toBe(true);
  });

  it("reports that the second state does not fit on a very short screen", () => {
    expect(
      storyLayout({ ...base, w: 390, h: 520, headH: 152, headW: 358, rulerH: 330, chipsH: 30 }).fits,
    ).toBe(false);
    expect(storyLayout({ ...base, w: 1280, h: 560 }).fits).toBe(false);
  });
});

describe("globe placement", () => {
  // 1280 x 740 stage, headline kept to the left half (600 px box), outer orbit = 1.2 Earth radii.
  const wide = {
    ...base,
    w: 1280,
    h: 740,
    headW: 600,
    headH: 303,
    ctaW: 155,
    orbitFraction: 1.2 / 1.42,
    orbitToEarth: 1.2,
  };
  const textRects = (L, m) => [
    { left: 40, top: L.headY0, right: 40 + m.headW, bottom: L.headY0 + m.headH },
    { left: 40, top: L.ctaY0, right: 40 + m.ctaW, bottom: L.ctaY0 + m.ctaH },
  ];
  const clearOf = (g, rects) =>
    rects.every((r) => {
      const dx = g.x - Math.max(r.left, Math.min(g.x, r.right));
      const dy = g.y - Math.max(r.top, Math.min(g.y, r.bottom));
      return Math.hypot(dx, dy) >= g.earthR + HERO.gap - 1e-6;
    });

  it("hero: a huge planet (160 % of the height) off the bottom-right, centre on screen, never behind the text", () => {
    const L = storyLayout(wide);
    expect(2 * L.hero.earthR).toBeCloseTo(1.6 * 740, 6); // not shrunk at 1280
    expect(L.hero.x).toBeGreaterThanOrEqual(HERO.cx * 1280); // only ever moved right or down
    expect(L.hero.y).toBeGreaterThanOrEqual(HERO.cy * 740);
    expect(L.hero.x).toBeLessThanOrEqual(1280 - HERO.margin); // the centre stays inside the screen
    expect(L.hero.y).toBeLessThanOrEqual(740 - HERO.margin);
    expect(clearOf(L.hero, textRects(L, wide))).toBe(true);
  });

  it("uses the asked-for centre when the text leaves room for it", () => {
    const g = heroGlobe({
      w: 1440,
      h: 839,
      earthR: 671,
      cx: 1080,
      cy: 671,
      rects: [{ left: 40, top: 40, right: 200, bottom: 120 }],
    });
    expect(g).toMatchObject({ x: 1080, y: 671, earthR: 671, moved: false, shrunk: false });
  });

  it("moves as little as possible, and shrinks only when moving is not enough", () => {
    const rects = [{ left: 40, top: 300, right: 640, bottom: 620 }];
    const moved = heroGlobe({ w: 1280, h: 740, earthR: 592, cx: 960, cy: 592, rects });
    expect(moved.moved).toBe(true);
    expect(moved.shrunk).toBe(false);
    const cramped = heroGlobe({
      w: 800,
      h: 740,
      earthR: 592,
      cx: 600,
      cy: 592,
      rects: [{ left: 40, top: 300, right: 700, bottom: 620 }],
    });
    expect(cramped.shrunk).toBe(true);
    expect(cramped.x).toBeLessThanOrEqual(800 - HERO.margin);
  });

  it("narrower screens: still clear of the text, with the centre on screen", () => {
    const m = { ...wide, w: 1024 };
    const L = storyLayout(m);
    expect(clearOf(L.hero, textRects(L, m))).toBe(true);
    expect(L.hero.x).toBeLessThanOrEqual(1024 - HERO.margin);
  });

  it("after the move: unchanged, right half, vertically centred, clear of the chart column", () => {
    const L = storyLayout(wide);
    expect(L.globe.cx).toBeCloseTo(0.75, 1);
    expect(L.globe.x + L.globe.orbitR * ORBIT_SLACK).toBeLessThanOrEqual(1280 - 8 + 1e-9);
    expect(L.globe.y).toBe(370);
    expect(L.globe.x - L.globe.orbitR * ORBIT_SLACK).toBeGreaterThanOrEqual(1280 / 2);
    expect((2 * L.globe.earthR) / 740).toBeGreaterThan(0.55);
    // the scene scale is the orbit diameter over its natural size
    expect(L.globe.scale).toBeCloseTo((2 * L.globe.orbitR) / ((1.2 / 1.42) * 740), 10);
  });

  it("phones: Earth 120 % of the width, centre near the bottom-right, text above it", () => {
    const m = {
      ...base,
      w: 390,
      h: 784,
      headH: 151,
      headW: 358,
      ctaW: 155,
      rulerH: 330,
      chipsH: 30,
      orbitFraction: 1.2 / 1.42,
    };
    const L = storyLayout(m);
    expect(2 * L.hero.earthR).toBeCloseTo(1.2 * 390, 6);
    expect(L.hero.cx).toBeCloseTo(0.75, 6);
    expect(L.hero.cy).toBeCloseTo(0.8, 6);
    expect(L.hero.y - L.hero.earthR).toBeGreaterThan(16 + 151 + 12 + 52); // below the button
    expect(L.globe.cx).toBe(0.5); // after the move: centred at the top, as before
  });
});
