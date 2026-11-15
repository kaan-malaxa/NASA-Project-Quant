// SeasonShiftChart (spec §9.7, prompt D1, SD-13): for each season window, a panel with years on x and
// day of year on y (labelled with dates, earlier at the top). Each year: a vertical bar from start_doy
// (10 % of the window's burning) to end_doy (90 %) with a dot at centroid_doy. Theil–Sen trend lines for
// start and end use the pipeline's slope (shift_days_per_decade): solid when its range excludes zero,
// dashed and labelled "no clear shift" otherwise. Caption = window.sentence. No by_year rows → null.

import { scaleLinear } from "d3";
import { forwardRef, useMemo } from "react";
import { VizDefs } from "./defs";
import { mergeRefs, useElementWidth } from "./hooks";
import { doyLabel, doyTicks, excludesZero, seasonRows, theilSenLine } from "./methodsLayout";
import { wrapText } from "./smallLayout";
import { CHART_FONT, KIND_STYLE } from "./theme";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const TRENDS = [
  { key: "start", label: "start", field: "start", dy: -6 },
  { key: "end", label: "end", field: "end", dy: 14 },
];

/** @type {import("react").ForwardRefRenderFunction<SVGSVGElement, import("./types").SeasonShiftChartProps>} */
function SeasonShiftChartImpl({ season }, ref) {
  const [measureRef, measured] = useElementWidth(640);
  const rootRef = useMemo(() => mergeRefs(ref, measureRef), [ref, measureRef]);

  const windows = useMemo(
    () => (season?.windows ?? []).map((w) => ({ w, rows: seasonRows(w) })).filter((p) => p.rows.length > 0),
    [season],
  );
  if (windows.length === 0) return null;

  const W = Math.max(280, measured);
  const side = W >= 720 && windows.length === 2;
  const GAP = 24;
  const panelW = side ? (W - GAP) / 2 : W;
  const narrow = panelW < 420;
  const muted = { fill: "var(--fr-muted)", fontSize: CHART_FONT.min };

  // ---- lay out each panel ----
  const panels = windows.map(({ w, rows }) => {
    const title = `${w.label ?? "Season"}${isNum(w.share) ? ` · ${Math.round(w.share * 100)}% of a typical year's burning` : ""}`;
    const sentence = w.sentence && w.sentence !== "…" ? w.sentence : "";
    const titleLines = wrapText(title, panelW - 16, CHART_FONT.body * 1.1);
    const capLines = sentence ? wrapText(sentence, panelW - 16, CHART_FONT.small) : [];
    const head = titleLines.length * 18 + capLines.length * 16 + 10;
    const M = { top: head + 14, right: 12, bottom: 26, left: 50 };
    const plotH = narrow ? 200 : 240;
    const H = M.top + plotH + M.bottom;

    const present = rows.filter((r) => !r.missing);
    const years = rows.map((r) => r.year);
    const y0 = Math.min(...years);
    const y1 = Math.max(...years);
    const x = scaleLinear()
      .domain([y0 - 0.5, y1 + 0.5])
      .range([M.left, panelW - M.right]);
    const yearW = x(y0 + 1) - x(y0);

    const shift = w.shift_days_per_decade ?? {};
    const trends = TRENDS.map((t) => {
      const r = shift[t.key];
      const ln = theilSenLine(
        present.map((p) => ({ x: p.year, y: p[t.field] })),
        isNum(r?.value) ? r.value / 10 : null,
      );
      return ln ? { ...t, line: ln, clear: excludesZero(r) } : null;
    }).filter(Boolean);

    const dv = [];
    for (const p of present) dv.push(p.start, p.end);
    for (const t of trends) dv.push(t.line.y0, t.line.y1);
    const lo = dv.length ? Math.min(...dv) - 4 : 1;
    const hi = dv.length ? Math.max(...dv) + 4 : 365;
    // Earlier dates at the top: a season that starts earlier moves up.
    const y = scaleLinear()
      .domain([lo, hi])
      .range([M.top, M.top + plotH]);
    const ticks = doyTicks(lo, hi, narrow ? 4 : 6);
    const yearStep = [1, 2, 5, 10].find((s) => yearW * s >= 34) ?? 10;
    const xTicks = [];
    for (let t = Math.ceil(y0 / yearStep) * yearStep; t <= y1; t += yearStep) xTicks.push(t);
    if (xTicks.length === 0) xTicks.push(y0);

    return {
      w,
      rows,
      present,
      title,
      titleLines,
      capLines,
      sentence,
      M,
      plotH,
      H,
      x,
      y,
      yearW,
      trends,
      ticks,
      xTicks,
    };
  });

  const H = side
    ? Math.max(...panels.map((p) => p.H))
    : panels.reduce((s, p) => s + p.H, 0) + GAP * (panels.length - 1);
  const offsets = panels.map((_, i) =>
    side
      ? { dx: i * (panelW + GAP), dy: 0 }
      : { dx: 0, dy: panels.slice(0, i).reduce((s, p) => s + p.H + GAP, 0) },
  );

  const aria =
    "Season timing by year. Each bar is one year's season, from the day 10% of its burning was reached " +
    "to the day 90% was reached, with a dot at its centre; earlier dates are higher. " +
    panels.map((p) => `${p.title}. ${p.sentence}`).join(" ");

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
        <VizDefs />
        {panels.map((p, pi) => {
          const { M, x, y, plotH, yearW } = p;
          const plotR = panelW - M.right;
          const barW = Math.max(1.5, Math.min(6, yearW * 0.45));
          return (
            <g key={p.w.id ?? pi} transform={`translate(${offsets[pi].dx},${offsets[pi].dy})`}>
              <g aria-hidden="true">
                {p.titleLines.map((l, i) => (
                  <text
                    key={`t${i}`}
                    x={8}
                    y={16 + i * 18}
                    style={{ fill: "var(--fr-text)", fontSize: CHART_FONT.body, fontWeight: 650 }}
                  >
                    {l}
                  </text>
                ))}
                {p.capLines.map((l, i) => (
                  <text
                    key={`c${i}`}
                    x={8}
                    y={p.titleLines.length * 18 + 14 + i * 16}
                    style={{ fill: "var(--fr-muted)", fontSize: CHART_FONT.small }}
                  >
                    {l}
                  </text>
                ))}

                {/* date gridlines */}
                {p.ticks.map((d) => (
                  <g key={d}>
                    <line
                      x1={M.left}
                      x2={plotR}
                      y1={y(d)}
                      y2={y(d)}
                      style={{ stroke: "var(--fr-gridline)", strokeWidth: 1 }}
                    />
                    <text x={M.left - 6} y={y(d) + 4} textAnchor="end" style={muted}>
                      {doyLabel(d)}
                    </text>
                  </g>
                ))}
                {p.xTicks.map((t) => (
                  <text key={t} x={x(t)} y={M.top + plotH + 18} textAnchor="middle" style={muted}>
                    {t}
                  </text>
                ))}
                <line
                  x1={M.left}
                  x2={plotR}
                  y1={M.top + plotH}
                  y2={M.top + plotH}
                  style={{ stroke: "var(--fr-axis)", strokeWidth: 1 }}
                />

                {/* years without timing: hatched, never a zero-length season */}
                {p.rows
                  .filter((r) => r.missing)
                  .map((r) => (
                    <rect
                      key={`m${r.year}`}
                      x={x(r.year - 0.5) + 0.5}
                      y={M.top}
                      width={Math.max(1, yearW - 1)}
                      height={plotH}
                      style={{ fill: KIND_STYLE.missing.fill, opacity: 0.7 }}
                    />
                  ))}

                {/* trend lines: solid when the shift is clear, dashed when its range includes zero */}
                {p.trends.map((t) => {
                  const words = t.clear ? t.label : `${t.label}: no clear shift`;
                  return (
                    <g key={t.key}>
                      <line
                        x1={x(t.line.x0)}
                        x2={x(t.line.x1)}
                        y1={y(t.line.y0)}
                        y2={y(t.line.y1)}
                        style={{
                          stroke: "var(--fr-text)",
                          strokeWidth: t.clear ? 2 : 1.5,
                          strokeDasharray: t.clear ? undefined : "5 4",
                          strokeOpacity: 0.9,
                        }}
                      />
                      <text
                        x={x(t.line.x1)}
                        y={y(t.line.y1) + t.dy}
                        textAnchor="end"
                        style={{
                          fill: "var(--fr-text)",
                          fontSize: CHART_FONT.min,
                          fontWeight: 600,
                          paintOrder: "stroke",
                          stroke: "var(--fr-bg)",
                          strokeWidth: 3,
                        }}
                      >
                        {words}
                      </text>
                    </g>
                  );
                })}
              </g>

              {/* one bar per year, dot at the centre */}
              {p.present.map((r) => {
                const est = r.kind === "estimated";
                return (
                  <g key={r.year} style={{ opacity: est ? KIND_STYLE.estimated.fillOpacity : 1 }}>
                    <title>
                      {`${r.year}: ${doyLabel(r.start)} to ${doyLabel(r.end)}` +
                        (isNum(r.centroid) ? `, centre ${doyLabel(r.centroid)}` : "") +
                        (est ? " (estimate)" : "")}
                    </title>
                    <line
                      x1={x(r.year)}
                      x2={x(r.year)}
                      y1={y(r.start)}
                      y2={y(r.end)}
                      style={{
                        stroke: "var(--fr-accent)",
                        strokeWidth: barW,
                        strokeLinecap: "round",
                        strokeOpacity: 0.55,
                        strokeDasharray: est ? "3 2" : undefined,
                      }}
                    />
                    {isNum(r.centroid) && (
                      <circle
                        cx={x(r.year)}
                        cy={y(r.centroid)}
                        r={Math.max(2, Math.min(3.5, barW * 0.7))}
                        style={{ fill: "var(--fr-text)", stroke: "var(--fr-bg)", strokeWidth: 1 }}
                      />
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      <div className="fr-sr-only">
        {panels.map((p, pi) => (
          <table key={p.w.id ?? pi}>
            <caption>
              {p.title}. {p.sentence}
            </caption>
            <thead>
              <tr>
                <th scope="col">Year</th>
                <th scope="col">Start (10%)</th>
                <th scope="col">Centre</th>
                <th scope="col">End (90%)</th>
                <th scope="col">Kind</th>
              </tr>
            </thead>
            <tbody>
              {p.rows.map((r) => (
                <tr key={r.year}>
                  <th scope="row">{r.year}</th>
                  <td>{r.missing ? "no data" : doyLabel(r.start)}</td>
                  <td>{r.missing || !isNum(r.centroid) ? "no data" : doyLabel(r.centroid)}</td>
                  <td>{r.missing ? "no data" : doyLabel(r.end)}</td>
                  <td>{KIND_STYLE[r.kind]?.label ?? r.kind}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </>
  );
}

export const SeasonShiftChart = forwardRef(SeasonShiftChartImpl);
