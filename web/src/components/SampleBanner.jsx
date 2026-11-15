import { TriangleAlert } from "lucide-react";
import { useIsSample } from "@/data/SampleContext.jsx";

export const SAMPLE_BANNER_TEXT = "SAMPLE DATA: these numbers are placeholders, not results.";

/** Fixed, unmissable banner. Readable without colour: icon, bold capitals, thick border. */
export default function SampleBanner() {
  const isSample = useIsSample();
  if (!isSample) return null;
  return (
    <div
      role="status"
      data-testid="sample-banner"
      className="bg-warning text-warning-foreground sticky top-0 z-50 border-y-4 border-current px-4 py-2 text-center text-sm font-bold tracking-wide"
    >
      <TriangleAlert aria-hidden="true" className="mr-2 inline size-4 align-[-2px]" />
      {SAMPLE_BANNER_TEXT}
    </div>
  );
}
