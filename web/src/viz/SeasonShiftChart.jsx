import { forwardRef } from "react";
import { StubFrame } from "./Stub";

/** STUB (A1). Real chart: prompt D1, spec §9.7. */
export const SeasonShiftChart = forwardRef(function SeasonShiftChart({ season }, ref) {
  const windows = season?.windows ?? [];
  const years = windows.reduce((s, w) => s + (w.by_year?.length ?? 0), 0);
  return (
    <StubFrame
      ref={ref}
      name="SeasonShiftChart"
      detail={`${windows.length} windows · ${years} by_year rows`}
    />
  );
});
