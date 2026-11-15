import { useLayoutEffect, useRef } from "react";
import { TriangleAlert } from "lucide-react";
import { useIsSample } from "@/data/SampleContext.jsx";

export const SAMPLE_BANNER_TEXT = "SAMPLE DATA: these numbers are placeholders, not results.";

/**
 * Fixed, unmissable banner. Readable without colour: icon, bold capitals, thick border.
 * Publishes its height as --sticky-offset so other sticky bars (the region section nav) sit below it.
 */
export default function SampleBanner() {
  const isSample = useIsSample();
  const ref = useRef(null);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!el) {
      root.style.setProperty("--sticky-offset", "0px");
      return;
    }
    const set = () => root.style.setProperty("--sticky-offset", `${el.offsetHeight}px`);
    set();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(set) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.setProperty("--sticky-offset", "0px");
    };
  }, [isSample]);

  if (!isSample) return null;
  return (
    <div
      ref={ref}
      role="status"
      data-testid="sample-banner"
      className="bg-warning text-warning-foreground border-y-4 border-current px-4 py-2 text-center text-sm font-bold tracking-wide"
    >
      <TriangleAlert aria-hidden="true" className="mr-2 inline size-4 align-[-2px]" />
      {SAMPLE_BANNER_TEXT}
    </div>
  );
}
