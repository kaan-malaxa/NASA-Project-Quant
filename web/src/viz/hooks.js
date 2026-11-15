// Small React hooks shared by charts. No global state: each hook is local to its component.

import { useEffect, useState } from "react";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** True when the viewer asked for reduced motion. Read synchronously so the first frame is right. */
export function usePrefersReducedMotion() {
  const query = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(REDUCED_MOTION)
      : null;
  const [reduced, setReduced] = useState(() => query()?.matches ?? false);
  useEffect(() => {
    const mq = query();
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/**
 * Elapsed milliseconds of a one-shot timeline, driven by requestAnimationFrame.
 * Returns Infinity when disabled or finished, so "fully drawn" is the resting state and the
 * DOM after the animation is the plain static chart (safe for SVG/PNG export).
 * Restarts when `restartKey` changes.
 */
export function useTimeline(enabled, totalMs, restartKey) {
  const [t, setT] = useState(enabled ? 0 : Infinity);
  useEffect(() => {
    if (!enabled || typeof requestAnimationFrame !== "function") {
      setT(Infinity);
      return;
    }
    setT(0);
    let start = null;
    let id = 0;
    const tick = (now) => {
      if (start === null) start = now;
      const elapsed = now - start;
      if (elapsed >= totalMs) {
        setT(Infinity);
        return;
      }
      setT(elapsed);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [enabled, totalMs, restartKey]);
  return t;
}

/** Width of an element in CSS px, tracked with ResizeObserver. Returns [callback ref, width]. */
export function useElementWidth(fallback) {
  const [node, setNode] = useState(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    if (!node) return;
    const measure = () => {
      const w = node.getBoundingClientRect().width;
      if (w > 0) setWidth(Math.round(w));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return [setNode, width];
}

/** Combine a forwarded ref with a local callback ref. */
export function mergeRefs(...refs) {
  return (node) => {
    for (const r of refs) {
      if (typeof r === "function") r(node);
      else if (r) r.current = node;
    }
  };
}

/** 0→1 progress of a phase [start, start + duration] on a timeline value from useTimeline. */
export function phase(t, start, duration) {
  if (t === Infinity) return 1;
  return Math.min(1, Math.max(0, (t - start) / duration));
}
