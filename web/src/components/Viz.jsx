import { Suspense, useEffect, useState } from "react";
import LoadingFrame from "./LoadingFrame.jsx";

/*
 * Bridge to R6's chart components (contracts section 8, exported from src/viz/index).
 * The module is loaded ASYNCHRONOUSLY (its own chunk), so R6's dependencies (d3, maplibre-gl, terra-draw) never
 * weigh on the first page load. While viz/index does not exist the glob is empty and every component renders a
 * labelled placeholder box (never a substitute chart).
 */
const loaders = import.meta.glob("../viz/index.{js,jsx,ts,tsx}");
const load = Object.values(loaders)[0];

let loaded = load ? null : {}; // null = still loading; {} = no viz module
const ready = load
  ? load().then(
      (m) => (loaded = m),
      () => (loaded = {}),
    )
  : Promise.resolve(loaded);

/** R6's exports once loaded: {} when absent, null while loading. */
export function useViz() {
  const [mod, setMod] = useState(loaded);
  useEffect(() => {
    if (mod === null) ready.then((m) => setMod(m));
  }, [mod]);
  return mod;
}

/** For tests and non-React code: resolves to R6's exports (or {}). */
export const vizReady = ready;

export function hasViz(name, mod) {
  return Boolean(mod && mod[name]);
}

/**
 * <VizSlot name="BrokenRuler" ruler={...} /> renders R6's component with the given props.
 * `ref` is passed through (React 19 treats it as a prop), so charts can hand back their root <svg> for export.
 */
export function VizSlot({ name, placeholderClassName = "h-48", ...props }) {
  const mod = useViz();
  const shape = { FireYearClock: "clock", BrokenRuler: "ruler", TrendBars: "trend", HexMap: "map" }[name] ?? "other";
  const fallback = <LoadingFrame title={`${name} chart`} variant="chart" className={shape === "other" ? placeholderClassName : ""} />;
  const Component = mod?.[name];
  if (mod === null || Component) return <div data-chart-shell={name} className="chart-shell">
    <div className={`chart-frame chart-shell-${shape}`}>{mod === null ? fallback : <Suspense fallback={fallback}><Component {...props} /></Suspense>}</div>
  </div>;
  return (
    <div
      role="img"
      aria-label={`${name} chart is not available yet`}
      data-viz-placeholder={name}
      className={`text-muted-foreground flex w-full items-center justify-center rounded-lg border border-dashed p-4 text-center text-sm ${placeholderClassName}`}
    >
      {name}: chart component not available yet
    </div>
  );
}