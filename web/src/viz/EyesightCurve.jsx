// EyesightCurve (spec §9.7, prompt D1, SD-16/SD-17): how likely Aqua was to see a fire that S-NPP saw,
// by fire strength. x = FRP in MW on a log scale (0.5–2000), y = chance Aqua saw it (0–100 %).
// The fitted curve with its band, binned observed shares sized by n, a dotted line at the ceiling c,
// and a status chip (validated / exploratory). Status "absent" → a one-line message.

import { area, line, scaleLog, scaleLinear } from "d3";
import { CircleCheck, FlaskConical } from "lucide-react";
import { forwardRef, useId, useMemo } from "react";
import { mergeRefs, useElementWidth } from "./hooks";
import { FRP_DOMAIN, binRadius, ceilingPercent, cleanCurve } from "./methodsLayout";
import { wrapText } from "./smallLayout";
import { CHART_FONT, formatNumber } from "./theme";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const pct = (p) => (isNum(p) ? `${Math.round(p * 100)}%` : "no data");

const CHIP = {
  validated: {
    Icon: CircleCheck,
    text: "Validated",
    color: "var(--fr-accent)",
    dash: undefined,
  },
  exploratory: {
    Icon: FlaskConical,
    text: "Exploratory: not used in any result",
    color: "var(--fr-warning)",
    dash: "4 3",
  },
};

/** @type {import("react").ForwardRefRenderFunction<SVGSVGElement, import("./types").EyesightCurveProps>} */
function EyesightCurveImpl({ eyesight }, ref) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [measureRef, measured] = useElementWidth(640);
  const rootRef = useMemo(() => mergeRefs(ref, measureRef), [ref, measureRef]);
  const W = Math.max(280, measured);
  const narrow = W < 520;
  const muted = { fill: "var(--fr-muted)", fontSize: CHART_FONT.min };
  const status = eyesight?.status ?? "absent";

  // ---- absent: one line ----
  if (status === "absent" || !eyesight) {
    const msg = "No eyesight curve was fitted for this region.";
    return (
      <svg
        ref={rootRef}
        className="fr-viz"
        viewBox={`0 0 ${W} 32`}
        width="100%"
        height={32}
        role="img"
        tabIndex={0}
        aria-label={msg}
        style={{ display: "block", maxWidth: "100%" }}
      >
        <text x={8} y={20} style={{ fill: "var(--fr-muted)", fontSize: CHART_FONT.body }}>
          {msg}
        </text>
      </svg>
    );
  }

  const chip = CHIP[status] ?? CHIP.exploratory;
  const curve = cleanCurve(eyesight.curve);
  const binned = (eyesight.binned ?? []).filter((b) => isNum(b.frp_mw) && b.frp_mw > 0 && isNum(b.p_obs));
  const c = eyesight.params?.c;
  const cPct = ceilingPercent(c);
  const rising = isNum(eyesight.params?.b) && eyesight.params.b > 0;

  // ---- caption: the takeaway in words ----
  const caption =
    curve.length === 0
      ? "No curve data for this region."
      : (rising
          ? "The stronger the fire, the more likely Aqua saw it."
          : "In this region the chance Aqua saw a fire did not clearly rise with fire strength.") +
        (cPct !== null
          ? ` Even strong fires were seen only about ${cPct}% of the time, because Aqua was not always looking.`
          : "") +
        (status === "exploratory"
          ? " This fit did not pass its checks, so it is shown for transparency only."
          : "");
  const capLines = wrapText(caption, W - 16, CHART_FONT.small);
  const chipW = 24 + chip.text.length * CHART_FONT.small * 0.6 + 10;
  const capTop = 34;
  const capH = capLines.length * 16;

  // ---- geometry ----
  // Under the axis: its title and the key for the dots, both wrapped to the width (C1/D1: clipped at 360 px).
  const footLines = [
    ...wrapText("Fire strength (fire radiative power, MW, log scale)", W - 16, CHART_FONT.min),
    ...(binned.length > 0
      ? wrapText(
          "Dots: share Aqua saw, per strength bin (bigger dot = more fire cell-days)",
          W - 16,
          CHART_FONT.min,
        )
      : []),
  ];
  const M = { top: capTop + capH + 30, right: 16, bottom: 26 + footLines.length * 14, left: 46 };
  const plotH = narrow ? 200 : 240;
  const plotB = M.top + plotH;
  const H = plotB + M.bottom;
  const x = scaleLog()
    .domain(FRP_DOMAIN)
    .range([M.left, W - M.right])
    .clamp(false);
  const y = scaleLinear().domain([0, 1]).range([plotB, M.top]);
  const xTicks = [1, 10, 100, 1000].filter((t) => t >= FRP_DOMAIN[0] && t <= FRP_DOMAIN[1]);
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const maxN = Math.max(0, ...binned.map((b) => (isNum(b.n) ? b.n : 0)));
  const withBand = curve.filter((p) => isNum(p.lo) && isNum(p.hi));
  const bandPath =
    withBand.length > 1
      ? area()
          .x((p) => x(p.frp_mw))
          .y0((p) => y(p.lo))
          .y1((p) => y(p.hi))(withBand)
      : null;
  const linePath =
    curve.length > 1
      ? line()
          .x((p) => x(p.frp_mw))
          .y((p) => y(p.p))(curve)
      : null;
  const clipId = `${uid}-plot`;
  const ceilLabel = cPct !== null ? `Aqua was looking about ${cPct}% of the time` : null;

  const aria =
    `Eyesight curve: chance Aqua saw a fire, by fire strength (fire radiative power, MW, log scale). ` +
    `${chip.text}. ${caption} ` +
    (eyesight.n_celldays ? `Fitted on ${formatNumber(eyesight.n_celldays)} fire cell-days.` : "");

  return (
    <>
      <svg
        ref={rootRef}
        className="fr-viz"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        tabIndex={0}
        aria-label={aria}
        style={{ display: "block", maxWidth: "100%" }}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={M.left} y={M.top - 2} width={W - M.right - M.left} height={plotH + 4} />
          </clipPath>
        </defs>

        <g aria-hidden="true">
          {/* status chip: icon + text + border style, not colour alone */}
          <g transform="translate(8,6)">
            <rect
              width={Math.min(chipW, W - 16)}
              height={22}
              rx={11}
              style={{
                fill: "var(--fr-surface)",
                stroke: chip.color,
                strokeWidth: 1.5,
                strokeDasharray: chip.dash,
              }}
            />
            <chip.Icon x={6} y={3} width={16} height={16} color={chip.color} />
            <text x={26} y={15} style={{ fill: chip.color, fontSize: CHART_FONT.small, fontWeight: 600 }}>
              {chip.text}
            </text>
          </g>

          {capLines.map((l, i) => (
            <text
              key={i}
              x={8}
              y={capTop + 14 + i * 16}
              style={{ fill: "var(--fr-text)", fontSize: CHART_FONT.small }}
            >
              {l}
            </text>
          ))}

          {/* axes */}
          <text x={8} y={M.top - 10} style={muted}>
            Chance Aqua saw it
          </text>
          {yTicks.map((v) => (
            <g key={v}>
              <line
                x1={M.left}
                x2={W - M.right}
                y1={y(v)}
                y2={y(v)}
                style={{ stroke: "var(--fr-gridline)", strokeWidth: 1 }}
              />
              <text x={M.left - 6} y={y(v) + 4} textAnchor="end" style={muted}>
                {Math.round(v * 100)}%
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={plotB + 16} textAnchor="middle" style={muted}>
              {formatNumber(t)}
            </text>
          ))}
          <line
            x1={M.left}
            x2={W - M.right}
            y1={plotB}
            y2={plotB}
            style={{ stroke: "var(--fr-axis)", strokeWidth: 1 }}
          />

          <g clipPath={`url(#${clipId})`}>
            {bandPath && (
              <path
                d={bandPath}
                style={{
                  fill: chip.color,
                  fillOpacity: 0.2,
                }}
              />
            )}
            {linePath && (
              <path
                d={linePath}
                style={{
                  fill: "none",
                  stroke: chip.color,
                  strokeWidth: 2.5,
                  strokeDasharray: status === "exploratory" ? "6 4" : undefined,
                }}
              />
            )}
            {binned.map((b) => (
              <circle
                key={b.frp_mw}
                cx={x(b.frp_mw)}
                cy={y(b.p_obs)}
                r={binRadius(b.n, maxN)}
                style={{
                  fill: "var(--fr-text)",
                  fillOpacity: 0.35,
                  stroke: "var(--fr-text)",
                  strokeWidth: 1,
                }}
              >
                <title>
                  {`${formatNumber(b.frp_mw)} MW: Aqua saw ${pct(b.p_obs)} of ${isNum(b.n) ? formatNumber(b.n) : "?"} fire cell-days`}
                </title>
              </circle>
            ))}
          </g>

          {/* the ceiling c */}
          {cPct !== null && (
            <g>
              <line
                x1={M.left}
                x2={W - M.right}
                y1={y(c)}
                y2={y(c)}
                style={{
                  stroke: "var(--fr-text)",
                  strokeWidth: 1.5,
                  strokeDasharray: "1 3",
                  strokeLinecap: "round",
                }}
              />
              <text
                x={W - M.right}
                y={y(c) - 6}
                textAnchor="end"
                style={{
                  fill: "var(--fr-text)",
                  fontSize: CHART_FONT.small,
                  fontWeight: 600,
                  paintOrder: "stroke",
                  stroke: "var(--fr-bg)",
                  strokeWidth: 3,
                }}
              >
                {ceilLabel}
              </text>
            </g>
          )}

          {curve.length === 0 && binned.length === 0 && (
            <text x={(M.left + W - M.right) / 2} y={M.top + plotH / 2} textAnchor="middle" style={muted}>
              No curve data
            </text>
          )}

          {/* axis title and key for the dots */}
          {footLines.map((l, i) => (
            <text key={i} x={8} y={plotB + 34 + i * 14} style={muted}>
              {l}
            </text>
          ))}
        </g>
      </svg>

      <div className="fr-sr-only">
        <table>
          <caption>Fitted chance that Aqua saw a fire, by fire strength, with its range.</caption>
          <thead>
            <tr>
              <th scope="col">Fire strength (MW)</th>
              <th scope="col">Chance (fitted)</th>
              <th scope="col">Range</th>
            </tr>
          </thead>
          <tbody>
            {curve.map((p) => (
              <tr key={p.frp_mw}>
                <th scope="row">{formatNumber(p.frp_mw)}</th>
                <td>{pct(p.p)}</td>
                <td>{isNum(p.lo) && isNum(p.hi) ? `${pct(p.lo)} to ${pct(p.hi)}` : "no data"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table>
          <caption>Observed share Aqua saw, per fire strength bin.</caption>
          <thead>
            <tr>
              <th scope="col">Fire strength (MW)</th>
              <th scope="col">Share seen</th>
              <th scope="col">Fire cell-days</th>
            </tr>
          </thead>
          <tbody>
            {binned.map((b) => (
              <tr key={b.frp_mw}>
                <th scope="row">{formatNumber(b.frp_mw)}</th>
                <td>{pct(b.p_obs)}</td>
                <td>{isNum(b.n) ? formatNumber(b.n) : "no data"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export const EyesightCurve = forwardRef(EyesightCurveImpl);
