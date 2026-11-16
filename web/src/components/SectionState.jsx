import { useLayoutEffect, useRef } from "react";
import LoadingFrame from "./LoadingFrame.jsx";

const MESSAGES = {
  lazy: "This section will appear when you scroll to it.",
  absent: "Not available for this region yet.",
  invalid: "This file failed validation.",
  network: "This file could not be loaded.",
};

/**
 * Renders children(data) when `state` is ok; otherwise a skeleton, a calm "not available" note, or the
 * validation / network failure with its reason in a <details>. Never throws.
 * @param {{ state: import("@/data/state.js").FileState | undefined, title?: string, children?: (data: any) => any,
 *           hideWhenAbsent?: boolean, skeletonClassName?: string, variant?: string }} props
 */
export default function SectionState({ state, title, children, hideWhenAbsent = false, skeletonClassName = "h-40", variant = undefined }) {
  const status = state?.status ?? "loading";
  const content = useRef(null);
  const lastHeight = useRef(0);
  useLayoutEffect(() => {
    if (status !== "ok" || !content.current) return;
    const record = () => { lastHeight.current = content.current?.getBoundingClientRect().height || 0; };
    record();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(record);
    observer?.observe(content.current);
    return () => observer?.disconnect();
  }, [status, state]);

  if (state?.status === "ok") return <div ref={content} data-content-frame={title}>{children?.(state.data)}</div>;
  if (status === "loading") {
    const layouts = { Verdict: "verdict", Calendar: "calendar", "Critical weeks": "critical", "This week": "week", Map: "map", "In this period": "stats", Eras: "table", "Methods data": "methods", "Area data": "area" };
    return <LoadingFrame title={title ?? "content"} variant={variant ?? layouts[title] ?? "chart"} className={variant || layouts[title] ? "" : skeletonClassName} style={lastHeight.current ? { height: lastHeight.current, overflow: "hidden" } : undefined} />;
  }
  if (status === "lazy" && title === "Map") return <LoadingFrame title="Map" variant="map" active={false} />;
  if (status === "absent" && hideWhenAbsent) return null;

  const message = MESSAGES[status] ?? MESSAGES.absent;
  return (
    <div data-state={status} className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
      <p>
        {title ? <span className="text-foreground font-medium">{title}: </span> : null}
        {message}
      </p>
      {(state?.status === "invalid" || state?.status === "network") && state.detail ? (
        <details className="mt-2">
          <summary className="cursor-pointer">Why</summary>
          <p className="mt-1 font-mono text-xs break-words">{state.detail}</p>
        </details>
      ) : null}
    </div>
  );
}
