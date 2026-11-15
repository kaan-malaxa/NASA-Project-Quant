import { describe, expect, it } from "vitest";
import { HERO, ORBIT_SLACK, STORY_EXTRA_VH, easeInOut, storyLayout, storyTarget } from "./storyLayout.js";

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
    expect(L.globe).toMatchObject({ cx: 0.75, cy: 0.5 });
    expect(L.globe.scale).toBeLessThanOrEqual(0.7);
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
    orbitFraction: 1.2 / 1.42,
    orbitToEarth: 1.2,
  };

  it("hero: big Earth right of the headline, centred at 58% height, orbits fully on screen", () => {
    const { hero } = storyLayout(wide);
    expect(hero.y).toBeCloseTo(HERO.cy * 740, 6);
    expect(hero.x).toBeGreaterThanOrEqual(HERO.cx * 1280);
    expect(hero.x - hero.earthR).toBeGreaterThanOrEqual(40 + 600 + 24); // never covers the text
    const onScreen = hero.orbitR * ORBIT_SLACK; // orbits as drawn, with perspective
    expect(hero.y - onScreen).toBeGreaterThanOrEqual(0);
    expect(hero.y + onScreen).toBeLessThanOrEqual(740);
    expect(hero.x + onScreen).toBeLessThanOrEqual(1280);
    expect((2 * hero.earthR) / 740).toBeGreaterThan(0.6); // was about 0.54 before
  });

  it("moves the globe right, then shrinks it, when the headline is wider (the text never moves)", () => {
    const narrow = storyLayout({ ...wide, w: 1024 });
    expect(narrow.hero.x - narrow.hero.earthR).toBeGreaterThanOrEqual(40 + 600 + 24 - 1e-9);
    expect(narrow.hero.x + narrow.hero.orbitR * ORBIT_SLACK).toBeLessThanOrEqual(1024 - 8 + 1e-9);
    expect(narrow.hero.earthR).toBeLessThan(storyLayout(wide).hero.earthR);
  });

  it("after the move: right half, vertically centred, a little smaller than the hero, clear of the chart column", () => {
    const L = storyLayout(wide);
    expect(L.globe.y).toBe(370);
    expect(L.globe.x - L.globe.orbitR * ORBIT_SLACK).toBeGreaterThanOrEqual(1280 / 2); // the chart column keeps its width
    expect(L.globe.earthR).toBeLessThanOrEqual(L.hero.earthR);
    expect(L.globe.earthR).toBeGreaterThan(L.hero.earthR * 0.9);
    expect((2 * L.globe.earthR) / 740).toBeGreaterThan(0.55);
    // the scene scale is the orbit diameter over its natural size
    expect(L.globe.scale).toBeCloseTo((2 * L.globe.orbitR) / ((1.2 / 1.42) * 740), 10);
  });

  it("phones: the hero globe is centred below the button and the after-move globe stays centred (no sideways move)", () => {
    const L = storyLayout({
      ...base,
      w: 390,
      h: 784,
      headH: 151,
      headW: 358,
      rulerH: 330,
      chipsH: 30,
      orbitFraction: 1.2 / 1.42,
    });
    expect(L.hero.cx).toBe(0.5);
    expect(L.globe.cx).toBe(0.5);
    expect(L.hero.y - L.hero.orbitR * ORBIT_SLACK).toBeGreaterThanOrEqual(16 + 151 + 12 + 52 + 12 - 1e-9);
    expect(L.hero.x + L.hero.orbitR * ORBIT_SLACK).toBeLessThanOrEqual(390);
  });
});
