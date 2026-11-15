// Legend (spec §9.6, prompt B3): the colour key for the calendars.
// activity: the Inferno ramp from 0 to the highest value, in the given unit, plus the distinct
//           "0 (covered, nothing burning)" swatch.
// anomaly:  the PuOr ramp labelled "quieter than usual" · "typical" · "busier than usual", plus the
//           "too little to rank" swatch.
// Both: swatches for "no data" (hatched) and "estimate" (lighter, dashed), exactly as cellStyle draws them.
// Props are {scale, unit} only (contracts §8), so the top of the activity ramp is labelled "highest",
// not with a number; the chart's own tooltip gives values.

import { forwardRef, useId, useMemo } from "react";
import { VizDefs } from "./defs";
import { mergeRefs, useElementWidth } from "./hooks";
import {
  CHART_FONT,
  KIND_STYLE,
  UNRANKED_LABEL,
  UNRANKED_STYLE,
  ZERO_STYLE,
  activityInterpolator,
  anomalyInterpolator,
} from "./theme";

const STOPS = 16;

/** @type {import("react").ForwardRefRenderFunction<SVGSVGElement, import("./types").LegendProps>} */
function LegendImpl({ scale, unit }, ref) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [measureRef, measured] = useElementWidth(480);
  const rootRef = useMemo(() => mergeRefs(ref, measureRef), [ref, measureRef]);

  const W = Math.max(240, measured);
  const isActivity = scale === "activity";
  const interp = isActivity ? activityInterpolator : anomalyInterpolator;
  const left = isActivity ? 52 : 8; // room for the zero swatch on the activity legend
  const rampW = Math.min(320, W - left - 8);
  const rampY = isActivity ? 6 : 20;
  const rampH = 12;
  const font = { fill: "var(--fr-muted)", fontSize: CHART_FONT.min };

  // Swatch row below the ramp.
  const swatchY = rampY + rampH + (isActivity ? 50 : 34); // activity has the unit line above the swatches
  const swatches = [
    {
      key: "nodata",
      label: "no data",
      style: { fill: KIND_STYLE.missing.fill, stroke: "var(--fr-border)", strokeWidth: 0.5 },
    },
    {
      key: "estimate",
      label: "estimate",
      style: {
        fill: interp(0.75),
        fillOpacity: KIND_STYLE.estimated.fillOpacity,
        stroke: KIND_STYLE.estimated.stroke,
        strokeWidth: KIND_STYLE.estimated.strokeWidth,
        strokeDasharray: KIND_STYLE.estimated.strokeDasharray,
      },
    },
  ];
  if (!isActivity) {
    swatches.push({
      key: "unranked",
      label: "too little to rank",
      style: {
        fill: UNRANKED_STYLE.fill,
        fillOpacity: 1,
        stroke: UNRANKED_STYLE.stroke,
        strokeWidth: UNRANKED_STYLE.strokeWidth,
        strokeDasharray: UNRANKED_STYLE.strokeDasharray,
      },
    });
  }
  // Lay swatches left to right, wrapping when the row is full.
  let sx = 8;
  let sy = swatchY;
  const placed = swatches.map((s) => {
    const w = 18 + s.label.length * CHART_FONT.min * 0.58 + 16;
    if (sx + w > W && sx > 8) {
      sx = 8;
      sy += 20;
    }
    const at = { ...s, x: sx, y: sy };
    sx += w;
    return at;
  });
  const H = sy + 14;

  const aria = isActivity
    ? `Colour key: from dark (little burning) to bright (the most burning), in ${unit}. ` +
      "Exactly zero has its own outlined swatch. Hatched means no data; a lighter cell with a dashed outline is an estimate."
    : "Colour key: purple is quieter than usual, light is typical, orange is busier than usual. " +
      `Dotted outline: ${UNRANKED_LABEL} Hatched means no data; a lighter cell with a dashed outline is an estimate.`;

  return (
    <svg
      ref={rootRef}
      className="fr-viz"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label={aria}
      style={{ display: "block", maxWidth: "100%" }}
    >
      <VizDefs />
      <defs>
        <linearGradient id={`${uid}-ramp`} x1="0" x2="1" y1="0" y2="0">
          {Array.from({ length: STOPS + 1 }, (_, i) => (
            <stop key={i} offset={`${(i / STOPS) * 100}%`} stopColor={interp(i / STOPS)} />
          ))}
        </linearGradient>
      </defs>

      {isActivity && (
        <g>
          <rect
            x={8}
            y={rampY}
            width={rampH + 2}
            height={rampH}
            style={{ fill: ZERO_STYLE.fill, stroke: ZERO_STYLE.stroke, strokeWidth: 1 }}
          />
          <text x={8 + (rampH + 2) / 2} y={rampY + rampH + 14} textAnchor="middle" style={font}>
            0
          </text>
        </g>
      )}

      <rect x={left} y={rampY} width={rampW} height={rampH} rx={2} style={{ fill: `url(#${uid}-ramp)` }} />

      {isActivity ? (
        <>
          <text x={left + rampW} y={rampY + rampH + 14} textAnchor="end" style={font}>
            highest
          </text>
          <text x={8} y={rampY + rampH + 28} style={{ ...font, fontSize: CHART_FONT.min }}>
            {unit}
          </text>
        </>
      ) : (
        <>
          <line
            x1={left + rampW / 2}
            x2={left + rampW / 2}
            y1={rampY - 3}
            y2={rampY + rampH}
            style={{ stroke: "var(--fr-text)", strokeWidth: 1 }}
          />
          <text x={left + rampW / 2} y={rampY - 6} textAnchor="middle" style={font}>
            typical
          </text>
          <text x={left} y={rampY + rampH + 14} style={font}>
            quieter than usual
          </text>
          <text x={left + rampW} y={rampY + rampH + 14} textAnchor="end" style={font}>
            busier than usual
          </text>
        </>
      )}

      {placed.map((s) => (
        <g key={s.key} transform={`translate(${s.x},${s.y - 10})`}>
          <rect width={14} height={12} x={0.5} y={0.5} style={s.style} />
          <text x={20} y={10} style={{ fill: "var(--fr-text)", fontSize: CHART_FONT.min }}>
            {s.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export const Legend = forwardRef(LegendImpl);
