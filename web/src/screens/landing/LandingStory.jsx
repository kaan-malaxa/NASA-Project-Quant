import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import GlobeHero from "./GlobeHero.jsx";
import { usePrefersReducedMotion } from "./motion.js";
import { ORBIT_FRACTION, SHELLS } from "./satellites.js";
import { STORY_EXTRA_VH, storyLayout } from "./storyLayout.js";
import { useTriggeredMove } from "./useTriggeredMove.js";

const px = (v) => `${Math.round(v * 100) / 100}px`;

/** An element's box in the coordinates of the stage (for the stacked layout's text). */
function boxIn(stage, el) {
  const s = stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { left: r.left - s.left, top: r.top - s.top, right: r.right - s.left, bottom: r.bottom - s.top };
}

/**
 * The landing scroll story (prompt Phase 2). One tall section with the globe stage pinned (position: sticky).
 * Scrolling does not drag the move along: once the visitor has scrolled past a threshold, the move plays by itself
 * to the end, and scrolling back above it plays it in reverse (storyTarget). One number, t (0..1), animated over
 * time,
 *   - moves and shrinks the 3D globe (read by the scene every frame through `story`, no React re-render), and
 *   - moves the headline, the button and the broken-ruler block (CSS variables on the stage).
 *
 * Falls back to plain stacked sections (hero, then the ruler) with prefers-reduced-motion, and when the second
 * state does not fit the screen.
 *
 * @param {object} props
 * @param {object | null} props.calibration passed to the hero (satellite roles)
 * @param {import("react").ReactNode} props.head the h1
 * @param {import("react").ReactNode} props.cta the "Pick a place" link
 * @param {(revealed: boolean) => import("react").ReactNode} props.renderRuler the ruler block; `revealed` turns true the first
 *   time it comes into view, so the chart's draw-in animation plays when it can be seen
 * @param {() => void} [props.onReady] the globe is ready (see GlobeHero)
 * @param {boolean} [props.forceStatic] show the static Earth instead of the 3D scene
 * @param {() => void} [props.onTexture] the Earth texture is on the GPU (see GlobeScene)
 * @param {() => void} [props.onLayout] the positions have been measured with the ruler block in place
 * @param {boolean} [props.hold] the landing loader is on top (the globe draws only what it needs to get ready)
 * @param {boolean} [props.layoutReady] the ruler block has its final content (data or its fallback)
 */
export default function LandingStory({
  calibration,
  head,
  cta,
  renderRuler,
  onReady,
  onTexture,
  onLayout,
  layoutReady = true,
  forceStatic = false,
  hold = false,
}) {
  const reduced = usePrefersReducedMotion();
  const [fits, setFits] = useState(true);
  const story = !reduced && fits;

  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const headRef = useRef(null);
  const ctaRef = useRef(null);
  const rulerRef = useRef(null);
  const chipsRef = useRef(null);
  const storyRef = useRef({ t: 0, hero: null, globe: null, invalidate: null });
  const layoutRef = useRef(null);
  const layoutReadyRef = useRef(layoutReady);
  layoutReadyRef.current = layoutReady;
  const onLayoutRef = useRef(onLayout);
  onLayoutRef.current = onLayout;
  const fitTimer = useRef(0);
  const [phase2, setPhase2] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [ctaFades, setCtaFades] = useState(false);
  const [ctaGone, setCtaGone] = useState(false);

  // t -> CSS variables (written directly); React state changes only when t crosses a few fixed points.
  const setT = useCallback((t) => {
    const stage = stageRef.current;
    if (!stage) return;
    // The ruler fades in over the second half of the move, once the headline has mostly left its place.
    const t2 = Math.min(1, Math.max(0, (t - 0.55) / 0.45));
    stage.style.setProperty("--t", String(Math.round(t * 1e4) / 1e4));
    stage.style.setProperty("--t2", String(Math.round(t2 * 1e4) / 1e4));
    storyRef.current.t = t;
    setPhase2(t > 0.5);
    setCtaGone(t > 0.25);
    if (t > 0.3) setRevealed(true);
  }, []);

  // Scroll -> the threshold-triggered move (shared with the problem stage).
  const getT = useCallback(() => storyRef.current.t, []);
  const { apply, cancel } = useTriggeredMove({ containerRef, stageRef, setT, getT });

  // Measure the pieces and place them (on load, on resize, and when the ruler's data arrive). The globe's hero
  // placement (and the warm glow behind it) applies in both layouts; the text positions only in the story.
  const measure = useCallback(() => {
    const stage = stageRef.current;
    const headEl = headRef.current;
    const chipsEl = chipsRef.current;
    if (!stage || !headEl || !chipsEl || !stage.clientWidth) return;
    const L = storyLayout({
      w: stage.clientWidth,
      h: stage.clientHeight,
      headH: headEl.offsetHeight,
      headW: headEl.offsetWidth,
      ctaH: ctaRef.current?.offsetHeight ?? 0,
      ctaW: ctaRef.current?.offsetWidth ?? 0,
      // The stacked layout places the text with CSS; measure where it actually is.
      textRects: story ? null : [boxIn(stage, headEl)],
      rulerH: rulerRef.current?.offsetHeight ?? 0,
      chipsH: chipsEl.offsetHeight,
      orbitFraction: ORBIT_FRACTION,
      orbitToEarth: SHELLS.high.radius,
    });
    const after = story ? L.globe : L.hero;
    const vars = {
      "--gx0": px(L.hero.x),
      "--gy0": px(L.hero.y),
      "--er0": px(L.hero.earthR),
      "--gx1": px(after.x),
      "--gy1": px(after.y),
      "--er1": px(after.earthR),
    };
    if (story) {
      Object.assign(vars, {
        "--head-y0": px(L.headY0),
        "--head-y1": px(L.headY1),
        "--head-s1": String(Math.round(L.headS1 * 1e4) / 1e4),
        "--cta-y0": px(L.ctaY0),
        "--cta-y1": px(L.ctaY1),
        "--ruler-top": px(L.rulerTop),
        "--ruler-dx": px(L.rulerDx),
        "--ruler-dy": px(L.rulerDy),
      });
    }
    for (const [k, v] of Object.entries(vars)) stage.style.setProperty(k, v);
    storyRef.current.hero = L.hero;
    storyRef.current.globe = after;
    storyRef.current.invalidate?.();
    if (layoutReadyRef.current) onLayoutRef.current?.();
    if (!story) return;
    setCtaFades(L.ctaFades);
    layoutRef.current = L;
    // Decide "does it fit" only once sizes have settled: charts draw at a default width before they measure themselves.
    clearTimeout(fitTimer.current);
    fitTimer.current = setTimeout(() => {
      if (layoutRef.current && !layoutRef.current.fits) setFits(false);
      stage.dataset.fits = String(layoutRef.current?.fits);
    }, 700);
    setT(storyRef.current.t);
    apply();
  }, [story, apply, setT]);

  useLayoutEffect(() => {
    if (!story) storyRef.current.t = 0;
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : null;
    for (const r of [stageRef, headRef, ctaRef, rulerRef, chipsRef]) if (r.current) ro?.observe(r.current);
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };
    if (story) window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro?.disconnect();
      cancelAnimationFrame(frame);
      cancel();
      clearTimeout(fitTimer.current);
      window.removeEventListener("scroll", onScroll);
    };
  }, [story, measure, apply, cancel]);

  useLayoutEffect(() => {
    if (layoutReady) measure();
  }, [layoutReady, measure]);

  // A layout that did not fit may fit after the window changes size: try the story again.
  useEffect(() => {
    if (fits) return;
    const retry = () => setFits(true);
    window.addEventListener("resize", retry, { once: true });
    return () => window.removeEventListener("resize", retry);
  }, [fits]);

  if (!story) {
    return (
      <>
        <GlobeHero
          ref={stageRef}
          mode="stacked"
          story={storyRef}
          calibration={calibration}
          chipsRef={chipsRef}
          onReady={onReady}
          onTexture={onTexture}
          forceStatic={forceStatic}
          hold={hold}
        >
          <div ref={headRef} className="stacked-head max-w-4xl space-y-6 sm:order-first sm:mt-auto">
            {head}
            {cta}
          </div>
        </GlobeHero>
        <section aria-label="The broken ruler" className="mx-auto w-full max-w-6xl px-4 py-8">
          {renderRuler(true)}
        </section>
      </>
    );
  }

  return (
    <div
      ref={containerRef}
      className="landing-story"
      style={{ height: `calc(var(--landing-stage-h) + ${Math.round(STORY_EXTRA_VH * 100)}svh)` }}
    >
      <GlobeHero
        ref={stageRef}
        mode="story"
        story={storyRef}
        calibration={calibration}
        chipsRef={chipsRef}
        onReady={onReady}
        onTexture={onTexture}
        forceStatic={forceStatic}
        hold={hold}
      >
        <div ref={headRef} className="story-head">
          {head}
        </div>
        <div ref={ctaRef} className="story-cta" data-fades={ctaFades} inert={ctaFades && ctaGone}>
          {cta}
        </div>
        <section
          ref={rulerRef}
          aria-label="The broken ruler"
          className="story-ruler"
          data-shown={phase2}
          data-testid="story-ruler"
        >
          {renderRuler(revealed)}
        </section>
      </GlobeHero>
    </div>
  );
}
