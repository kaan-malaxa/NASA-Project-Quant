import { useLayoutEffect, useRef } from "react";

/** Sticky block under the header (below the SAMPLE banner); publishes its height as --region-bar-h. */
export default function StickyBar({ children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    const set = () => root.style.setProperty("--region-bar-h", `${el.offsetHeight}px`);
    set();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(set) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty("--region-bar-h");
    };
  }, []);
  return (
    <div
      ref={ref}
      className="bg-background/95 sticky top-[var(--sticky-offset,0px)] z-40 -mx-4 border-b px-4 backdrop-blur"
    >
      {children}
    </div>
  );
}
