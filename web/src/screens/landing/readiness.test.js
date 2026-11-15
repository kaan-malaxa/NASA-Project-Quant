import { describe, expect, it } from "vitest";
import { createReadiness } from "./readiness.js";
import { LOADER, loaderTimeline } from "./loaderMath.js";

const tasks = [
  { id: "data", weight: 1, word: "Loading orbit data" },
  { id: "globe", weight: 3, word: "Loading the globe" },
];
const fakeClock = () => {
  let t = 0;
  const clock = () => t;
  clock.set = (v) => (t = v);
  return clock;
};

describe("createReadiness", () => {
  it("waits for every task; progress is weighted and reaches 100% only when all are done", () => {
    const clock = fakeClock();
    const r = createReadiness(tasks, clock);
    expect(r.allDone()).toBe(false);
    expect(r.word()).toBe("Loading orbit data");
    clock.set(120);
    r.done("data");
    expect(r.progress()).toBeCloseTo(0.25, 10);
    expect(r.word()).toBe("Loading the globe");
    expect(r.allDone()).toBe(false);
    clock.set(900);
    r.done("globe");
    expect(r.allDone()).toBe(true);
    expect(r.progress()).toBe(1);
    expect(r.doneAt()).toBe(900);
    expect(r.timings()).toEqual([
      { id: "data", ok: true, ms: 120 },
      { id: "globe", ok: true, ms: 900 },
    ]);
  });

  it("a failed task counts as done, so it never holds the loader", () => {
    const r = createReadiness(tasks, fakeClock());
    r.done("data", false);
    r.done("globe");
    expect(r.allDone()).toBe(true);
    expect(r.timings()[0].ok).toBe(false);
  });

  it("ignores repeats and unknown tasks, and tells subscribers", () => {
    const r = createReadiness(tasks, fakeClock());
    let calls = 0;
    const off = r.subscribe(() => calls++);
    r.done("data");
    r.done("data");
    r.done("nope");
    expect(calls).toBe(1);
    off();
    r.done("globe");
    expect(calls).toBe(1);
  });
});

describe("ending rules (the loader's timeline fed by the tracker)", () => {
  it("both the 3 s minimum and every task: ready early still shows at least 3 s", () => {
    const tl = loaderTimeline({ now: 0, loadedAt: 400 });
    expect(tl.end).toBeGreaterThanOrEqual(3000);
  });

  it("ready late: merges when the last task finishes", () => {
    expect(loaderTimeline({ now: 0, loadedAt: 5200 }).mergeStart).toBe(5200);
  });

  it("never past the 8 s limit, even if a task is still pending", () => {
    expect(loaderTimeline({ now: 0, loadedAt: null }).mergeStart).toBe(LOADER.maxWait);
  });
});
