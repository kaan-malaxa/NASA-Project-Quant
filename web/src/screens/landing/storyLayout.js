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
 * @param {number} current the state it is heading to now (kept between the two lines)
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

/**
 * Hero: a huge planet rising from the bottom-right, cropped by the screen edges. Asked for: Earth diameter 160 % of
 * the stage height (phones: 120 % of the width), centre at 75 % across and 80 % down. The globe may not sit behind
 * the headline or the button: if it would, it moves right and/or down (as little as possible, centre kept on screen),
 * and only if that is not enough does it shrink.
 */
export const HERO = { earthOfH: 1.6, earthOfWPhone: 1.2, cx: 0.75, cy: 0.8, gap: 16, margin: 24 };

const distToRect = (x, y, r) =>
  Math.hypot(x - Math.max(r.left, Math.min(x, r.right)), y - Math.max(r.top, Math.min(y, r.bottom)));

/**
 * Where the hero Earth goes: the clear position nearest to the asked-for centre, searching right and down from it.
 * @param {{ w: number, h: number, earthR: number, cx: number, cy: number, rects: {left: number, top: number,
 *   right: number, bottom: number}[], gap?: number, margin?: number }} m all in px
 * @returns {{ x: number, y: number, earthR: number, moved: boolean, shrunk: boolean }}
 */
export function heroGlobe({ w, h, earthR, cx, cy, rects, gap = HERO.gap, margin = HERO.margin }) {
  const clear = (x, y, R) => rects.every((r) => distToRect(x, y, r) >= R + gap);
  const maxX = Math.max(cx, w - margin);
  const maxY = Math.max(cy, h - margin);
  const steps = 32;
  let R = earthR;
  for (let attempt = 0; attempt < 60; attempt++) {
    let best = null;
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; j <= steps; j++) {
        const x = cx + ((maxX - cx) * i) / steps;
        const y = cy + ((maxY - cy) * j) / steps;
        if (!clear(x, y, R)) continue;
        const d = Math.hypot((x - cx) / w, (y - cy) / h);
        if (!best || d < best.d) best = { x, y, d };
      }
    }
    if (best) return { x: best.x, y: best.y, earthR: R, moved: best.d > 0, shrunk: R < earthR };
    R *= 0.96;
  }
  return { x: maxX, y: maxY, earthR: R, moved: true, shrunk: true };
}
/** After the move: share of the stage height for the Earth's diameter (limited by the right half's width). */
export const AFTER = { earthOfH: 0.72 };

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
 * @param {number} [m.ctaW] call-to-action width
 * @param {object[]} [m.textRects] where the headline and button are in the hero (px, stage coordinates); by default
 *   the story positions below. The stacked layout passes its measured boxes.
 *
 * Returns the text positions, `hero` and `globe` (the globe's placement before and after the move) and `fits`.
 * The globe never covers the text: if they would overlap, the globe moves right or shrinks, the text stays.
 * The hero globe is cropped by the stage edges on purpose (see HERO); the after-move globe stays fully on screen.
 */
/** Perspective: the near parts of the orbits draw a little larger than their radius; layout keeps this much margin. */
export const ORBIT_SLACK = 1.12;

export function storyLayout({
  w,
  h,
  headH,
  headW,
  ctaH,
  ctaW = 0,
  rulerH,
  chipsH,
  orbitFraction,
  orbitToEarth = 1.2,
  textRects = null,
}) {
  const mobile = w <= MOBILE_MAX;
  const pad = mobile ? 16 : 40;
  const gap = mobile ? 12 : 24;
  const k = orbitToEarth;
  const bottom = h - pad - chipsH - gap; // lowest y the text may reach above the satellite buttons
  const fullOrbit = orbitFraction * Math.min(w, h);
  const place = (x, y, r) => placement(w, h, x, y, r, fullOrbit, k);

  if (mobile) {
    // Hero: text at the top, the globe centred in the space between the button and the satellite buttons.
    const ctaTop = pad + headH + gap;
    const rects = textRects ?? [
      { left: pad, top: pad, right: pad + headW, bottom: pad + headH },
      { left: pad, top: ctaTop, right: pad + ctaW, bottom: ctaTop + ctaH },
    ];
    const g = heroGlobe({
      w,
      h,
      earthR: (HERO.earthOfWPhone * w) / 2,
      cx: HERO.cx * w,
      cy: HERO.cy * h,
      rects,
      gap,
      margin: 12,
    });
    const hero = place(g.x, g.y, g.earthR * k);
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

  // ---- Hero: the big cropped planet, clear of the headline and the button ----
  const ctaY0 = bottom - ctaH;
  const headY0 = ctaY0 - gap - headH;
  const rects = textRects ?? [
    { left: pad, top: headY0, right: pad + headW, bottom: headY0 + headH },
    { left: pad, top: ctaY0, right: pad + ctaW, bottom: ctaY0 + ctaH },
  ];
  const g = heroGlobe({ w, h, earthR: (HERO.earthOfH * h) / 2, cx: HERO.cx * w, cy: HERO.cy * h, rects });
  const heroR = g.earthR * k;
  const S = ORBIT_SLACK;

  // ---- After the move: right half, vertically centred, beside the ruler column (the column keeps its width) ----
  const colRight = w / 2 - gap; // right edge of the ruler column
  const afterR = Math.max(
    40,
    Math.min(((AFTER.earthOfH * h) / 2) * k, (w - 8 - colRight - gap) / 2 / S, (h / 2 - 8) / S),
  );
  const afterX = Math.min(Math.max(0.75 * w, colRight + gap + afterR * S), w - 8 - afterR * S);

  // ---- Text ----
  const colW = w / 2 - pad - gap;
  const room = h - 2 * pad - ctaH - rulerH - 2 * gap; // height left for the small headline above the ruler
  const headS1 = Math.min(0.55, colW / Math.max(1, headW), room / Math.max(1, headH));
  const rulerTop = pad + headH * headS1 + gap;
  const ctaY1 = rulerTop + rulerH + gap;
  return {
    mobile,
    pad,
    headY0,
    headY1: pad,
    headS1,
    ctaY0,
    ctaY1,
    ctaFades: false,
    rulerTop,
    rulerDx: -48,
    rulerDy: 0,
    hero: place(g.x, g.y, heroR),
    globe: place(afterX, h / 2, afterR),
    fits: headS1 >= 0.3 && ctaY1 + ctaH <= h - pad + 1 && ctaY0 - gap - headH >= pad,
  };
}
