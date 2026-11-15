import { forwardRef } from "react";
import { StubFrame } from "./Stub";

/** STUB (A1). Real chart: prompt D1, spec §9.7. */
export const EyesightCurve = forwardRef(function EyesightCurve({ eyesight }, ref) {
  const points = eyesight?.curve?.length ?? 0;
  const bins = eyesight?.binned?.length ?? 0;
  return (
    <StubFrame
      ref={ref}
      name="EyesightCurve"
      detail={`${points} curve points · ${bins} bins · ${eyesight?.status ?? "unknown"}`}
    />
  );
});
