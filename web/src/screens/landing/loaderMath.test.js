import { describe, expect, it } from "vitest";
import {
  LOADER,
  easeInOutCubic,
  fibonacciSphere,
  lineTargets,
  loaderTimeline,
  loaderYears,
  loaderParam,
  stepProgress,
  statusWord,
  loaderRule,
  isLandingHash,
  slotCount,
  yearAt,
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

describe("loaderRule: when the loader shows", () => {
  const load = (bootHash, extra = {}) =>
    loaderRule({ bootHash, used: false, reducedMotion: false, ...extra });

  it("shows on every full load of the landing page (open, refresh, new tab)", () => {
    for (const hash of ["", "#", "#/", "#/?debug=1"]) expect(load(hash)).toBe(true);
    // A refresh starts the app again: nothing is remembered between loads, so it shows again.
    expect(load("#/")).toBe(true);
  });

  it("not on in-app navigation to #/: the page was loaded on another route, or the landing load was used", () => {
    expect(load("#/r/us")).toBe(false); // opened on a region page, then clicked the logo
    expect(load("#/pick")).toBe(false);
    expect(load("#/", { used: true })).toBe(false); // landing -> picker -> landing inside the app
  });

  it("is skipped with reduced motion, unless ?loader=1 forces it", () => {
    expect(load("#/", { reducedMotion: true })).toBe(false);
    expect(load("#/?loader=1", { reducedMotion: true })).toBe(true);
    expect(load("#/", { reducedMotion: true, search: "?loader=1" })).toBe(true);
    expect(load("#/?loader=1", { used: true })).toBe(false); // still only on a real page load
  });

  it("is off with ?loader=0 or the test flag", () => {
    expect(load("#/?loader=0")).toBe(false);
    expect(load("#/", { testOff: true })).toBe(false);
    expect(load("#/?loader=1", { testOff: true })).toBe(true); // forcing wins over the test flag
  });

  it("reads the switch from the page query or the hash route", () => {
    expect(loaderParam("?loader=1", "#/")).toBe("1");
    expect(loaderParam("", "#/?loader=0")).toBe("0");
    expect(loaderParam("", "#/")).toBeNull();
    expect(isLandingHash("#/methods")).toBe(false);
  });
});

describe("loaderTimeline", () => {
  const at = (now, loadedAt, skippedAt) => loaderTimeline({ now, loadedAt, skippedAt });

  it("shows for at least 3 seconds even when everything loaded at once", () => {
    const t = at(0, 0);
    expect(t.mergeStart).toBe(LOADER.count1 + LOADER.count2);
    expect(t.end).toBeGreaterThanOrEqual(3000);
    expect(at(2999, 0).done).toBe(false);
    expect(at(t.end, 0).done).toBe(true);
  });

  it("tells the story in order: one sphere, split, merge, flatten, fade", () => {
    expect(at(500, 0).stage).toBe("single");
    expect(at(500, 0).split).toBe(0);
    expect(at(1300, 0).stage).toBe("split");
    expect(at(1700, 0).split).toBe(1);
    expect(at(2300, 0).stage).toBe("merge");
    expect(at(2700, 0).stage).toBe("flatten");
    expect(at(2950, 0).stage).toBe("fade");
  });

  it("waits for loading: the two spheres stay side by side until it is done, then merge", () => {
    expect(at(4000, null).stage).toBe("split");
    expect(at(4000, null).merge).toBe(0);
    const t = at(5000, 4500);
    expect(t.mergeStart).toBe(4500);
    expect(t.stage).toBe("merge");
  });

  it("never waits longer than 8 seconds", () => {
    const t = at(8000, null);
    expect(t.mergeStart).toBe(LOADER.maxWait);
    expect(at(t.end, null).done).toBe(true);
    expect(at(9000, 12000).mergeStart).toBe(LOADER.maxWait);
  });

  it("skip jumps straight to the fade", () => {
    const t = at(600, null, 500);
    expect(t.stage).toBe("fade");
    expect(t.fadeStart).toBe(500);
    expect(at(500 + LOADER.fade, null, 500).done).toBe(true);
    expect(t.merge).toBe(0);
  });
});

describe("loaderYears and yearAt", () => {
  const rows = (pairs) => pairs.map(([year, naive_source]) => ({ year, naive_source }));

  it("reads the first, switch and last year from ruler.json rows (unsorted is fine)", () => {
    const ruler = {
      rows: rows([
        [2005, "modis"],
        [2003, "modis"],
        [2004, "modis"],
        [2006, "snpp"],
        [2007, "snpp"],
      ]),
    };
    expect(loaderYears(ruler)).toEqual({ first: 2003, switch: 2006, last: 2007 });
  });

  it("returns null when the file or the switch is missing, so the loader runs without years", () => {
    expect(loaderYears(null)).toBeNull();
    expect(
      loaderYears({
        rows: rows([
          [2003, "modis"],
          [2004, "modis"],
        ]),
      }),
    ).toBeNull();
    expect(loaderYears({ rows: [] })).toBeNull();
  });

  it("counts up to the switch year by the split, then to the last year", () => {
    const y = { first: 2003, switch: 2012, last: 2025 };
    expect(yearAt(0, y)).toBe(2003);
    expect(yearAt(LOADER.count1 - 1, y)).toBe(2011);
    expect(yearAt(LOADER.count1, y)).toBe(2012);
    expect(yearAt(LOADER.count1 + LOADER.count2, y)).toBe(2025);
    expect(yearAt(9999, y)).toBe(2025);
    expect(yearAt(500, null)).toBeNull();
  });
});

describe("loading progress and status", () => {
  it("the shown line eases forward, never goes backwards, and reaches 100% only when loading is done", () => {
    let shown = 0;
    const seen = [];
    for (const target of [0.15, 0.15, 0.7, 0.7, 0.7, 0.15 /* a stale value must not pull it back */, 0.7]) {
      for (let i = 0; i < 10; i++) {
        shown = stepProgress(shown, target, 16);
        seen.push(shown);
      }
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(Math.max(...seen)).toBeLessThan(1);
    for (let i = 0; i < 200; i++) shown = stepProgress(shown, 1, 16);
    expect(shown).toBe(1);
  });

  it("status: the pending task's word, then 'Aligning records', then 'Ready'", () => {
    expect(statusWord({ pendingWord: "Loading Earth imagery", stage: "split" })).toBe(
      "Loading Earth imagery",
    );
    expect(statusWord({ pendingWord: null, stage: "merge" })).toBe("Aligning records");
    expect(statusWord({ pendingWord: null, stage: "flatten" })).toBe("Ready");
  });
});
