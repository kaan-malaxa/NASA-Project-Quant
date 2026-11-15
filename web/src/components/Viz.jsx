/*
 * Bridge to R6's chart components (contracts section 8, exported from src/viz/index).
 * The glob returns {} while viz/index does not exist, so the app still builds; each missing component renders a
 * labelled placeholder box (never a substitute chart). Once R6's index lands, the real components appear with no
 * change here.
 */
const modules = import.meta.glob("../viz/index.{js,jsx,ts,tsx}", { eager: true });

/** Everything R6 exports (components and percentileRank), or {} if viz/index is absent. */
export const viz = Object.values(modules)[0] || {};

export function hasViz(name) {
  return typeof viz[name] === "function" || (viz[name] && typeof viz[name] === "object");
}

/**
 * <VizSlot name="BrokenRuler" ruler={...} /> renders R6's component with the given props.
 * `ref` is passed through (React 19 treats it as a prop), so charts can hand back their root <svg> for export.
 */
export function VizSlot({ name, placeholderClassName = "h-48", ...props }) {
  const Component = viz[name];
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
