// TrendBars (spec §9.6, prompt B3): the verdict bars. Two horizontal range bars on one
// percent-per-decade axis with a zero line: "Raw record" (naive) and "Harmonized". Each bar runs from
// lo to hi with a dot at the value. A bar whose range includes zero is neutral and says
// "no clear change"; otherwise an up/down arrow and the signed value. Always the range, never a bare number.

import { scaleLinear } from "d3";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { forwardRef, useMemo } from "react";
import { mergeRefs, useElementWidth } from "./hooks";
import { crossesZero, hasTrend, trendDomain } from "./smallLayout";
import { CHART_FONT, formatSignedPercent } from "./theme";

const ROWS = [
  { key: "naive", label: "Raw record", color: "var(--fr-text)" },
  { key: "harmonized", label: "Harmonized", color: "var(--fr-accent)" },
];
const NEUTRAL = "var(--fr-muted)";
const NO_CLEAR = "no clear change";

/** "+12%" style with a true minus sign; one decimal below 10. */
const pct = (v) => formatSignedPercent(v, Math.abs(v) < 10 ? 1 : 0);

/** Words for one bar, used for its text, the aria-label and the hidden table. */
export function trendWords(t) {
  if (!hasTrend(t)) return { main: "not enough data", range: "" };
  const range = `range ${pct(t.lo)} to ${pct(t.hi)}`;
  if (crossesZero(t)) return { main: NO_CLEAR, range };
  return { main: `${pct(t.pct_per_decade)} per decade`, range };
}

/** @type {import("react").ForwardRefRenderFunction<SVGSVGElement, import("./types").TrendBarsProps>} */
function TrendBarsImpl({ trend }, ref) {
  const [measureRef, measured] = useElementWidth(640);
  const rootRef = useMemo(() => mergeRefs(ref, measureRef), [ref, measureRef]);

  const W = Math.max(280, measured);
  const narrow = W < 520;
  const rows = ROWS.map((r) => ({ ...r, t: trend?.[r.key] }));
  const domain = trendDomain(rows.map((r) => r.t));

  const M = narrow ? { left: 12, right: 12, top: 4 } : { left: 108, right: 216, top: 8 };
  const rowH = narrow ? 64 : 40;
  const x = scaleLinear()
    .domain(domain)
    .range([M.left, W - M.right]);
  const axisY = M.top + rows.length * rowH + 4;
  const H = axisY + 34;
  const ticks = x.ticks(narrow ? 4 : 6);

  const sentence = trend?.sentence && trend.sentence !== "…" ? `${trend.sentence} ` : "";
  const aria =
    `${sentence}Change per decade. ` +
    rows
      .map((r) => {
        const w = trendWords(r.t);
        return `${r.label}: ${w.main}${w.range ? ` (${w.range})` : ""}.`;
      })
      .join(" ");

  return (
    <>
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
        {/* gridlines + zero line (narrow: only through each bar, so they never cross the text) */}
        <g aria-hidden="true">
          {ticks.flatMap((v) =>
            (narrow
              ? rows.map((_, i) => [M.top + i * rowH + 18, M.top + i * rowH + 38])
              : [[M.top, axisY]]
            ).map(([y1, y2]) => (
              <line
                key={`${v}-${y1}`}
                x1={x(v)}
                x2={x(v)}
                y1={y1}
                y2={y2}
                style={{
                  stroke: v === 0 ? "var(--fr-text)" : "var(--fr-gridline)",
                  strokeWidth: v === 0 ? 1.5 : 1,
                }}
              />
            )),
          )}
          {ticks.map((v) => (
            <text
              key={v}
              x={x(v)}
              y={axisY + 14}
              textAnchor={x(v) > W - 22 ? "end" : x(v) < 22 ? "start" : "middle"}
              style={{ fill: "var(--fr-muted)", fontSize: CHART_FONT.min }}
            >
              {v === 0 ? "0" : formatSignedPercent(v, 0)}
            </text>
          ))}
          <text
            x={narrow ? M.left : x(domain[0])}
            y={axisY + 30}
            style={{ fill: "var(--fr-muted)", fontSize: CHART_FONT.min }}
          >
            Change per decade
          </text>
        </g>

        {rows.map((r, i) => {
          const t = r.t;
          const ok = hasTrend(t);
          const neutral = !ok || crossesZero(t);
          const color = neutral ? NEUTRAL : r.color;
          const words = trendWords(t);
          const Icon = neutral ? Minus : t.pct_per_decade > 0 ? ArrowUp : ArrowDown;
          const rowTop = M.top + i * rowH;
          const barY = narrow ? rowTop + 28 : rowTop + rowH / 2;
          const labelY = narrow ? rowTop + 14 : barY + 4;
          const textX = narrow ? W - M.right : W - M.right + 12;
          return (
            <g key={r.key} aria-hidden="true">
              <text
                x={narrow ? M.left : M.left - 12}
                y={labelY}
                textAnchor={narrow ? "start" : "end"}
                style={{ fill: r.color, fontSize: CHART_FONT.body - 1, fontWeight: 650 }}
              >
                {r.label}
              </text>
              {ok && (
                <>
                  <rect
                    x={x(t.lo)}
                    y={barY - 4}
                    width={Math.max(2, x(t.hi) - x(t.lo))}
                    height={8}
                    rx={4}
                    style={{ fill: color, fillOpacity: neutral ? 0.45 : 0.4 }}
                  />
                  <circle
                    cx={x(t.pct_per_decade)}
                    cy={barY}
                    r={5.5}
                    style={{ fill: color, stroke: "var(--fr-bg)", strokeWidth: 2 }}
                  />
                </>
              )}
              {/* value text: icon + words; range below in muted */}
              <g transform={`translate(${textX},${narrow ? labelY : barY})`}>
                {narrow ? (
                  <>
                    <text
                      x={0}
                      y={0}
                      textAnchor="end"
                      style={{ fill: color, fontSize: CHART_FONT.small, fontWeight: 600 }}
                    >
                      {neutral ? "" : t.pct_per_decade > 0 ? "↑ " : "↓ "}
                      {words.main}
                    </text>
                    {words.range && (
                      <text
                        x={0}
                        y={34}
                        textAnchor="end"
                        style={{ fill: "var(--fr-muted)", fontSize: CHART_FONT.min }}
                      >
                        {words.range}
                      </text>
                    )}
                  </>
                ) : (
                  <>
                    <Icon x={0} y={-12} width={14} height={14} color={color} strokeWidth={2.5} aria-hidden="true" />
                    <text x={18} y={-1} style={{ fill: color, fontSize: CHART_FONT.small + 1, fontWeight: 600 }}>
                      {words.main}
                    </text>
                    {words.range && (
                      <text x={18} y={13} style={{ fill: "var(--fr-muted)", fontSize: CHART_FONT.min }}>
                        {words.range}
                      </text>
                    )}
                  </>
                )}
              </g>
            </g>
          );
        })}
      </svg>

      <table className="fr-sr-only">
        <caption>Change per decade, with its range.</caption>
        <thead>
          <tr>
            <th scope="col">Record</th>
            <th scope="col">Change per decade</th>
            <th scope="col">Range</th>
            <th scope="col">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">{r.label}</th>
              <td>{hasTrend(r.t) ? pct(r.t.pct_per_decade) : "no data"}</td>
              <td>{hasTrend(r.t) ? `${pct(r.t.lo)} to ${pct(r.t.hi)}` : "no data"}</td>
              <td>{trendWords(r.t).main}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export const TrendBars = forwardRef(TrendBarsImpl);
