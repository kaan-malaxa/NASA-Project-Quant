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
 * One placement of the globe: centre (px and as shares of the stage), scene scale, and the Earth's radius in px.
 * `scale` is relative to the scene's natural size, where the outer orbit's diameter is orbitFraction * min(w, h).
 */
function placement(w, h, x, y, orbitR, fullOrbit, orbitToEarth) {
  return {
    x,
    y,
    cx: x / w,
    cy: y / h,
    scale: (2 * orbitR) / fullOrbit,
    earthR: orbitR / orbitToEarth,
    orbitR,
  };
}

/** Hero: share of the stage height for the Earth's diameter (asked for), and its centre (asked for). */
export const HERO = { earthOfH: 0.9, cx: 0.65, cy: 0.58 };
/** After the move: share of the stage height for the Earth's diameter; it shrinks at most this much from the hero. */
export const AFTER = { earthOfH: 0.72, shrink: 0.97 };

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
 * @param {number} [m.orbitToEarth] outer orbit radius / Earth radius
 *
 * Returns the text positions, `hero` and `globe` (the globe's placement before and after the move) and `fits`.
 * The globe never covers the text: if they would overlap, the globe moves right or shrinks, the text stays.
 * Orbits stay fully on screen vertically, so all five satellites stay visible and clickable.
 */
/** Perspective: the near parts of the orbits draw a little larger than their radius; layout keeps this much margin. */
export const ORBIT_SLACK = 1.12;

export function storyLayout({ w, h, headH, headW, ctaH, rulerH, chipsH, orbitFraction, orbitToEarth = 1.2 }) {
  const mobile = w <= MOBILE_MAX;
  const pad = mobile ? 16 : 40;
  const gap = mobile ? 12 : 24;
  const k = orbitToEarth;
  const bottom = h - pad - chipsH - gap; // lowest y the text may reach above the satellite buttons
  const fullOrbit = orbitFraction * Math.min(w, h);
  const place = (x, y, r) => placement(w, h, x, y, r, fullOrbit, k);

  if (mobile) {
    // Hero: text at the top, the globe centred in the space between the button and the satellite buttons.
    const textBottom = pad + headH + gap + ctaH + gap;
    const heroR = Math.max(40, Math.min((w - 16) / 2, (bottom - textBottom) / 2) / ORBIT_SLACK);
    const hero = place(w / 2, (textBottom + bottom) / 2, heroR);
    // After: the globe shrinks in place into the top of the screen, the text stacks below it (no sideways move).
    const globeBottom = Math.round(h * 0.3);
    const afterR = Math.min(globeBottom - 40, w * 0.9) / 2 / ORBIT_SLACK;
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
      hero,
      globe: place(w / 2, globeBottom / 2, afterR),
      fits: rulerTop + rulerH <= bottom,
    };
  }

  // ---- Hero ----
  const heroY = HERO.cy * h;
  const vertical = (Math.min(heroY, h - heroY) - 4) / ORBIT_SLACK; // the orbits stay fully on screen top and bottom
  let heroR = Math.min(vertical, ((HERO.earthOfH * h) / 2) * k);
  const headRight = pad + headW;
  const leftLimit = (r) => headRight + gap + r / k; // the Earth's left edge stays right of the text
  const S = ORBIT_SLACK;
  if (Math.max(HERO.cx * w, leftLimit(heroR)) + heroR * S > w - 8) {
    heroR = Math.min(heroR, (w - 8 - headRight - gap) / (S + 1 / k));
  }
  heroR = Math.max(40, heroR);
  const heroX = Math.min(Math.max(HERO.cx * w, leftLimit(heroR)), w - 8 - heroR * S);

  // ---- After the move: right half, vertically centred, beside the ruler column (the column keeps its width) ----
  const colRight = w / 2 - gap; // right edge of the ruler column
  const afterR = Math.max(
    40,
    Math.min(
      heroR * AFTER.shrink,
      ((AFTER.earthOfH * h) / 2) * k,
      (w - 8 - colRight - gap) / 2 / S,
      (h / 2 - 8) / S,
    ),
  );
  const afterX = Math.min(Math.max(0.75 * w, colRight + gap + afterR * S), w - 8 - afterR * S);

  // ---- Text ----
  const colW = w / 2 - pad - gap;
  const room = h - 2 * pad - ctaH - rulerH - 2 * gap; // height left for the small headline above the ruler
  const headS1 = Math.min(0.55, colW / Math.max(1, headW), room / Math.max(1, headH));
  const ctaY0 = bottom - ctaH;
  const rulerTop = pad + headH * headS1 + gap;
  const ctaY1 = rulerTop + rulerH + gap;
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
    hero: place(heroX, heroY, heroR),
    globe: place(afterX, h / 2, afterR),
    fits: headS1 >= 0.3 && ctaY1 + ctaH <= h - pad + 1 && ctaY0 - gap - headH >= pad,
  };
}
