/**
 * Geometry of the landing scroll story (prompt Phase 2). Pure arithmetic, so it is unit-tested.
 *
 * Two states, blended by t (0 = the full-screen globe, 1 = the globe small with the broken ruler beside it):
 *   wide screens   globe moves to the right half; headline shrinks to the top left; the ruler slides in below it
 *   phones (<768)  globe shrinks in place into the top of the screen; headline and ruler stack below it
 * Returns null-free numbers in CSS pixels, plus `fits`: false when the second state does not fit the screen,
 * in which case the page falls back to the plain stacked layout.
 */
export const MOBILE_MAX = 767;

/**
 * The move is triggered, not scrubbed: scrolling does not drag it along. Once the pinned stage has been scrolled
 * `forward` viewport heights, the whole move plays by itself; scrolling back above `back` plays it in reverse.
 * The gap between the two keeps it from flipping back and forth around one line. `hold` is the pinned scroll room
 * left after the trigger, so the end state stays on screen while it plays.
 */
export const TRIGGER = { forward: 0.2, back: 0.08, hold: 1.0 };

/** Duration of the full move, in milliseconds. */
export const MOVE_MS = 1100;

/** Total scroll length of the story section, in viewport heights, beyond the stage itself. */
export const STORY_EXTRA_VH = TRIGGER.forward + TRIGGER.hold;

/**
 * Which end state the story should be heading to (0 = full globe, 1 = globe small with the ruler).
 * @param {number} scrolled px scrolled since the stage was pinned (negative before)
 * @param {number} viewportH px
 * @param {0 | 1} current the state it is heading to now (kept between the two lines)
 */
export function storyTarget(scrolled, viewportH, current) {
  if (!(viewportH > 0)) return current;
  const x = scrolled / viewportH;
  if (x >= TRIGGER.forward) return 1;
  if (x <= TRIGGER.back) return 0;
  return current;
}

/** Ease in and out (cubic), 0..1 -> 0..1. */
export function easeInOut(x) {
  const c = Math.min(1, Math.max(0, x));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/**
 * @param {object} m measurements
 * @param {number} m.w stage width
 * @param {number} m.h stage height
 * @param {number} m.headH headline height at full size
 * @param {number} m.headW headline width at full size
 * @param {number} m.ctaH call-to-action height
 * @param {number} m.rulerH ruler block height (chart, sentence, note)
 * @param {number} m.chipsH satellite button row height
 * @param {number} m.orbitFraction outer orbit diameter as a share of min(w, h) when the globe is full size
 */
export function storyLayout({ w, h, headH, headW, ctaH, rulerH, chipsH, orbitFraction }) {
  const mobile = w <= MOBILE_MAX;
  const pad = mobile ? 16 : 40;
  const gap = mobile ? 12 : 24;
  const bottom = h - pad - chipsH - gap; // lowest y the text may reach above the satellite buttons
  const fullOrbit = orbitFraction * Math.min(w, h);

  if (mobile) {
    const globeBottom = Math.round(h * 0.3);
    const desired = Math.min(globeBottom - 40, w * 0.9);
    const headS1 = Math.min(0.55, (w - 2 * pad) / Math.max(1, headW));
    const headY1 = globeBottom;
    const rulerTop = headY1 + headH * headS1 + gap;
    return {
      mobile,
      pad,
      headY0: pad,
      headY1,
      headS1,
      ctaY0: pad + headH + gap,
      ctaY1: pad + headH + gap, // on phones the button fades out instead (the header keeps "Pick a place")
      ctaFades: true,
      rulerTop,
      rulerDx: 0,
      rulerDy: 24,
      globe: { cx: 0.5, cy: globeBottom / 2 / h, scale: Math.min(1, desired / fullOrbit) },
      fits: rulerTop + rulerH <= bottom,
    };
  }

  const colW = w / 2 - pad - gap;
  const headS1 = Math.min(0.55, colW / Math.max(1, headW));
  const ctaY0 = bottom - ctaH;
  const rulerTop = pad + headH * headS1 + gap;
  const ctaY1 = rulerTop + rulerH + gap;
  const desired = Math.min(w * 0.42, h * 0.72);
  return {
    mobile,
    pad,
    headY0: ctaY0 - gap - headH,
    headY1: pad,
    headS1,
    ctaY0,
    ctaY1,
    ctaFades: false,
    rulerTop,
    rulerDx: -48,
    rulerDy: 0,
    globe: { cx: 0.75, cy: 0.5, scale: Math.min(0.7, desired / fullOrbit) },
    fits: ctaY1 + ctaH <= h - pad && ctaY0 - gap - headH >= pad,
  };
}
