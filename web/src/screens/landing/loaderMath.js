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
 * Turn a point about the vertical axis by `angle`, tilt it toward the viewer by `tilt`, and project it onto the screen.
 * @returns {{ x: number, y: number, z: number }} screen position (px) and depth z in -1..1 (1 = nearest)
 */
export function projectPoint([px, py, pz], angle, tilt, cx, cy, radius) {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const x1 = px * ca + pz * sa;
  const z1 = -px * sa + pz * ca;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const y2 = py * ct - z1 * st;
  const z2 = py * st + z1 * ct;
  return { x: cx + x1 * radius, y: cy - y2 * radius, z: z2 };
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

/** Timings of the loader, in ms. `maxWait`: never wait longer than this for the scene. */
export const LOADER = { minSpin: 700, collapse: 1000, hold: 250, fade: 500, maxWait: 8000 };

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
