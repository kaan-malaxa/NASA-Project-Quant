import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TUTORIAL_STEPS, markTutorialSeen } from "./tutorialSteps.js";
import { tourPlacement } from "./tourLayout.js";
import { waitForTarget } from "./tutorial/waitForTarget.js";
import "./tutorial.css";

const WAIT_MS = 3000; // a target that is not ready by then gets a centered dialog instead
const FADE_MS = 150;

const reducedMotion = () =>
  typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** Point at a card or a heading wrapper when the whole section is taller than half the screen. */
function pickTarget(el) {
  if (el.offsetHeight <= window.innerHeight / 2) return el;
  return (el.dataset.tour === "places" ? el.querySelector("a") : el.querySelector("h2")?.parentElement) || el;
}

/** Bring the target into view (instantly; the settle check then waits for the layout to stop moving). */
function scrollToTarget(target, cardHeight) {
  target.scrollIntoView({ block: "center", behavior: "instant" });
  const stickyHeight =
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--region-bar-h")) || 0;
  const top = target.getBoundingClientRect().top;
  if (!target.closest(".sticky") && top < stickyHeight + 16)
    window.scrollBy({ top: top - stickyHeight - 16, behavior: "instant" });
  // Phones: keep the target above the bottom sheet.
  if (window.innerWidth < 768 && !target.closest(".sticky")) {
    const visibleBottom = window.innerHeight - cardHeight - 24;
    const bottom = target.getBoundingClientRect().bottom;
    if (bottom > visibleBottom) window.scrollBy({ top: bottom - visibleBottom, behavior: "instant" });
  }
}

/**
 * Persistent, modal guided tour. The shell owns its lifetime across lazy route transitions.
 * The box is never shown before it has a valid place: each step waits for its target to exist, finish loading
 * (no [data-state="loading"] inside it or its section) and settle (the same rect on two frames), within 3 s;
 * otherwise the step is shown as a centered dialog. Steps whose section only shows a missing-file fallback are skipped.
 */
export default function Tutorial({ open, onOpenChange }) {
  const [step, setStep] = useState(0);
  const [omitted, setOmitted] = useState([]);
  // anchor: what the current step points at, once ready (el null = centered). placement: where the box goes.
  const [anchor, setAnchor] = useState(null);
  const [placement, setPlacement] = useState(null);
  const [visible, setVisible] = useState(false);
  const card = useRef(null);
  const launcher = useRef(document.activeElement);
  const hiddenAt = useRef(0);
  const navigate = useNavigate();
  const location = useLocation();
  const savedSearch = useRef(location.pathname.startsWith("/r/") ? location.search : "");
  const steps = TUTORIAL_STEPS.filter((s) => !omitted.includes(s.id));
  const current = steps[Math.min(step, steps.length - 1)];
  const close = () => onOpenChange(false);

  // ---- open / close: modal, scroll lock, focus back where it came from ----
  useEffect(() => {
    if (!open) {
      setStep(0);
      setOmitted([]);
      return;
    }
    markTutorialSeen();
    const root = document.getElementById("root");
    const wasInert = root?.inert;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    if (root) root.inert = true;
    return () => {
      document.documentElement.style.overflow = previousOverflow;
      if (root) root.inert = wasInert;
      const el = launcher.current?.isConnected
        ? launcher.current
        : document.querySelector('[data-tour="launch"], main h1, header a');
      if (el instanceof HTMLElement) {
        if (!el.matches("button,a,input")) el.tabIndex = -1;
        el.focus({ preventScroll: true });
      }
    };
  }, [open]);

  // ---- each step: hide, go to its page, wait for its target, then anchor (or center) ----
  useEffect(() => {
    if (!open || !current) return;
    setVisible(false);
    hiddenAt.current = performance.now();
    const path = current.id === "pick" ? "/pick" : "/r/us";
    if (location.pathname.startsWith("/r/")) savedSearch.current = location.search;
    if (location.pathname !== path) {
      // Navigate first; this effect runs again on the new route and waits for its target there.
      navigate(
        { pathname: path, search: path === "/pick" ? "" : savedSearch.current },
        { state: { section: current.section, tutorial: true } },
      );
      return;
    }
    let aborted = false;
    const isAborted = () => aborted;
    const deadline = performance.now() + WAIT_MS;
    const cardHeight = () => card.current?.offsetHeight || 280;
    // Let the old box finish fading out before anything moves.
    const afterFade = (fn) => {
      const wait = reducedMotion() ? 0 : Math.max(0, FADE_MS - (performance.now() - hiddenAt.current));
      setTimeout(() => !aborted && fn(), wait);
    };
    if (!current.target) {
      afterFade(() => setAnchor({ el: null, step: current.id, pathname: path }));
    } else {
      waitForTarget(current.target, {
        deadline,
        aborted: isAborted,
        prepare: (el) => {
          const target = pickTarget(el);
          scrollToTarget(target, cardHeight());
          return target;
        },
      }).then((r) => {
        if (aborted || r.status === "aborted") return;
        if (r.status === "unavailable") {
          setOmitted((old) => [...old, current.id]);
          return;
        }
        afterFade(() =>
          setAnchor({ el: r.status === "ready" ? r.el : null, step: current.id, pathname: path }),
        );
      });
    }
    return () => {
      aborted = true;
    };
  }, [current?.id, open, location.pathname]);

  // ---- placement: computed before paint from the settled target and the box's own height ----
  const place = useCallback(() => {
    if (!anchor) return;
    const rect = anchor.el?.isConnected ? anchor.el.getBoundingClientRect() : null;
    const p = tourPlacement({
      rect: rect && rect.width && rect.height ? rect : null,
      width: window.innerWidth,
      height: window.innerHeight,
      cardHeight: Math.min(window.innerHeight - 24, card.current?.offsetHeight || 280),
    });
    setPlacement({ ...p, step: anchor.step, pathname: anchor.pathname });
  }, [anchor]);

  useLayoutEffect(() => {
    if (!anchor) return;
    place();
  }, [anchor, place]);

  // Fade in only once the box is at its place (next frame, so the position is painted before the transition).
  useEffect(() => {
    if (!placement || !current || placement.step !== current.id || placement.pathname !== location.pathname)
      return;
    const frame = requestAnimationFrame(() => {
      setVisible(true);
      card.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [placement, current, location.pathname]);

  // ---- keep it attached: resize, scroll and target size changes, one update per frame ----
  useEffect(() => {
    if (!anchor) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (anchor.el) ro?.observe(anchor.el);
    if (card.current) ro?.observe(card.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(frame);
      ro?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchor, place]);

  useEffect(() => {
    if (open && !steps.length) onOpenChange(false);
  }, [open, steps.length, onOpenChange]);

  if (!open || !current) return null;
  const active =
    placement?.step === current.id && placement?.pathname === location.pathname && anchor?.step === current.id
      ? placement
      : null;
  const shown = Boolean(active) && visible;
  const go = (delta) => setStep((old) => Math.max(0, Math.min(steps.length - 1, old + delta)));
  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
    if (!e.target.closest('input,textarea,select,[contenteditable="true"]')) {
      if (e.key === "ArrowRight" && shown) {
        e.preventDefault();
        go(1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      }
    }
    if (e.key === "Tab") {
      const buttons = [...card.current.querySelectorAll("button:not(:disabled)")];
      const i = buttons.indexOf(document.activeElement);
      e.preventDefault();
      buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    }
  };

  return createPortal(
    <div className="tour-layer" onKeyDown={onKeyDown}>
      {/* Blocks the page while the tour is open; dims it only once the box is shown (and has no spotlight). */}
      <div
        className={`tour-shield ${shown && !active.box ? "tour-dim" : ""}`}
        onClick={(e) => e.preventDefault()}
      />
      {active?.box ? (
        <div
          data-testid="tour-highlight"
          aria-hidden="true"
          className={`tour-highlight ${shown ? "is-shown" : ""}`}
          style={active.box}
        />
      ) : null}
      <div
        ref={card}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-description"
        data-testid="tutorial"
        data-placed={active ? active.mode : "waiting"}
        className={`tour-card ${shown ? "is-shown" : ""}`}
        style={
          active ? { left: active.card.left, top: active.card.top, width: active.card.width } : undefined
        }
      >
        <p className="text-muted-foreground text-xs" aria-live="polite">
          How to use this site · Step {Math.min(step + 1, steps.length)} of {steps.length}
        </p>
        <h2 id="tour-title" className="text-lg font-semibold">
          {current.title}
        </h2>
        <p id="tour-description" className="text-sm leading-relaxed">
          {current.text}
        </p>
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="outline" disabled={step === 0} onClick={() => go(-1)}>
            Back
          </Button>
          <Button disabled={!shown} onClick={() => (step === steps.length - 1 ? close() : go(1))}>
            {step === steps.length - 1 ? "Finish" : "Next"}
          </Button>
        </div>
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={close}>
            Skip tutorial
          </Button>
          <Button variant="ghost" onClick={close}>
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
