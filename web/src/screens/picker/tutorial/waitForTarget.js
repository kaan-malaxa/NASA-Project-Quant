import { isSettled } from "../tourLayout.js";

/*
 * Waiting for a tour target to be really ready before the tour box is placed next to it:
 *   1. it exists and is not hidden,
 *   2. neither it nor its section is still loading (no [data-state="loading"] inside: skeletons carry it),
 *   3. after scrolling it into view, its rect is the same on two animation frames in a row (within 1 px).
 * All within one deadline (3 s by default); the caller then falls back to a centered dialog.
 */
const FALLBACK_TEXT =
  /Not available for this region yet|This file failed validation|This file could not be loaded/;

/** "pending" (not there or still loading), "unavailable" (its section shows a missing-file fallback), or "ready". */
export function targetState(el) {
  if (!(el instanceof HTMLElement) || el.hidden || el.closest("[hidden]")) return "pending";
  const scope = el.closest("section") || el;
  if (
    el.matches('[data-state="loading"]') ||
    el.querySelector('[data-state="loading"]') ||
    scope.querySelector('[data-state="loading"]')
  ) {
    return "pending";
  }
  if (FALLBACK_TEXT.test(el.textContent || "")) return "unavailable";
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return "pending";
  return "ready";
}

const nextFrame = () =>
  /** @type {Promise<void>} */ (new Promise((resolve) => requestAnimationFrame(() => resolve())));

/**
 * @param {string} selector
 * @param {{ deadline: number, aborted: () => boolean, prepare?: (el: HTMLElement) => HTMLElement | void }} o
 *   prepare: pick the element to point at and scroll it into view (called once, when the target is ready)
 * @returns {Promise<{ status: "ready", el: HTMLElement, rect: DOMRect } | { status: "unavailable" | "timeout" | "aborted" }>}
 */
export async function waitForTarget(selector, { deadline, aborted, prepare }) {
  let el = null;
  while (performance.now() < deadline) {
    if (aborted()) return { status: "aborted" };
    const found = document.querySelector(selector);
    const state = targetState(found);
    if (state === "unavailable") return { status: "unavailable" };
    if (state === "ready") {
      el = found;
      break;
    }
    await nextFrame();
  }
  if (!el) return { status: "timeout" };
  const target = prepare?.(el) || el;
  // Scrolling and late layout: measure every frame until two frames agree.
  const history = [];
  while (performance.now() < deadline) {
    if (aborted()) return { status: "aborted" };
    if (!target.isConnected) return { status: "timeout" };
    history.push(target.getBoundingClientRect());
    if (isSettled(history)) return { status: "ready", el: target, rect: history[history.length - 1] };
    await nextFrame();
  }
  return { status: "timeout" };
}
