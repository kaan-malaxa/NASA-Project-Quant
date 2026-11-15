import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

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
  if (mod === null) {
    return (
      <div role="status" aria-label={`Loading ${name} chart`}>
        <Skeleton className={`w-full ${placeholderClassName}`} />
      </div>
    );
  }
  const Component = mod[name];
  if (Component) return <Component {...props} />;
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