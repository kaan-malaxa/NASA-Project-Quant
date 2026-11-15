/**
 * Geometry for the landing loader: a sphere of dots that turns slowly, then collapses into one horizontal line of
 * dots. Drawn on a 2D canvas (no three.js), so the loader stays tiny and can live in the main bundle.
 */

/** `n` points spread evenly over a unit sphere (Fibonacci lattice). Deterministic. */
export function fibonacciSphere(n) {
  const pts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? 0 : 1 - (2 * i) / (n - 1);
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = golden * i;
    pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  return pts;
}

/**
 * Where each dot lands on the line. Dots are taken left to right and shared out over `slots` evenly spaced places,
 * so the line reads as separate dots, not a solid stroke.
 * @param {number[]} xs current screen x of each dot
 * @returns {number[]} target x of each dot (same order as xs)
 */
export function lineTargets(xs, cx, length, slots) {
  const order = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = new Array(xs.length);
  const step = slots > 1 ? length / (slots - 1) : 0;
  order.forEach(([, i], rank) => {
    const slot = Math.min(slots - 1, Math.floor((rank * slots) / xs.length));
    out[i] = cx - length / 2 + slot * step;
  });
  return out;
}

/** Number of dots on the line for a line length in px: about one every 12 px, between 16 and 64. */
export function slotCount(length) {
  return Math.min(64, Math.max(16, Math.round(length / 12)));
}

export function easeInOutCubic(x) {
  const c = Math.min(1, Math.max(0, x));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/**
 * The loader's story, in ms (prompt "Rebuild the loading screen"):
 *   0 .. count1                     one sphere ("MODIS"), years count up from the first year to the switch year
 *   count1 (+ split)                the sphere splits into "MODIS" and "VIIRS", sliding apart
 *   count1 .. count1 + count2       years count on to the last year, both spheres side by side
 *   mergeStart (+ merge)            once everything has loaded, the two merge into one ("Harmonized")
 *   then flat, then fade            the sphere flattens into a line of dots, the loader fades out
 * mergeStart = max(count1 + count2, the moment loading finished), and never later than maxWait.
 * A skip jumps straight to the fade.
 */
export const LOADER = {
  count1: 1200,
  count2: 800,
  split: 400,
  merge: 600,
  flat: 400,
  fade: 300,
  maxWait: 8000,
};

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * Where the story is at time `now` (ms since the loader appeared).
 * @param {{ now: number, loadedAt?: number | null, skippedAt?: number | null }} s
 *   loadedAt: when the 3D globe chunk, the Earth texture and ruler.json were all ready (null while waiting)
 * @returns {{ split: number, merge: number, flat: number, fade: number, done: boolean, stage: string,
 *   mergeStart: number, fadeStart: number, end: number }} each of split/merge/flat/fade runs 0..1
 */
export function loaderTimeline({ now, loadedAt = null, skippedAt = null }) {
  const T = LOADER;
  const ready = loadedAt === null || loadedAt === undefined ? Infinity : loadedAt;
  const mergeStart = Math.min(Math.max(T.count1 + T.count2, ready), T.maxWait);
  const skipped = skippedAt !== null && skippedAt !== undefined && skippedAt < mergeStart + T.merge + T.flat;
  const fadeStart = skipped ? skippedAt : mergeStart + T.merge + T.flat;
  const end = fadeStart + T.fade;
  const split = easeInOutCubic((now - T.count1) / T.split);
  const merge = skipped ? 0 : easeInOutCubic((now - mergeStart) / T.merge);
  const flat = skipped ? 0 : easeInOutCubic((now - mergeStart - T.merge) / T.flat);
  const fade = clamp01((now - fadeStart) / T.fade);
  const stage =
    now >= end
      ? "done"
      : now >= fadeStart
        ? "fade"
        : now >= mergeStart + T.merge
          ? "flatten"
          : now >= mergeStart
            ? "merge"
            : now >= T.count1
              ? "split"
              : "single";
  return { split, merge, flat, fade, done: now >= end, stage, mergeStart, fadeStart, end };
}

/**
 * First year, last year and the year the new sensor joined, from ruler.json rows: the switch year is the first year
 * whose naive_source differs from the year before (the same rule as R6's BrokenRuler marker). Null if not found.
 * @param {{ rows?: { year: number, naive_source: string }[] } | null | undefined} ruler
 */
export function loaderYears(ruler) {
  const rows = [...(ruler?.rows || [])]
    .filter((r) => Number.isInteger(r?.year))
    .sort((a, b) => a.year - b.year);
  if (rows.length < 2) return null;
  let switchYear = null;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].naive_source !== rows[i - 1].naive_source) {
      switchYear = rows[i].year;
      break;
    }
  }
  if (switchYear === null) return null;
  return { first: rows[0].year, switch: switchYear, last: rows[rows.length - 1].year };
}

/** The year on the counter at time `now`: first -> switch over count1, switch -> last over count2, then last. */
export function yearAt(now, years) {
  if (!years) return null;
  const T = LOADER;
  if (now < T.count1) return years.first + Math.floor((years.switch - years.first) * clamp01(now / T.count1));
  return years.switch + Math.floor((years.last - years.switch) * clamp01((now - T.count1) / T.count2));
}

const SEEN_KEY = "firerosetta-landing-loader";

/** Show the loader? Only once per browser session, and never with prefers-reduced-motion. Storage may throw. */
export function shouldShowLoader(win = typeof window === "undefined" ? undefined : window) {
  if (!win) return false;
  if (win.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  try {
    return win.sessionStorage.getItem(SEEN_KEY) !== "1";
  } catch {
    return false;
  }
}

export function markLoaderSeen(win = typeof window === "undefined" ? undefined : window) {
  try {
    win?.sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* storage blocked: the loader may show again next time, which is harmless */
  }
}
