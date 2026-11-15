import { useEffect, useRef, useState } from "react";
import { fetchJson } from "@/data/fetchJson.js";
import { regionFilePath } from "@/data/files.js";
import {
  easeInOutCubic,
  fibonacciSphere,
  lineTargets,
  loaderTimeline,
  loaderYears,
  slotCount,
  yearAt,
} from "./loaderMath.js";

/*
 * Landing loader: the project in three seconds, drawn on a plain 2D canvas with its own 3D projection (no three.js,
 * so it is tiny, lives in the main bundle and appears before the lazy globe chunk arrives).
 *
 *   one dotted sphere "MODIS", years counting up -> it splits into "MODIS" and "VIIRS" (more, smaller dots) at the
 *   year the new sensor joined -> years run on to the last year -> when loading is done the two merge into one
 *   "Harmonized" sphere -> it flattens into a line of dots -> the loader fades out.
 *
 * Years come from ruler.json (loaderYears); without it the same animation runs with no years and no labels.
 * Colours come from the site's tokens (read from CSS at start). Timing is loaderTimeline (pure, unit-tested).
 */

const MODIS_DOTS = 240;
const VIIRS_DOTS = 640;
const MODIS_DISC = 0.085; // dot radius as a share of the sphere radius
const VIIRS_DISC = 0.05;
const CAMERA = 3.4; // camera distance in sphere radii (perspective)
const SPIN = 0.32; // radians per second
const TILT = 0.38; // the sphere leans its top toward the viewer

function rotate([x, y, z], angle) {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const x1 = x * ca + z * sa;
  const z1 = -x * sa + z * ca;
  const ct = Math.cos(TILT);
  const st = Math.sin(TILT);
  return [x1, y * ct - z1 * st, y * st + z1 * ct];
}

function token(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Finds the default region's ruler.json (first non-synthetic region that lists it) and reads its years. */
async function loadYears() {
  const regions = await fetchJson("regions.json");
  const region = regions.ok ? regions.data.regions.find((r) => r.synthetic !== true) : null;
  if (!region || !(region.files || []).includes("ruler")) return null;
  const ruler = await fetchJson(regionFilePath(region.id, "ruler"));
  return ruler.ok ? loaderYears(ruler.data) : null;
}

/**
 * @param {object} props
 * @param {boolean} props.sceneReady the lazy 3D globe chunk and the Earth texture are ready (or the 8 s fallback)
 * @param {() => void} props.onDone called after the fade
 */
export default function LandingLoader({ sceneReady, onDone }) {
  const canvasRef = useRef(null);
  const rootRef = useRef(null);
  const yearsRef = useRef(undefined); // undefined = still loading ruler.json, null = not available
  const loadedAt = useRef(null);
  const skippedAt = useRef(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const [t0] = useState(() => performance.now()); // the loader appeared
  const [rulerSettled, setRulerSettled] = useState(false);
  const [fading, setFading] = useState(false);

  // ruler.json first: it is small and gives the years.
  useEffect(() => {
    let alive = true;
    loadYears()
      .catch(() => null)
      .then((y) => {
        if (!alive) return;
        yearsRef.current = y;
        setRulerSettled(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // "Loaded" = the globe chunk, the Earth texture and ruler.json are all ready.
  useEffect(() => {
    if (sceneReady && rulerSettled && loadedAt.current === null) loadedAt.current = performance.now() - t0;
  }, [sceneReady, rulerSettled, t0]);

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
    const colors = {
      modis: token("--foreground", "currentColor"),
      viirs: token("--primary", "currentColor"),
      text: token("--foreground", "currentColor"),
      muted: token("--muted-foreground", "currentColor"),
      font: token("--fr-font-sans", "sans-serif"),
    };
    const modis = fibonacciSphere(MODIS_DOTS);
    const viirs = fibonacciSphere(VIIRS_DOTS);
    let angle = 0;
    let last = t0;
    let frame = 0;
    let line = null; // flatten targets, fixed when the flatten starts
    let fadeFired = false;
    let doneTimer = 0;

    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
      if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w, h };
    };

    /** Project the dots of one sphere; returns screen discs for the front-facing ones. */
    const project = (pts, cx, cy, R, disc) => {
      const out = [];
      for (const p of pts) {
        const [x, y, z] = rotate(p, angle);
        if (z <= 0.03) continue; // the far side is hidden by the near side
        const s = CAMERA / (CAMERA - z);
        out.push({
          x: cx + x * R * s,
          y: cy - y * R * s,
          r: disc * R * s,
          squash: z,
          rot: Math.atan2(-y, x),
        });
      }
      return out;
    };

    const drawDiscs = (discs, color, alpha) => {
      if (!ctx || alpha <= 0) return;
      ctx.fillStyle = color;
      for (const d of discs) {
        ctx.globalAlpha = alpha * (0.35 + 0.65 * d.squash);
        ctx.beginPath();
        // A flat disc on the surface: full size across, foreshortened along the direction it faces.
        ctx.ellipse(d.x, d.y, Math.max(0.4, d.r * d.squash), d.r, d.rot, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const label = (text, x, y, size, color, weight = 600) => {
      if (!ctx) return;
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.font = `${weight} ${size}px ${colors.font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x, y);
    };

    const draw = (nowAbs) => {
      const now = nowAbs - t0;
      const tl = loaderTimeline({ now, loadedAt: loadedAt.current, skippedAt: skippedAt.current });
      const years = yearsRef.current || null;
      rootRef.current?.setAttribute("data-stage", tl.stage);
      const y = yearAt(now, years);
      if (y !== null) rootRef.current?.setAttribute("data-year", String(y));

      if (tl.fade > 0 && !fadeFired) {
        fadeFired = true;
        setFading(true);
      }
      if (tl.done) {
        clearTimeout(doneTimer);
        doneTimer = setTimeout(() => doneRef.current?.(), 0);
        return;
      }

      const { w, h } = size();
      angle += Math.min(0.1, (nowAbs - last) / 1000) * SPIN;
      last = nowAbs;
      if (ctx) ctx.clearRect(0, 0, w, h);

      const narrow = w < 640;
      const R = Math.min(w, h) * (narrow ? 0.2 : 0.17);
      const cx = w / 2;
      const cy = h / 2 + (narrow ? 10 : 20);
      const apart = tl.split * (1 - tl.merge); // 0 = one sphere, 1 = side by side
      const offset = Math.min(w * 0.24, R * 1.45) * apart;
      const sideR = R * (1 - 0.22 * apart);

      if (tl.flat > 0) {
        // Flatten the merged sphere into one horizontal line of dots.
        // The dots are frozen where they were when the flatten began, then slide onto evenly spaced slots.
        if (!line) {
          const from = project(viirs, cx, cy, R, VIIRS_DISC);
          const length = Math.min(w * 0.8, R * 3.4);
          line = {
            from,
            xs: lineTargets(
              from.map((d) => d.x),
              cx,
              length,
              slotCount(length),
            ),
          };
        }
        const k = tl.flat;
        const flat = line.from.map((d, i) => ({
          x: d.x + (line.xs[i] - d.x) * k,
          y: d.y + (cy - d.y) * k,
          r: d.r + (2.2 - d.r) * k,
          squash: d.squash + (1 - d.squash) * k,
          rot: d.rot,
        }));
        drawDiscs(flat, colors.viirs, 1);
      } else {
        // MODIS: the original sphere, sliding left; it gives way to the merged sphere during the merge.
        drawDiscs(
          project(modis, cx - offset, cy, sideR, MODIS_DISC),
          colors.modis,
          1 - easeInOutCubic(tl.merge),
        );
        // VIIRS: appears at the split, sliding right; it becomes the merged sphere.
        drawDiscs(
          project(viirs, cx + offset, cy, sideR, VIIRS_DISC),
          colors.viirs,
          Math.max(tl.split, tl.merge),
        );
      }

      if (years) {
        const big = narrow ? 40 : 60;
        label(String(y), cx, cy - R - big * 0.9 - 8, big, colors.text, 750);
        const under = cy + R + (narrow ? 26 : 32);
        if (tl.flat === 0) {
          if (tl.merge >= 0.5) label("Harmonized", cx, under, narrow ? 13 : 15, colors.viirs);
          else if (tl.split > 0.05) {
            label("MODIS", cx - offset, under, narrow ? 13 : 15, colors.modis);
            label("VIIRS", cx + offset, under, narrow ? 13 : 15, colors.viirs);
          } else label("MODIS", cx, under, narrow ? 13 : 15, colors.modis);
        }
      }
      frame = requestAnimationFrame(draw); // browsers pause this while the tab is hidden
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(doneTimer);
    };
    // Runs once; later changes reach the loop through refs.
  }, [t0]);

  const skip = () => {
    if (skippedAt.current === null) skippedAt.current = performance.now() - t0;
  };

  return (
    <div ref={rootRef} data-testid="landing-loader" data-fading={fading} className="landing-loader">
      <div role="status" className="sr-only">
        Loading FireRosetta
      </div>
      <canvas ref={canvasRef} aria-hidden="true" className="landing-loader-canvas" />
      <button type="button" onClick={skip} className="landing-loader-skip">
        Skip
      </button>
    </div>
  );
}
