// Loaded through React.lazy from index.js so maplibre-gl stays out of the main bundle (spec D2).
// Keep this file the only place that imports maplibre-gl / h3-js / terra-draw.
import { forwardRef } from "react";
import { StubFrame } from "./Stub";

/** STUB (A1). Real map: prompt D2, spec §9.8. */
const HexMap = forwardRef(function HexMap({ hex, metric, selectedCells }, ref) {
  return (
    <StubFrame
      ref={ref}
      name="HexMap"
      detail={`${hex?.cells?.length ?? 0} cells · metric ${metric} · ${selectedCells?.length ?? 0} selected`}
    />
  );
});

export default HexMap;
