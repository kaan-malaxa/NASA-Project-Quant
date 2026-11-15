import { forwardRef } from "react";
import { StubFrame } from "./Stub";

/** STUB (A1). Real chart: prompt D1, spec §9.7. */
export const DriftChart = forwardRef(function DriftChart({ drift, region, trustedThrough }, ref) {
  const mine = (drift ?? []).filter((d) => d.region === region).length;
  return (
    <StubFrame
      ref={ref}
      name="DriftChart"
      detail={`${mine} of ${drift?.length ?? 0} drift rows for ${region} · trusted through ${trustedThrough}`}
    />
  );
});
