import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import SensorArrows from "./SensorArrows.jsx";
import Reveal from "./Reveal.jsx";
import { usePrefersReducedMotion } from "./motion.js";
import { INTRO_MS, PULSE_MS } from "./sensorArrows.js";
import { STORY_EXTRA_VH } from "./storyLayout.js";
import { useTriggeredMove } from "./useTriggeredMove.js";

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/** Plays 0 -> 1 over `ms` once the element is in view (immediately 1 with reduced motion). */
function useIntro(ref, reduced, ms) {
  const [v, setV] = useState(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      setV(1);
      return;
    }
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const play = () => {
      const start = performance.now();
      const step = (now) => {
        const p = clamp01((now - start) / ms);
        setV(p);
        if (p < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };
    if (typeof IntersectionObserver === "undefined") {
      setV(1);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          io.disconnect();
          play();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ref, reduced, ms]);
  return v;
}

/** 0 -> 1 over PULSE_MS each time `on` turns true; null otherwise. */
function usePulse(on) {
  const [v, setV] = useState(null);
  useEffect(() => {
    if (!on) {
      setV(null);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now) => {
      const p = clamp01((now - start) / PULSE_MS);
      setV(p);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [on]);
  return v;
}

function TextBlock({ id, title, text }) {
  return (
    <div className="max-w-xl space-y-4">
      <h2 id={id} className="text-3xl font-bold tracking-tight sm:text-4xl">
        {title}
      </h2>
      <p className="text-lg text-pretty sm:text-xl">{text}</p>
    </div>
  );
}

/**
 * "The problem" -> "Our solution": a pinned stage with the same threshold-triggered move as the globe story
 * (useTriggeredMove). State A: the problem text and the two arrows, collided and apart. State B: the solution text,
 * the arrows joined into one harmonized record. With reduced motion, or when the stage does not fit the screen, the
 * two states are two normal stacked sections.
 * @param {{ years: object | null, problem: string, solution: string }} props
 */
export default function ProblemStage({ years, problem, solution }) {
  const reduced = usePrefersReducedMotion();
  const [fits, setFits] = useState(true);
  const staged = !reduced && fits;

  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const innerRef = useRef(null);
  const diagramRef = useRef(null);
  const tRef = useRef(0);
  const [t, setTState] = useState(0);
  const setT = useCallback((v) => {
    tRef.current = v;
    setTState(v);
  }, []);
  const getT = useCallback(() => tRef.current, []);
  const { apply, cancel } = useTriggeredMove({ containerRef, stageRef, setT, getT });
  const intro = useIntro(diagramRef, reduced, INTRO_MS);
  const pulse = usePulse(staged && t >= 1);

  useLayoutEffect(() => {
    if (!staged) return;
    let timer = 0;
    const check = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const stage = stageRef.current;
        const inner = innerRef.current;
        if (stage && inner && inner.offsetHeight + 48 > stage.clientHeight) setFits(false);
      }, 400);
    };
    check();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    if (innerRef.current) ro?.observe(innerRef.current);
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    apply();
    return () => {
      clearTimeout(timer);
      ro?.disconnect();
      cancelAnimationFrame(frame);
      cancel();
      window.removeEventListener("scroll", onScroll);
    };
  }, [staged, apply, cancel]);

  // A stage that did not fit may fit after the window changes size: try again.
  useEffect(() => {
    if (fits) return;
    const retry = () => setFits(true);
    window.addEventListener("resize", retry, { once: true });
    return () => window.removeEventListener("resize", retry);
  }, [fits]);

  if (!staged) {
    return (
      <>
        <Reveal aria-labelledby="problem-title" className="landing-problem" data-testid="problem-section">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-16 md:grid-cols-2 sm:py-20">
            <TextBlock id="problem-title" title="The problem" text={problem} />
            <div ref={diagramRef}>
              <SensorArrows intro={intro} merge={0} years={years} still={reduced} />
            </div>
          </div>
        </Reveal>
        <Reveal aria-labelledby="solution-title" className="landing-problem" data-testid="solution-section">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 pb-16 md:grid-cols-2 sm:pb-20">
            <TextBlock id="solution-title" title="Our solution" text={solution} />
            <SensorArrows intro={1} merge={1} years={years} still />
          </div>
        </Reveal>
      </>
    );
  }

  const solved = t >= 0.5;
  const showA = 1 - clamp01((t - 0.1) / 0.4);
  const showB = clamp01((t - 0.45) / 0.4);
  return (
    <section
      ref={containerRef}
      aria-labelledby={solved ? "solution-title" : "problem-title"}
      className="problem-story"
      style={{ height: `calc(var(--problem-stage-h) + ${Math.round(STORY_EXTRA_VH * 100)}svh)` }}
    >
      <div
        ref={stageRef}
        className="problem-stage"
        data-testid="problem-stage"
        data-state={solved ? "solution" : "problem"}
        data-t={Math.round(t * 1000) / 1000}
      >
        <div ref={innerRef} className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 md:grid-cols-2">
          <div className="problem-texts">
            <div style={{ opacity: showA }} aria-hidden={solved}>
              <TextBlock id="problem-title" title="The problem" text={problem} />
            </div>
            <div style={{ opacity: showB }} aria-hidden={!solved}>
              <TextBlock id="solution-title" title="Our solution" text={solution} />
            </div>
          </div>
          <div ref={diagramRef}>
            <SensorArrows intro={intro} merge={t} pulse={pulse} years={years} />
          </div>
        </div>
      </div>
    </section>
  );
}
