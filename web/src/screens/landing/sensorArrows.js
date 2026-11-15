/**
 * Geometry of the "two records" diagram in the problem / solution stage (pure, unit-tested).
 * Drawn in a 600 x 260 viewBox. An illustration, not to scale: the step height is not a result.
 *
 * intro (0..1, plays once, ~2.5 s): MODIS grows from the left, VIIRS from the right; they collide at the switch year
 *   (shake, spark), bounce apart and settle with a gap and a step: VIIRS higher, so the joined record "jumps".
 * merge (0..1, the scroll-triggered move to "Our solution"): VIIRS slides down onto the MODIS level, the gap closes,
 *   and the two become one continuous "Harmonized" arrow.
 */
export const VIEW = { w: 600, h: 260, left: 40, right: 560, axisY: 222, lowY: 168, highY: 92, gap: 22 };
export const INTRO_MS = 2500;
export const PULSE_MS = 900;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => {
  const c = clamp01(x);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
};

/** x of a year on the axis (null years -> the middle, no ticks). */
export function switchX(years) {
  if (!years || years.last === years.first) return (VIEW.left + VIEW.right) / 2;
  return VIEW.left + ((VIEW.right - VIEW.left) * (years.switch - years.first)) / (years.last - years.first);
}

/**
 * @param {{ intro: number, merge: number, years: { first: number, switch: number, last: number } | null }} s
 */
export function arrowsGeometry({ intro, merge, years }) {
  const V = VIEW;
  const sx = switchX(years);
  // A move to the solution always starts from the settled problem picture.
  const p = merge > 0 ? 1 : clamp01(intro);
  const m = clamp01(merge);

  // ---- intro ----
  const growM = ease(p / 0.35);
  const growV = ease((p - 0.15) / 0.4);
  const hit = p >= 0.55 && p < 0.68 ? (p - 0.55) / 0.13 : null;
  const shake = hit === null ? 0 : Math.sin(hit * Math.PI * 6) * 3 * (1 - hit);
  const sparkK = clamp01((p - 0.55) / 0.2);
  const bounce = ease((p - 0.62) / 0.38);

  // ---- merge ----
  const down = ease(m / 0.6);
  const close = ease((m - 0.35) / 0.45);
  const join = ease((m - 0.7) / 0.3);

  const gapNow = V.gap * bounce * (1 - close);
  const modisTip = V.left + (sx - V.left) * growM - gapNow + shake;
  const viirsTip = V.right - (V.right - sx) * growV + gapNow + shake;
  const viirsYIntro = V.lowY + (V.highY - V.lowY) * bounce;
  const viirsY = viirsYIntro + (V.lowY - viirsYIntro) * down;

  return {
    switchX: sx,
    ticks: years
      ? [
          { x: V.left, label: String(years.first) },
          { x: sx, label: String(years.switch) },
          { x: V.right, label: String(years.last) },
        ]
      : [],
    modis: { x1: V.left, x2: modisTip, y: V.lowY, opacity: (growM > 0 ? 1 : 0) * (1 - join) },
    viirs: { x1: V.right, x2: viirsTip, y: viirsY, opacity: (growV > 0 ? 1 : 0) * (1 - join) },
    joined: { x1: V.left, x2: V.right, y: V.lowY, opacity: join },
    spark: { x: sx, y: V.lowY, opacity: m > 0 || p < 0.55 ? 0 : 1 - sparkK, r: 6 + 18 * sparkK },
    bracket: { x: sx, y1: viirsY, y2: V.lowY, opacity: clamp01((p - 0.85) / 0.15) * (1 - down) },
    labels: {
      modis: { opacity: (growM > 0.3 ? 1 : 0) * (1 - join) },
      viirs: { opacity: (growV > 0.3 ? 1 : 0) * (1 - join) },
      harmonized: { opacity: join },
    },
    settled: p >= 1 && m === 0,
  };
}
