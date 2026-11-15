import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** True when the visitor asked the system for less motion. */
export function usePrefersReducedMotion() {
  const read = () =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(QUERY).matches;
  const [reduced, setReduced] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(QUERY);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/** True while the element is on screen and the tab is visible; used to pause the 3D scene. */
export function useOnScreen(ref) {
  const [inView, setInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  useEffect(() => {
    const on = () => setTabVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return inView && tabVisible;
}

/** Can this browser draw WebGL at all? Checked once, before the 3D chunk is requested. */
export function webglAvailable() {
  if (typeof window === "undefined" || typeof window.WebGLRenderingContext === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
