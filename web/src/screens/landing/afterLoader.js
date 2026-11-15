import { useEffect } from "react";
import { fetchJson } from "@/data/fetchJson.js";
import { regionFilePath } from "@/data/files.js";

/**
 * While the landing loader is up, the page under it is hidden from screen readers and keyboard (inert, aria-hidden).
 * The SAMPLE DATA banner is not touched. The loader itself sits outside the app root (a portal on <body>).
 */
export function useInertBehind(active) {
  useEffect(() => {
    if (!active) return;
    const parts = [...document.querySelectorAll("#root header, #root main, #root footer")];
    for (const el of parts) {
      el.setAttribute("inert", "");
      el.setAttribute("aria-hidden", "true");
    }
    return () => {
      for (const el of parts) {
        el.removeAttribute("inert");
        el.removeAttribute("aria-hidden");
      }
    };
  }, [active]);
}

/**
 * The region page's main files, fetched in the background so "Pick a place" and #/r/<region> open at once.
 * The very large map files (hex.json, outline.geojson) and the CSV are left for the region page itself.
 */
export const PREFETCH_FILES = [
  "weekly",
  "monthly",
  "daily",
  "climatology",
  "season",
  "trend",
  "nowcast",
  "calibration",
];

const idle = (fn) =>
  typeof window.requestIdleCallback === "function"
    ? window.requestIdleCallback(fn, { timeout: 4000 })
    : window.setTimeout(fn, 200);
const cancelIdle = (id) =>
  typeof window.cancelIdleCallback === "function" ? window.cancelIdleCallback(id) : window.clearTimeout(id);

/**
 * After the landing page is ready (`when`), prefetch the region page chunk and the default region's main JSON, one
 * item per idle period, starting a couple of seconds later so it never competes with the landing page.
 * Skipped when the visitor asked to save data.
 */
export function usePrefetchRegion(region, when) {
  useEffect(() => {
    if (!when || !region) return;
    if (typeof navigator !== "undefined" && navigator.connection?.saveData) return;
    const jobs = [
      () => import("@/screens/Region.jsx"),
      ...PREFETCH_FILES.filter((n) => (region.files || []).includes(n)).map(
        (n) => () => fetchJson(regionFilePath(region.id, n)),
      ),
    ];
    let handle = 0;
    let stopped = false;
    const next = () => {
      const job = jobs.shift();
      if (!job || stopped) return;
      handle = idle(() => {
        Promise.resolve()
          .then(job)
          .catch(() => {})
          .then(next);
      });
    };
    const start = window.setTimeout(next, 2000);
    return () => {
      stopped = true;
      window.clearTimeout(start);
      cancelIdle(handle);
    };
  }, [region, when]);
}
