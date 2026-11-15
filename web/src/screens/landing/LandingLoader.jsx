import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchJson } from "@/data/fetchJson.js";
import { regionFilePath } from "@/data/files.js";
import {
  LOADER,
  easeInOutCubic,
  fibonacciSphere,
  lineTargets,
  loaderTimeline,
  loaderYears,
  slotCount,
  statusWord,
  stepProgress,
  yearAt,
} from "./loaderMath.js";

/*
 * Landing loader: the project in three seconds, drawn like a satellite control screen on a plain 2D canvas with its
 * own 3D projection (no three.js, so it is tiny, lives in the main bundle and appears before the 3D globe chunk).
 *
 *   one dotted ball, years counting up -> it splits into two (the second with more, smaller dots) at the year the new
 *   sensor joined -> years run on to the last year -> once loading is done the two merge into one -> it flattens into
 *   a line of dots -> the loader fades out.
 *
 * The balls are full and see-through: dots on the back half too, painted back to front, smaller and dimmer with
 * depth, each a flat disc on the surface (round facing the viewer, a thin ellipse at the rim). Splits, merges and the
 * flatten move the dots through 3D space and are projected with perspective every frame.
 * HUD: drifting grid, corner brackets, a tilted orbit ring per ball with a travelling dot, a scan sweep, an instrument
 * year readout, a real progress line and a status line. Colours are the site's tokens; one accent (--primary).
 * Years come from ruler.json (loaderYears); timing is loaderTimeline (both pure and unit-tested).
 */

const MODIS_DOTS = 400;
const VIIRS_DOTS = 1000; // denser: finer detail
const MODIS_DISC = 0.05; // dot radius as a share of the ball radius (small: halftone, not polka dots)
const VIIRS_DISC = 0.03;
const CAMERA = 4.5; // camera distance in ball radii: the near side looks a little bigger than the far side
const SPIN = 0.55; // radians per second, the same for every ball
const AXIS_TILT = 0.35; // the spin axis leans about 20 degrees from vertical...
const WOBBLE = 0.12; // ...and wobbles, so the poles move
const LINE_DOT = 1.2; // px radius of the dots on the final line (shrunk with the ball dots)
const RING = 1.24; // orbit ring radius / ball radius
const TRAIL_EVERY = 9; // one dot in this many leaves a trail during the split and the merge
const TRAIL_LEN = 6;
const SWEEP_PERIOD = 2400; // ms between scan sweeps
const SWEEP_TIME = 1100; // ms a sweep takes
const PULSE_TIME = 600;
const MONO_FALLBACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

const rotY = ([x, y, z], a) => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
const rotX = ([x, y, z], a) => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
const rotZ = ([x, y, z], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z];
const clamp01 = (x) => Math.min(1, Math.max(0, x));

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
 * @param {ReturnType<import("./readiness.js").createReadiness>} props.tracker the landing page's readiness tasks: the
 *   loader ends only when every one is done (and the 3 s minimum has passed), or at the 8 s limit
 * @param {() => void} props.onDone called after the fade
 */
export default function LandingLoader({ tracker, onDone }) {
  const [fading, setFading] = useState(false);
  const canvasRef = useRef(null);
  const rootRef = useRef(null);
  const yearsRef = useRef(undefined); // undefined = still loading ruler.json, null = not available
  const loadedAt = useRef(null);
  const skippedAt = useRef(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const [t0] = useState(() => performance.now()); // the loader appeared

  // ruler.json (cached by the readiness tracker's fetch) gives the years.
  useEffect(() => {
    let alive = true;
    loadYears()
      .catch(() => null)
      .then((y) => {
        if (alive) yearsRef.current = y;
      });
    return () => {
      alive = false;
    };
  }, []);

  // "Loaded" = every readiness task is done.
  useEffect(() => {
    const check = () => {
      if (loadedAt.current === null && tracker.allDone()) loadedAt.current = performance.now() - t0;
      // For checking load times: "task:ms" for each task ("!" = failed, "-" = pending).
      rootRef.current?.setAttribute(
        "data-timings",
        tracker
          .timings()
          .map((t) => `${t.id}:${t.ms ?? "-"}${t.ok === false ? "!" : ""}`)
          .join(" "),
      );
    };
    check();
    return tracker.subscribe(check);
  }, [tracker, t0]);

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
    const C = {
      fg: token("--foreground", "currentColor"),
      primary: token("--primary", "currentColor"),
      muted: token("--muted-foreground", "currentColor"),
      mono: token("--font-mono", MONO_FALLBACK),
    };
    const sets = { modis: fibonacciSphere(MODIS_DOTS), viirs: fibonacciSphere(VIIRS_DOTS) };
    let last = t0;
    let frame = 0;
    let frames = 0;
    let ema = 16;
    let trailsOn = true; // dropped first if the frame rate falls
    const trails = new Map();
    let line = null; // the flatten: dots frozen in 3D where they were, and their slots on the line
    let shown = 0; // progress on screen
    let lastYear = null;
    let prevYear = null; // the year before the last change (for the roll)
    let yearChangedAt = -1e9;
    let fadeFired = false;
    let doneTimer = 0;

    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
      if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w, h };
    };

    const draw = (nowAbs) => {
      const now = nowAbs - t0;
      const dt = Math.min(100, Math.max(0, nowAbs - last));
      last = nowAbs;
      frames++;
      ema = ema * 0.9 + dt * 0.1;
      if (frames > 30 && ema > 26) trailsOn = false;

      const tl = loaderTimeline({ now, loadedAt: loadedAt.current, skippedAt: skippedAt.current });
      const years = yearsRef.current || null;
      const year = yearAt(now, years);
      shown = stepProgress(shown, tracker.progress(), dt);
      const status = statusWord({ pendingWord: tracker.word(), stage: tl.stage });
      const root = rootRef.current;
      root?.setAttribute("data-stage", tl.stage);
      if (year !== null) root?.setAttribute("data-year", String(year));
      root?.setAttribute("data-progress", String(Math.floor(shown * 100)));
      root?.setAttribute("data-status", status);
      root?.setAttribute("data-pending", tracker.pending().join(" "));

      if (tl.fade > 0 && !fadeFired) {
        fadeFired = true;
        setFading(true);
      }
      if (tl.done) {
        clearTimeout(doneTimer);
        doneTimer = setTimeout(() => doneRef.current?.(), 0);
        return;
      }
      frame = requestAnimationFrame(draw); // browsers pause this while the tab is hidden
      if (!ctx) return;

      const { w, h } = size();
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      const narrow = w < 640;
      const R = Math.max(30, Math.min(0.15 * h, (w - 32) / 3.9)); // single ball: about 30 % of the height
      const cx = w / 2;
      const cy = h / 2 - (narrow ? 30 : 40);
      const Dc = CAMERA * R;
      const project = (x, y, z) => {
        const s = Dc / (Dc - z);
        return [cx + x * s, cy - y * s, s];
      };

      // ---- HUD frame: faint drifting grid, corner brackets ----
      const step = narrow ? 28 : 44;
      const drift = (now * 0.006) % step;
      ctx.strokeStyle = C.fg;
      ctx.globalAlpha = 0.045;
      ctx.beginPath();
      for (let x = -step + drift; x < w; x += step) {
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, h);
      }
      for (let y = -step + drift; y < h; y += step) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(w, Math.round(y) + 0.5);
      }
      ctx.stroke();
      const inset = narrow ? 14 : 24;
      const arm = narrow ? 16 : 26;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      for (const [x, y, sx, sy] of [
        [inset, inset, 1, 1],
        [w - inset, inset, -1, 1],
        [inset, h - inset, 1, -1],
        [w - inset, h - inset, -1, -1],
      ]) {
        const px = Math.round(x) + 0.5;
        const py = Math.round(y) + 0.5;
        ctx.moveTo(px, py + sy * arm);
        ctx.lineTo(px, py);
        ctx.lineTo(px + sx * arm, py);
      }
      ctx.stroke();

      // ---- the balls, in 3D ----
      const apart = tl.split * (1 - tl.merge); // 0 = one ball, 1 = side by side
      const moving = tl.merge > 0 ? tl.merge : tl.split; // progress of the move under way
      const arc = R * 0.5 * Math.sin(Math.PI * clamp01(moving)); // pass through depth, not just across the screen
      const rSide = R * (1 - 0.2 * apart);
      const off = 0.975 * R * apart;
      const spin = (now / 1000) * SPIN;
      const lean = AXIS_TILT + WOBBLE * Math.sin(now / 1300);
      const nod = WOBBLE * Math.cos(now / 1700);
      const orient = (p) => rotX(rotZ(rotY(p, spin), lean), nod);
      const balls = [];
      if (tl.flat === 0) {
        const modisA = 1 - easeInOutCubic(tl.merge);
        const viirsA = Math.max(tl.split, tl.merge);
        if (modisA > 0.01) {
          balls.push({
            key: "m",
            pts: sets.modis,
            disc: MODIS_DISC,
            c: [-off, 0, arc],
            r: rSide,
            a: modisA,
            color: C.fg,
          });
        }
        if (viirsA > 0.01) {
          balls.push({
            key: "v",
            pts: sets.viirs,
            disc: VIIRS_DISC,
            c: [off, 0, -arc],
            r: rSide,
            a: viirsA,
            color: C.primary,
          });
        }
      }

      const items = [];
      for (const b of balls) {
        b.pts.forEach((p, i) => {
          const n = orient(p);
          items.push({
            trail: i % TRAIL_EVERY === 0 ? `${b.key}${i}` : null,
            wx: b.c[0] + n[0] * b.r,
            wy: b.c[1] + n[1] * b.r,
            wz: b.c[2] + n[2] * b.r,
            n,
            rr: b.disc * b.r,
            a: b.a,
            color: b.color,
          });
        });
      }
      let flatK = 0;
      if (tl.flat > 0) {
        // Flatten the merged ball into one horizontal line of dots, moving through 3D space.
        if (!line) {
          const from = sets.viirs.map((p) => {
            const n = orient(p);
            return { wx: n[0] * R, wy: n[1] * R, wz: n[2] * R, n, rr: VIIRS_DISC * R };
          });
          const length = Math.min(w * 0.8, R * 3.4);
          line = {
            from,
            length,
            xs: lineTargets(
              from.map((d) => d.wx),
              0,
              length,
              slotCount(length),
            ),
          };
        }
        flatK = tl.flat;
        line.from.forEach((d, i) => {
          const k = flatK;
          const nx = d.n[0] * (1 - k);
          const ny = d.n[1] * (1 - k);
          const nz = d.n[2] + (1 - d.n[2]) * k; // the discs turn to face the viewer
          const len = Math.hypot(nx, ny, nz) || 1;
          items.push({
            trail: null,
            wx: d.wx + (line.xs[i] - d.wx) * k,
            wy: d.wy * (1 - k),
            wz: d.wz * (1 - k),
            n: [nx / len, ny / len, nz / len],
            rr: d.rr + (LINE_DOT - d.rr) * k,
            a: 1,
            color: C.primary,
          });
        });
      }
      items.sort((p, q) => p.wz - q.wz); // painter's order: far first

      // ---- orbit rings: back halves before the dots, front halves (and the travelling dots) after ----
      const ringFade = 1 - flatK;
      const ringPoint = (b, t) => {
        const q = rotZ(rotX([Math.cos(t) * RING * b.r, 0, Math.sin(t) * RING * b.r], 0.35), 0.3 + nod);
        return [b.c[0] + q[0], b.c[1] + q[1], b.c[2] + q[2], q[2]];
      };
      const rings = balls.map((b, idx) => ({
        b,
        pts: Array.from({ length: 73 }, (_, j) => ringPoint(b, (j / 72) * Math.PI * 2)),
        sat: ringPoint(b, (now / 1000) * 0.9 + idx * 2.1),
      }));
      const drawRings = (front) => {
        for (const ring of rings) {
          ctx.strokeStyle = C.fg;
          ctx.globalAlpha = (front ? 0.32 : 0.1) * ring.b.a * ringFade;
          ctx.beginPath();
          for (let j = 1; j < ring.pts.length; j++) {
            const p0 = ring.pts[j - 1];
            const p1 = ring.pts[j];
            if (p0[3] + p1[3] >= 0 !== front) continue;
            const a = project(p0[0], p0[1], p0[2]);
            const c = project(p1[0], p1[1], p1[2]);
            ctx.moveTo(a[0], a[1]);
            ctx.lineTo(c[0], c[1]);
          }
          ctx.stroke();
          if (ring.sat[3] >= 0 === front) {
            const s = project(ring.sat[0], ring.sat[1], ring.sat[2]);
            ctx.fillStyle = C.primary;
            ctx.globalAlpha = (front ? 1 : 0.35) * ring.b.a * ringFade;
            ctx.beginPath();
            ctx.arc(s[0], s[1], 1.7, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      };
      drawRings(false);

      // ---- dots (with the scan sweep and, on the final line, a left-to-right scan) ----
      const sweepPhase = now % SWEEP_PERIOD;
      const sweeping = flatK === 0 && sweepPhase < SWEEP_TIME;
      const sweepY = cy - 1.12 * R + (2.24 * R * sweepPhase) / SWEEP_TIME; // stays within the balls, clear of the text
      const lineLen = line?.length ?? 0;
      const lineScanX = flatK > 0 ? cx - lineLen / 2 + clamp01((flatK - 0.3) / 0.7) * lineLen : null;
      const trailing = trailsOn && moving > 0 && moving < 1 && flatK === 0;
      if (!trailing) trails.clear();
      for (const d of items) {
        const [x, y, s] = project(d.wx, d.wy, d.wz);
        const [nx, ny, nz] = d.n;
        const depth = (nz + 1) / 2; // 0 back .. 1 front
        let alpha = (0.18 + 0.82 * depth) * (0.8 + 0.2 * Math.abs(nz)) * d.a;
        let rr = d.rr * s;
        if (sweeping) alpha = Math.min(1, alpha + 0.4 * clamp01(1 - Math.abs(y - sweepY) / 9));
        if (lineScanX !== null) {
          const near = clamp01(1 - Math.abs(x - lineScanX) / 18);
          alpha = Math.min(1, alpha + 0.5 * near);
          rr *= 1 + 0.35 * near;
        }
        ctx.fillStyle = d.color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        // A flat disc on the surface: full size across, foreshortened along the direction it faces.
        ctx.ellipse(x, y, Math.max(0.35, rr * Math.abs(nz)), rr, Math.atan2(-ny, nx), 0, Math.PI * 2);
        ctx.fill();
        if (trailing && d.trail) {
          const hist = trails.get(d.trail) || [];
          hist.push([x, y]);
          if (hist.length > TRAIL_LEN) hist.shift();
          trails.set(d.trail, hist);
        }
      }
      drawRings(true);

      // ---- motion trails (split and merge) ----
      if (trailing) {
        ctx.strokeStyle = C.primary;
        for (const hist of trails.values()) {
          for (let j = 1; j < hist.length; j++) {
            ctx.globalAlpha = 0.28 * (j / hist.length);
            ctx.beginPath();
            ctx.moveTo(hist[j - 1][0], hist[j - 1][1]);
            ctx.lineTo(hist[j][0], hist[j][1]);
            ctx.stroke();
          }
        }
      }

      // ---- a thin ring pulse at the moment of the split and of the merge ----
      const pulse = (start) => {
        const p = (now - start) / PULSE_TIME;
        if (p < 0 || p > 1) return;
        ctx.strokeStyle = C.primary;
        ctx.globalAlpha = 0.5 * (1 - p);
        ctx.beginPath();
        ctx.arc(cx, cy, R * (1 + 1.3 * easeInOutCubic(p)), 0, Math.PI * 2);
        ctx.stroke();
      };
      pulse(LOADER.count1);
      if (tl.merge > 0) pulse(tl.mergeStart);

      if (sweeping) {
        const span = off + RING * rSide + 24;
        ctx.strokeStyle = C.primary;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(cx - span, Math.round(sweepY) + 0.5);
        ctx.lineTo(cx + span, Math.round(sweepY) + 0.5);
        ctx.stroke();
      }

      // ---- readouts below the balls: year with tick marks, progress line with %, status ----
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let y = cy + 1.08 * R + (narrow ? 26 : 32);
      if (year !== null) {
        if (year !== lastYear) {
          if (lastYear !== null) {
            prevYear = lastYear;
            yearChangedAt = now;
          }
          lastYear = year;
        }
        // Digits roll: a changed digit slides up and out while the new one slides in from below (90 ms).
        // Only the real old and new digits are ever drawn, never a made-up number.
        ctx.font = `500 ${narrow ? 18 : 22}px ${C.mono}`;
        ctx.fillStyle = C.muted;
        const cw = ctx.measureText("0").width;
        const now4 = String(year);
        const old4 = prevYear === null ? now4 : String(prevYear);
        const roll = clamp01((now - yearChangedAt) / 90);
        const lift = narrow ? 7 : 9;
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx - cw * 2 - 2, y - lift - 4, cw * 4 + 4, 2 * lift + 8); // the readout window
        ctx.clip();
        for (let i = 0; i < now4.length; i++) {
          const xi = cx + (i - (now4.length - 1) / 2) * cw;
          if (roll < 1 && old4[i] !== now4[i]) {
            ctx.globalAlpha = 1 - roll;
            ctx.fillText(old4[i], xi, y - roll * lift);
            ctx.globalAlpha = roll;
            ctx.fillText(now4[i], xi, y + (1 - roll) * lift);
          } else {
            ctx.globalAlpha = 1;
            ctx.fillText(now4[i], xi, y);
          }
        }
        ctx.restore();
        const half = ctx.measureText("0000").width / 2 + 12;
        const tick = narrow ? 18 : 26;
        ctx.strokeStyle = C.muted;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        for (const sgn of [-1, 1]) {
          const a = cx + sgn * half;
          const b = cx + sgn * (half + tick);
          ctx.moveTo(a, Math.round(y) + 0.5);
          ctx.lineTo(b, Math.round(y) + 0.5);
          ctx.moveTo(Math.round(b) + 0.5, y - 3);
          ctx.lineTo(Math.round(b) + 0.5, y + 4);
        }
        ctx.stroke();
        y += narrow ? 20 : 24;
      }
      const barW = narrow ? 140 : 180;
      const x0 = cx - barW / 2;
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = C.fg;
      ctx.fillRect(x0, Math.round(y), barW, 1);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = C.primary;
      ctx.fillRect(x0, Math.round(y), barW * shown, 1);
      ctx.font = `400 ${narrow ? 10 : 11}px ${C.mono}`;
      ctx.fillStyle = C.muted;
      ctx.textAlign = "left";
      ctx.fillText(`${Math.floor(shown * 100)}%`, x0 + barW + 8, y + 1);
      ctx.textAlign = "center";
      ctx.globalAlpha = 0.8;
      ctx.fillText(status, cx, y + (narrow ? 16 : 18));
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(doneTimer);
    };
    // Runs once; later changes reach the loop through refs and the tracker.
  }, [t0, tracker]);

  const skip = () => {
    if (skippedAt.current === null) skippedAt.current = performance.now() - t0;
  };

  // A cover on top of the page, outside the app root, so the page underneath can be made inert meanwhile.
  return createPortal(
    <div ref={rootRef} data-testid="landing-loader" data-fading={fading} className="landing-loader">
      <div role="status" className="sr-only">
        Loading FireRosetta
      </div>
      <canvas ref={canvasRef} aria-hidden="true" className="landing-loader-canvas" />
      <button type="button" onClick={skip} className="landing-loader-skip">
        Skip
      </button>
    </div>,
    document.body,
  );
}
