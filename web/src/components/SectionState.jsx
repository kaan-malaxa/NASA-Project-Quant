import { Skeleton } from "@/components/ui/skeleton";

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
 *           hideWhenAbsent?: boolean, skeletonClassName?: string }} props
 */
export default function SectionState({ state, title, children, hideWhenAbsent = false, skeletonClassName = "h-40" }) {
  const status = state?.status ?? "loading";

  if (state?.status === "ok") return children?.(state.data);
  if (status === "loading") {
    return (
      <div role="status" aria-label={title ? `Loading ${title}` : "Loading"} data-state="loading">
        <Skeleton className={`w-full ${skeletonClassName}`} />
      </div>
    );
  }
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
