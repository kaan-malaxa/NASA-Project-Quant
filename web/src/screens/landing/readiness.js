/**
 * Landing readiness: the loader ends only when every task below is done (or the 8 s limit passes). A task that
 * fails counts as done (its section shows its normal fallback), so a failure never holds the loader.
 * Weights drive the progress line (the 3D chunk and the Earth texture count most); `word` is the status line while
 * that task is the first one still pending (tasks are listed in the order the visitor should read them).
 */
export const TASKS = [
  { id: "regions", weight: 2, word: "Loading orbit data" },
  { id: "manifest", weight: 1, word: "Loading orbit data" },
  { id: "ruler", weight: 2, word: "Loading orbit data" },
  { id: "methods", weight: 1, word: "Loading orbit data" },
  { id: "calibration", weight: 1, word: "Loading orbit data" },
  { id: "nowcast", weight: 1, word: "Loading orbit data" },
  { id: "latest", weight: 3, word: "Loading orbit data" }, // trend.json + weekly.json, when there is no live data
  { id: "globeChunk", weight: 24, word: "Loading the globe" },
  { id: "texture", weight: 22, word: "Loading Earth imagery" },
  { id: "scene", weight: 12, word: "Preparing the globe" },
  { id: "vizChunk", weight: 8, word: "Loading the charts" },
  { id: "charts", weight: 6, word: "Drawing the charts" },
  { id: "fonts", weight: 3, word: "Preparing the page" },
  { id: "layout", weight: 3, word: "Preparing the page" },
];

/**
 * @param {{ id: string, weight: number, word: string }[]} [tasks]
 * @param {() => number} [clock] ms
 */
export function createReadiness(tasks = TASKS, clock = () => performance.now()) {
  const start = clock();
  const state = new Map(tasks.map((t) => [t.id, null])); // null = pending, else { ok, ms }
  const total = tasks.reduce((s, t) => s + t.weight, 0) || 1;
  const subs = new Set();
  let doneAt = null;

  const tracker = {
    /** Mark a task finished (ok) or failed (counts as done). Later calls for the same task are ignored. */
    done(id, ok = true) {
      if (!state.has(id) || state.get(id) !== null) return;
      state.set(id, { ok, ms: Math.round(clock() - start) });
      if (doneAt === null && tracker.allDone()) doneAt = clock() - start;
      subs.forEach((f) => f());
    },
    isDone: (id) => state.get(id) !== null && state.get(id) !== undefined,
    allDone: () => [...state.values()].every((v) => v !== null),
    /** ms after the tracker started when the last task finished, or null. */
    doneAt: () => doneAt,
    /** 0..1, weighted. 1 only when every task is done. */
    progress() {
      if (tracker.allDone()) return 1;
      const w = tasks.reduce((s, t) => s + (state.get(t.id) !== null ? t.weight : 0), 0);
      return Math.min(0.999, w / total);
    },
    pending: () => tasks.filter((t) => state.get(t.id) === null).map((t) => t.id),
    /** The status word for the first task still pending, or null when all are done. */
    word() {
      const t = tasks.find((x) => state.get(x.id) === null);
      return t ? t.word : null;
    },
    timings: () => tasks.map((t) => ({ id: t.id, ...(state.get(t.id) ?? { ok: null, ms: null }) })),
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
  return tracker;
}
