// PercentileStrip (spec §9.6, prompt B3): "this week" against the same 7 days in past years (SD-12).
// A horizontal value strip: one tick per past year (nowcast.history), bands where a value would be
// below normal / normal / above normal / extreme (SD-11 via percentileRank), and a marker for this
// week. Status low_activity or unavailable → the calm empty state: the sentence only.
// Always shows the window end and that the input is near-real-time (SD-12).

import { scaleLinear } from "d3";
import { ArrowDown, ArrowUp, CircleSlash, Equal, Minus, TriangleAlert } from "lucide-react";
import { forwardRef, useMemo } from "react";
import { mergeRefs, useElementWidth } from "./hooks";
import { stripBands, stripMax, wrapText } from "./smallLayout";
import {
  CHART_FONT,
  STATUS_STYLE,
  UNRANKED_LABEL,
  formatDate,
  formatNumber,
  formatPercentile,
  formatRange,
} from "./theme";

const ICONS = { CircleSlash, Minus, ArrowDown, Equal, ArrowUp, TriangleAlert };
const BAND_LABEL = {
  below_normal: "below normal",
  normal: "normal",
  above_normal: "above normal",
  extreme: "extreme",
};
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function footerText(n) {
  const end = n?.window?.end ? `7 days to ${formatDate(n.window.end)}` : "Last 7 days";
  return `${end} · near-real-time input`;
}

function sentenceOf(n) {
  const s = n?.sentence?.trim();
  if (s && s !== "…" && s !== "...") return s;
  return n?.status === "low_activity" ? UNRANKED_LABEL : "No data for this week.";
}

/** @type {import("react").ForwardRefRenderFunction<SVGSVGElement, import("./types").PercentileStripProps>} */
function PercentileStripImpl({ nowcast }, ref) {
  const [measureRef, measured] = useElementWidth(640);
  const rootRef = useMemo(() => mergeRefs(ref, measureRef), [ref, measureRef]);
  const W = Math.max(260, measured);
  const M = { left: 12, right: 12 };
  const status = nowcast?.status ?? "unavailable";
  const st = STATUS_STYLE[status] ?? STATUS_STYLE.unavailable;
  const Icon = ICONS[st.icon] ?? Minus;
  const muted = { fill: "var(--fr-muted)", fontSize: CHART_FONT.min };

  // ---- calm empty state ----
  if (status === "low_activity" || status === "unavailable" || !isNum(nowcast?.value)) {
    const lines = wrapText(sentenceOf(nowcast), W - M.left - M.right - 24, CHART_FONT.body);
    const H = 16 + lines.length * 20 + 24;
    return (
      <svg
        ref={rootRef}
        className="fr-viz"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        tabIndex={0}
        aria-label={`${sentenceOf(nowcast)} ${footerText(nowcast)}.`}
        style={{ display: "block", maxWidth: "100%" }}
      >
        <Icon x={M.left} y={6} width={16} height={16} color="var(--fr-muted)" aria-hidden="true" />
        {lines.map((l, i) => (
          <text
            key={i}
            x={M.left + 24}
            y={19 + i * 20}
            style={{ fill: "var(--fr-text)", fontSize: CHART_FONT.body }}
          >
            {l}
          </text>
        ))}
        <text x={M.left + 24} y={H - 8} style={muted}>
          {footerText(nowcast)}
        </text>
      </svg>
    );
  }

  // ---- strip ----
  const history = (nowcast.history ?? []).filter((h) => isNum(h.value));
  const max = stripMax(
    history.map((h) => h.value),
    nowcast.value,
    nowcast.hi,
  );
  const x = scaleLinear()
    .domain([0, max])
    .range([M.left, W - M.right]);
  const bands = stripBands(
    history.map((h) => h.value),
    max,
  );
  const [b0, b1] = nowcast.baseline_years ?? [];
  const head = `${st.label} · ${formatPercentile(nowcast.percentile)}${b0 ? ` of ${b0}–${b1}` : ""}`;
  const range = formatRange(nowcast.lo, nowcast.hi);
  const valueLines = wrapText(
    `This week: ${formatNumber(nowcast.value)} ${nowcast.unit}${range ? ` (range ${range})` : ""}`,
    W - M.left - M.right,
    CHART_FONT.small,
  );
  // Header and footnotes wrap too (C1: they ran past the right edge in narrow cards). Bold text is wider.
  const headLines = wrapText(head, W - M.left - M.right - 22, CHART_FONT.body * 1.12);
  const footLines = [
    ...wrapText(`${nowcast.unit} · ticks: past years`, W - M.left - M.right, CHART_FONT.min),
    ...wrapText(footerText(nowcast), W - M.left - M.right, CHART_FONT.min),
  ];
  const valueY0 = 16 + headLines.length * 18 + 2;
  const top = valueY0 + valueLines.length * 16 + 4; // header, value lines, band labels
  const stripH = 26;
  const axisY = top + stripH;
  const H = axisY + 18 + footLines.length * 14 + 2;
  const vx = x(nowcast.value);

  const aria =
    `${nowcast.sentence && nowcast.sentence !== "…" ? `${nowcast.sentence} ` : ""}` +
    `${head}. ${valueLines.join(" ")}. ${history.length} past years shown as ticks. ${footerText(nowcast)}.`;

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
        <g aria-hidden="true">
          {/* header: status (icon + text) and value */}
          <Icon x={M.left} y={3} width={16} height={16} color={st.color} strokeWidth={2.5} />
          {headLines.map((l, i) => (
            <text
              key={i}
              x={M.left + 22}
              y={16 + i * 18}
              style={{ fill: st.color, fontSize: CHART_FONT.body, fontWeight: 700 }}
            >
              {l}
            </text>
          ))}
          {valueLines.map((l, i) => (
            <text
              key={i}
              x={M.left}
              y={valueY0 + i * 16}
              style={{ fill: "var(--fr-text)", fontSize: CHART_FONT.small }}
            >
              {l}
            </text>
          ))}

          {/* bands */}
          {bands.map((b) => {
            const bx = x(b.from);
            const bw = x(b.to) - bx;
            const label = BAND_LABEL[b.status];
            const fits = bw >= label.length * CHART_FONT.min * 0.58 + 6;
            return (
              <g key={b.from}>
                <rect
                  x={bx}
                  y={top}
                  width={Math.max(0, bw)}
                  height={stripH}
                  style={{
                    fill: STATUS_STYLE[b.status].color,
                    fillOpacity: 0.34,
                    stroke: "var(--fr-bg)",
                    strokeWidth: 1,
                  }}
                />
                {fits && (
                  <text x={bx + bw / 2} y={top - 5} textAnchor="middle" style={muted}>
                    {label}
                  </text>
                )}
              </g>
            );
          })}

          {/* one tick per past year */}
          {history.map((h) => (
            <line
              key={h.year}
              x1={x(h.value)}
              x2={x(h.value)}
              y1={top + 5}
              y2={top + stripH - 5}
              style={{
                stroke: "var(--fr-text)",
                strokeOpacity: 0.7,
                strokeWidth: 1,
                strokeDasharray: h.kind === "estimated" ? "2 2" : undefined,
              }}
            />
          ))}

          {/* this week */}
          <line
            x1={vx}
            x2={vx}
            y1={top - 2}
            y2={top + stripH + 2}
            style={{ stroke: st.color, strokeWidth: 3 }}
          />
          <path
            d={`M${vx - 7},${top - 10} L${vx + 7},${top - 10} L${vx},${top - 1} Z`}
            style={{
              fill: st.color,
              stroke: st.boldOutline ? "var(--fr-status-extreme-outline)" : "var(--fr-bg)",
              strokeWidth: st.boldOutline ? 2 : 1,
            }}
          />

          {/* axis */}
          {x.ticks(W < 480 ? 3 : 6).map((v) => (
            <text key={v} x={x(v)} y={axisY + 14} textAnchor="middle" style={muted}>
              {formatNumber(v)}
            </text>
          ))}
          {footLines.map((l, i) => (
            <text key={i} x={M.left} y={axisY + 29 + i * 14} style={muted}>
              {l}
            </text>
          ))}
        </g>
      </svg>

      <div className="fr-sr-only">
        <table>
          <caption>
            This week and the same 7 days in past years, in {nowcast.unit}. {footerText(nowcast)}.
          </caption>
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">This week</th>
              <td>{formatNumber(nowcast.value)}</td>
            </tr>
            {(nowcast.history ?? []).map((h) => (
              <tr key={h.year}>
                <th scope="row">{h.year}</th>
                <td>{formatNumber(h.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export const PercentileStrip = forwardRef(PercentileStripImpl);
