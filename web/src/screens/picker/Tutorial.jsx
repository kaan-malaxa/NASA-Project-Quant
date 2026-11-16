import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TUTORIAL_STEPS, markTutorialSeen } from "./tutorialSteps.js";
import { tourLayout } from "./tourLayout.js";
import "./tutorial.css";

/** Persistent, modal guided tour. The shell owns its lifetime across lazy route transitions. */
export default function Tutorial({ open, onOpenChange }) {
  const [step, setStep] = useState(0);
  const [omitted, setOmitted] = useState([]);
  const [layout, setLayout] = useState(null);
  const card = useRef(null);
  const launcher = useRef(document.activeElement);
  const navigate = useNavigate();
  const location = useLocation();
  const savedSearch = useRef(location.pathname.startsWith("/r/") ? location.search : "");
  const steps = TUTORIAL_STEPS.filter((s) => !omitted.includes(s.id));
  const current = steps[Math.min(step, steps.length - 1)];
  const close = () => onOpenChange(false);

  useEffect(() => {
    if (!open) { setStep(0); setOmitted([]); return; }
    markTutorialSeen();
    card.current?.focus({ preventScroll: true });
    const root = document.getElementById("root");
    const wasInert = root?.inert;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    if (root) root.inert = true;
    return () => {
      document.documentElement.style.overflow = previousOverflow;
      if (root) root.inert = wasInert;
      const el = launcher.current?.isConnected ? launcher.current : document.querySelector('[data-tour="launch"], main h1, header a');
      if (el instanceof HTMLElement) { if (!el.matches('button,a,input')) el.tabIndex = -1; el.focus({ preventScroll: true }); }
    };
  }, [open]);

  useEffect(() => {
    if (!open || !current) return;
    setLayout(null);
    const path = current.id === "pick" ? "/pick" : "/r/us";
    if (location.pathname.startsWith("/r/")) savedSearch.current = location.search;
    if (location.pathname !== path) {
      navigate({ pathname: path, search: path === "/pick" ? "" : savedSearch.current }, { state: { section: current.section, tutorial: true } });
      return;
    }
    let target, resized, frame, positioned = false;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!target?.isConnected) return;
        let rect = target.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const cardHeight = Math.min(window.innerHeight - 24, Math.max(card.current?.offsetHeight || 280, (card.current?.scrollHeight || 0) + 2));
        if (window.innerWidth < 768 && !target.closest(".sticky")) {
          const visibleBottom = window.innerHeight - cardHeight - 24;
          if (rect.bottom > visibleBottom) {
            window.scrollBy({ top: rect.bottom - visibleBottom, behavior: "instant" });
            rect = target.getBoundingClientRect();
          }
        }
        setLayout({ ...tourLayout(rect, window.innerWidth, window.innerHeight, cardHeight), step: current.id, pathname: path });
      });
    };
    const find = () => {
      if (positioned && target?.isConnected) { update(); return; }
      if (positioned) { positioned = false; resized?.disconnect(); setLayout(null); }
      const el = document.querySelector(current.target);
      if (!(el instanceof HTMLElement) || el.hidden || el.closest('[hidden]')) return;
      if (el.querySelector('[data-slot="skeleton"], [role="status"]') && !el.querySelector('svg,button,a,table')) return;
      // Don't explain a file whose only content is its missing/invalid fallback.
      if (/Not available for this region yet|This file failed validation|This file could not be loaded/.test(el.textContent)) return;
      if (!el.getBoundingClientRect().width) return;
      target = el;
      if (!positioned) {
        positioned = true;
        // Prefer a real card or heading wrapper when the full section cannot fit.
        if (el.offsetHeight > window.innerHeight / 2) target = (el.dataset.tour === "places" ? el.querySelector("a") : el.querySelector("h2")?.parentElement) || el;
        target.scrollIntoView({ block: "center", behavior: "instant" });
        const stickyHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--region-bar-h")) || 0;
        if (!target.closest('.sticky') && target.getBoundingClientRect().top < stickyHeight + 16) {
          window.scrollBy({ top: target.getBoundingClientRect().top - stickyHeight - 16, behavior: "instant" });
        }
        resized = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
        resized?.observe(target);
        if (card.current) resized?.observe(card.current);
        card.current?.focus({ preventScroll: true });
      }
      update();
    };
    const observer = new MutationObserver(find);
    observer.observe(document.querySelector("main") || document.body, { childList: true, subtree: true });
    if (card.current) observer.observe(card.current, { childList: true, subtree: true, characterData: true });
    find();
    const timeout = setTimeout(() => {
      if (!positioned) setOmitted((old) => [...old, current.id]);
    }, 3500);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { clearTimeout(timeout); cancelAnimationFrame(frame); observer.disconnect(); resized?.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [current?.id, open, location.pathname]);

  useEffect(() => { if (!steps.length) onOpenChange(false); }, [steps.length]);
  if (!open || !current) return null;
  const activeLayout = layout?.step === current.id && layout?.pathname === location.pathname ? layout : null;
  const go = (delta) => setStep((old) => Math.max(0, Math.min(steps.length - 1, old + delta)));
  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    if (!e.target.closest('input,textarea,select,[contenteditable="true"]')) {
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    }
    if (e.key === "Tab") {
      const buttons = [...card.current.querySelectorAll('button:not(:disabled)')];
      const i = buttons.indexOf(document.activeElement);
      e.preventDefault(); buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    }
  };
  return createPortal(<div className="tour-layer" onKeyDown={onKeyDown}>
    <div className={`tour-shield ${activeLayout ? "" : "tour-waiting"}`} onClick={(e) => e.preventDefault()} />
    {activeLayout ? <div data-testid="tour-highlight" aria-hidden="true" className="tour-highlight" style={activeLayout.box} /> : null}
    <div ref={card} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-description" data-testid="tutorial" className="tour-card" style={activeLayout ? { ...activeLayout.card, "--tour-top": `${activeLayout.card.top}px` } : undefined}>
      <p className="text-muted-foreground text-xs" aria-live="polite">How to use this site · Step {Math.min(step + 1, steps.length)} of {steps.length}</p>
      <h2 id="tour-title" className="text-lg font-semibold">{current.title}</h2>
      <p id="tour-description" className="text-sm leading-relaxed">{activeLayout ? current.text : "Finding this part of the page…"}</p>
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="outline" disabled={step === 0} onClick={() => go(-1)}>Back</Button>
        <Button disabled={!activeLayout} onClick={() => step === steps.length - 1 ? close() : go(1)}>{step === steps.length - 1 ? "Finish" : "Next"}</Button>
      </div>
      <div className="flex justify-between gap-2"><Button variant="ghost" onClick={close}>Skip tutorial</Button><Button variant="ghost" onClick={close}>Close</Button></div>
    </div>
  </div>, document.body);
}
