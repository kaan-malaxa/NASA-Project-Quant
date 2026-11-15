import { useCallback, useRef } from "react";
import { MOVE_MS, easeInOut, storyTarget } from "./storyLayout.js";

/**
 * The landing page's threshold-triggered move, shared by every pinned stage (the globe story, the problem stage).
 * Scrolling does not drag the move along: once the pinned stage has been scrolled past TRIGGER.forward, the whole
 * move plays by itself over MOVE_MS; scrolling back above TRIGGER.back plays it in reverse (storyTarget). A reversal
 * mid-way starts from wherever it is.
 *
 * @param {object} o
 * @param {{ current: HTMLElement | null }} o.containerRef the tall section that holds the pinned stage
 * @param {{ current: HTMLElement | null }} o.stageRef the sticky stage
 * @param {(t: number) => void} o.setT called with t (0..1) on every animation frame of the move
 * @param {() => number} o.getT the current t (where a reversal starts from)
 * @returns {{ apply: () => void, cancel: () => void }} call apply on scroll (and after layout changes); cancel on cleanup
 */
export function useTriggeredMove({ containerRef, stageRef, setT, getT }) {
  const anim = useRef({ target: 0, from: 0, start: 0, dur: 0, frame: 0 });

  const tick = useCallback(
    (now) => {
      const a = anim.current;
      const p = a.dur > 0 ? Math.min(1, (now - a.start) / a.dur) : 1;
      setT(a.from + (a.target - a.from) * easeInOut(p));
      a.frame = p < 1 ? requestAnimationFrame(tick) : 0;
    },
    [setT],
  );

  const apply = useCallback(() => {
    const stage = stageRef.current;
    const box = containerRef.current;
    if (!stage || !box) return;
    const a = anim.current;
    const stickyTop = parseFloat(getComputedStyle(stage).top) || 0;
    const target = storyTarget(stickyTop - box.getBoundingClientRect().top, window.innerHeight, a.target);
    if (target === a.target) return;
    cancelAnimationFrame(a.frame);
    a.from = getT();
    a.target = target;
    a.dur = MOVE_MS * Math.abs(target - a.from);
    a.start = performance.now();
    a.frame = requestAnimationFrame(tick);
  }, [containerRef, stageRef, getT, tick]);

  const cancel = useCallback(() => cancelAnimationFrame(anim.current.frame), []);
  return { apply, cancel };
}
