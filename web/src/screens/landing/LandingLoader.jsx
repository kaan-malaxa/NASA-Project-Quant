import { useEffect, useRef, useState } from "react";
import {
  LOADER,
  easeInOutCubic,
  fibonacciSphere,
  lineTargets,
  projectPoint,
  slotCount,
} from "./loaderMath.js";

const DOT = "#7dffd6"; // the scene's glow colour (the loader is part of the 3D scene's look, not a page token)
const SPIN = 0.35; // radians per second

/**
 * Full-screen loader for the first visit to the landing page (prompt Phase 3): a turning sphere of dots that, once
 * `finish` turns true, collapses into one horizontal line of dots and fades out, then calls onDone.
 * It sits below the SAMPLE DATA banner (top: --sticky-offset), so the banner stays visible. The page underneath is
 * already rendered, so its title, meta and h1 are there for crawlers and screen readers.
 */
export default function LandingLoader({ finish, onDone }) {
  const canvasRef = useRef(null);
  const finishRef = useRef(finish);
  finishRef.current = finish;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const [fading, setFading] = useState(false);

  // Keep the page from scrolling under the loader (it would start the scroll story unseen).
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    let ctx = null;
    try {
      ctx = canvas?.getContext("2d") ?? null;
    } catch {
      ctx = null;
    }
    const n = 650;
    const sphere = fibonacciSphere(n);
    const started = performance.now();
    let phase = "spin";
    let phaseStart = started;
    let angle = 0;
    let last = started;
    let from = null; // screen positions when the collapse starts
    let targets = null;
    let lineY = 0;
    let frame = 0;
    let fadeTimer = 0;

    const size = () => {
      if (!canvas) return { w: 0, h: 0 };
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
      if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w, h };
    };

    const draw = (now) => {
      const { w, h } = size();
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.22;
      angle += Math.min(0.1, (now - last) / 1000) * SPIN;
      last = now;

      if (phase === "spin" && finishRef.current && now - started >= LOADER.minSpin) {
        phase = "collapse";
        phaseStart = now;
        from = sphere.map((p) => projectPoint(p, angle, 0.35, cx, cy, radius));
        const length = Math.min(w * 0.8, radius * 3.2);
        targets = lineTargets(
          from.map((p) => p.x),
          cx,
          length,
          slotCount(length),
        );
        lineY = cy;
      }

      if (ctx) {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = DOT;
      }
      const k = phase === "spin" ? 0 : easeInOutCubic((now - phaseStart) / LOADER.collapse);
      for (let i = 0; i < n; i++) {
        const p = phase === "spin" ? projectPoint(sphere[i], angle, 0.35, cx, cy, radius) : from[i];
        const x = phase === "spin" ? p.x : p.x + (targets[i] - p.x) * k;
        const y = phase === "spin" ? p.y : p.y + (lineY - p.y) * k;
        const depth = (p.z + 1) / 2; // 0 far .. 1 near
        const r = 0.6 + depth * 1.3 + k * (1.6 - depth * 1.3 - 0.6) * 0.8;
        if (ctx) {
          ctx.globalAlpha = 0.18 + depth * 0.82 + k * (1 - 0.18 - depth * 0.82);
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (phase === "collapse" && k >= 1) {
        phase = "done";
        fadeTimer = setTimeout(() => {
          setFading(true);
          fadeTimer = setTimeout(() => doneRef.current?.(), LOADER.fade);
        }, LOADER.hold);
      }
      if (phase !== "done") frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(fadeTimer);
    };
  }, []);

  return (
    <div
      role="status"
      aria-label="Loading the globe"
      data-testid="landing-loader"
      data-fading={fading}
      className="landing-loader"
    >
      <canvas ref={canvasRef} aria-hidden="true" className="landing-loader-canvas" />
    </div>
  );
}
