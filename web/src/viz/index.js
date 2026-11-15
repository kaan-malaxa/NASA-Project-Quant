// Public surface of web/src/viz (plan/02_CONTRACTS.md §8). R5 imports only from here.
// Every chart forwards a `ref` to its root <svg> for PNG/SVG export.
//
// HexMap is a React.lazy component (keeps maplibre-gl out of the main bundle):
// render it inside <Suspense>.

import { lazy } from "react";

export { BrokenRuler } from "./BrokenRuler";
export { FireYearClock } from "./FireYearClock";
export { CalendarHeatmap } from "./CalendarHeatmap";
export { SeasonShiftChart } from "./SeasonShiftChart";
export { TrendBars } from "./TrendBars";
export { PercentileStrip } from "./PercentileStrip";
export { EyesightCurve } from "./EyesightCurve";
export { DriftChart } from "./DriftChart";
export { KindBadge } from "./KindBadge";
export { Legend } from "./Legend";
export { Gallery } from "./Gallery";
export const HexMap = lazy(() => import("./HexMap"));

export { percentileRank } from "./percentile";
