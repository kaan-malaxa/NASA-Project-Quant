// BrokenRuler (spec §9.3, prompt A2): the story in one picture. It must read without interaction.
// Two unit-free indices on one axis (SD-09): the naive splice ("Raw record, as downloaded") and the
// harmonized record, each divided by its own base-years mean. A marker at the sensor switch, the
// gap after it shaded and annotated with the jump multiple.

import { area, line, scaleLinear } from "d3";
import { forwardRef, useId, useMemo } from "react";
import { VizDefs } from "./defs";
import { mergeRefs, phase, usePrefersReducedMotion, useElementWidth, useTimeline } from "./hooks";
import {
  harmonizedSegments,
  indexDomainMax,
  isolatedIndexes,
  jumpLabel,
  lastDefined,
  missingRuns,
  rulerAriaLabel,
  separateLabels,
  sortRows,
  switchYear,
  yearTicks,
} from "./rulerLayout";
import { CHART_FONT, KIND_STYLE, SENSOR_STYLE, formatNumber } from "./theme";

const NAIVE_LABEL = "Raw record, as downloaded";
const HARMONIZED_LABEL = "Harmonized";
const MARKER_LABEL = "New satellite sensor";

// Animation timeline (ms): naive line, pause, harmonized line, then gap + annotation fade in.
const T_NAIVE = [0, 1100];
const T_HARM = [1700, 1100];
const T_EXTRA = [2800, 400];
const T_TOTAL = 3200;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

export const BrokenRuler = forwardRef(function BrokenRuler({ ruler, animate }, ref) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [measureRef, measured] = useElementWidth(720);
  const rootRef = useMemo(() => mergeRefs(ref, measureRef), [ref, measureRef]);
  const reduced = usePrefersReducedMotion();
  const rows = useMemo(() => sortRows(ruler?.rows), [ruler]);
  const t = useTimeline(Boolean(animate) && !reduced && rows.length > 1, T_TOTAL, ruler);

  // ---- geometry: viewBox = measured CSS width, so text stays at real pixel sizes ----
  const W = Math.max(260, measured);
  const narrow = W < 640;
  const H = Math.round(Math.min(420, Math.max(240, W * 0.5)));
  const M = { top: 40, right: narrow ? 12 : 176, bottom: 30, left: 40 };
  const plotR = W - M.right;
  const plotB = H - M.bottom;

  const first = rows[0]?.year;
  const last = rows[rows.length - 1]?.year;
  const xDomain = first === undefined ? [0, 1] : first === last ? [first - 1, first + 1] : [first, last];
  const x = scaleLinear().domain(xDomain).range([M.left, plotR]);
  const y = scaleLinear()
    .domain([0, indexDomainMax(rows)])
    .nice()
    .range([plotB, M.top]);
  const yTicks = y.ticks(narrow ? 4 : 5);
  const xTicks = first === undefined ? [] : yearTicks(first, last);

  const naive = rows.map((r) => ({ year: r.year, v: r.naive_index }));
  const harm = rows.map((r) => ({ year: r.year, v: r.harmonized_index }));
  const pathOf = line()
    .defined((d) => isNum(d.v))
    .x((d) => x(d.year))
    .y((d) => y(d.v));

  const sw = switchYear(rows);
  const gapRows = sw
    ? rows.filter((r) => r.year >= sw.year && isNum(r.naive_index) && isNum(r.harmonized_index))
    : [];
  const gapPath =
    gapRows.length > 1
      ? area()
          .x((r) => x(r.year))
          .y0((r) => y(r.harmonized_index))
          .y1((r) => y(r.naive_index))(gapRows)
      : null;
  // On narrow screens the end labels sit inside the plot over the last NARROW_LABEL_W px.
  const NARROW_LABEL_W = 160;
  const labelZoneX = plotR - NARROW_LABEL_W;
  const jump = jumpLabel(ruler?.jump_multiple);
  const jumpAt = (() => {
    if (!jump || gapRows.length === 0) return null;
    const outsideLabels = narrow ? gapRows.filter((r) => x(r.year) < labelZoneX - 20) : gapRows;
    const candidates = outsideLabels.length > 0 ? outsideLabels : gapRows;
    let best = candidates[0];
    for (const r of candidates) {
      if (Math.abs(r.naive_index - r.harmonized_index) > Math.abs(best.naive_index - best.harmonized_index))
        best = r;
    }
    const cx = Math.min(plotR - 24, Math.max(M.left + 24, x(best.year)));
    return { x: cx, y: (y(best.naive_index) + y(best.harmonized_index)) / 2 };
  })();

  // ---- direct labels at the line ends ----
  const nEnd = lastDefined(naive, (p) => p.v);
  const hEnd = lastDefined(harm, (p) => p.v);
  const ends = [
    nEnd && {
      key: "naive",
      label: NAIVE_LABEL,
      x: x(nEnd.year),
      y: y(nEnd.v),
      color: "var(--fr-naive-line)",
    },
    hEnd && {
      key: "harm",
      label: HARMONIZED_LABEL,
      x: x(hEnd.year),
      y: y(hEnd.v),
      color: "var(--fr-accent)",
    },
  ].filter(Boolean);
  let labelYs;
  if (narrow) {
    // Inside the plot, right-aligned at the line end. The higher line's label goes above that line's
    // highest point across the label's width; the lower line's label below its lowest point.
    const topKey = ends.length === 2 ? (ends[0].y <= ends[1].y ? ends[0].key : ends[1].key) : ends[0]?.key;
    const extreme = (pts, want) => {
      const ys = pts.filter((p) => isNum(p.v) && x(p.year) >= labelZoneX - 8).map((p) => y(p.v));
      if (ys.length === 0) return null;
      return want === "top" ? Math.min(...ys) : Math.max(...ys);
    };
    labelYs = separateLabels(
      ends.map((e) => {
        const pts = e.key === "naive" ? naive : harm;
        if (e.key === topKey) return (extreme(pts, "top") ?? e.y) - 8;
        return (extreme(pts, "bottom") ?? e.y) + 16;
      }),
      15,
      M.top + 12,
      plotB - 4,
    );
  } else {
    labelYs = separateLabels(
      ends.map((e) => e.y + 4),
      16,
      M.top + 4,
      plotB,
    );
  }

  // ---- animation: clip widths grow from the left edge ----
  const pNaive = phase(t, ...T_NAIVE);
  const pHarm = phase(t, ...T_HARM);
  const pExtra = phase(t, ...T_EXTRA);
  const clipW = (p) => (p >= 1 ? W : M.left + (plotR - M.left) * p);

  const hasAny = naive.some((p) => isNum(p.v)) || harm.some((p) => isNum(p.v));
  const aria = rulerAriaLabel(ruler, rows);
  const base = ruler?.index_base_years;

  const dots = (pts, color, r) =>
    isolatedIndexes(pts.map((p) => p.v)).map((i) => (
      <circle key={pts[i].year} cx={x(pts[i].year)} cy={y(pts[i].v)} r={r} style={{ fill: color }} />
    ));

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
        style={{ display: "block", maxWidth: "100%", overflow: "visible" }}
      >
        <VizDefs />
        <defs>
          <clipPath id={`${uid}-naive`}>
            <rect x={0} y={0} width={clipW(pNaive)} height={H} />
          </clipPath>
          <clipPath id={`${uid}-harm`}>
            <rect x={0} y={0} width={clipW(pHarm)} height={H} />
          </clipPath>
        </defs>

        {/* axis caption */}
        <text x={M.left - 32} y={16} style={{ fill: "var(--fr-muted)", fontSize: CHART_FONT.small }}>
          {base ? `Index (1 = ${base[0]}–${base[1]} average)` : "Index"}
        </text>

        {/* gridlines and y ticks */}
        <g aria-hidden="true">
          {yTicks.map((v) => (
            <g key={v}>
              <line
                x1={M.left}
                x2={plotR}
                y1={y(v)}
                y2={y(v)}
                style={{
                  stroke: v === 1 ? "var(--fr-axis)" : "var(--fr-gridline)",
                  strokeWidth: 1,
                  strokeDasharray: v === 1 ? "4 3" : undefined,
                }}
              />
              <text
                x={M.left - 6}
                y={y(v) + 4}
                textAnchor="end"
                style={{ fill: "var(--fr-muted)", fontSize: CHART_FONT.small }}
              >
                {formatNumber(v)}
              </text>
            </g>
          ))}
          {/* x ticks: every 5 years */}
          {xTicks.map((yr) => {
            // A tick at the plot edge is anchored inward so it is not cut off (C1: "2025" at 360 px).
            const half = (String(yr).length * CHART_FONT.small * 0.58) / 2;
            const anchor = x(yr) + half > W - 2 ? "end" : x(yr) - half < 2 ? "start" : "middle";
            return (
              <text
                key={yr}
                x={anchor === "end" ? W - 2 : x(yr)}
                y={plotB + 20}
                textAnchor={anchor}
                style={{ fill: "var(--fr-muted)", fontSize: CHART_FONT.small }}
              >
                {yr}
              </text>
            );
          })}
          <line
            x1={M.left}
            x2={plotR}
            y1={plotB}
            y2={plotB}
            style={{ stroke: "var(--fr-axis)", strokeWidth: 1 }}
          />
        </g>

        {/* years with no data: hatched, never drawn as zero */}
        <g aria-hidden="true">
          {missingRuns(rows).map((r) => {
            const x0 = Math.max(M.left, x(r.from - 0.5));
            const x1 = Math.min(plotR, x(r.to + 0.5));
            return (
              <g key={r.from}>
                <rect
                  x={x0}
                  y={M.top}
                  width={Math.max(1, x1 - x0)}
                  height={plotB - M.top}
                  style={{ fill: KIND_STYLE.missing.fill, opacity: 0.7 }}
                />
                {hasAny && x1 - x0 > 40 && (
                  <text
                    x={(x0 + x1) / 2}
                    y={plotB - 8}
                    textAnchor="middle"
                    style={{ fill: "var(--fr-muted)", fontSize: CHART_FONT.min }}
                  >
                    no data
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* sensor switch marker */}
        {sw && (
          <g aria-hidden="true">
            <line
              x1={x(sw.year)}
              x2={x(sw.year)}
              y1={M.top - 6}
              y2={plotB}
              style={{ stroke: "var(--fr-muted)", strokeWidth: 1, strokeDasharray: "4 3" }}
            />
            {(() => {
              const right = x(sw.year) + 6 + 140 <= plotR + (narrow ? 0 : M.right - 8);
              const tx = right ? x(sw.year) + 6 : x(sw.year) - 6;
              const anchor = right ? "start" : "end";
              const sensor = sw.source === "modis" ? "MODIS" : SENSOR_STYLE[sw.source]?.label;
              return (
                <>
                  <text
                    x={tx}
                    y={M.top - 10}
                    textAnchor={anchor}
                    style={{ fill: "var(--fr-text)", fontSize: CHART_FONT.small, fontWeight: 600 }}
                  >
                    {MARKER_LABEL}
                  </text>
                  {!narrow && sensor && (
                    <text
                      x={tx}
                      y={M.top + 6}
                      textAnchor={anchor}
                      style={{ fill: "var(--fr-muted)", fontSize: CHART_FONT.min }}
                    >
                      {sensor}, from {sw.year}
                    </text>
                  )}
                </>
              );
            })()}
          </g>
        )}

        {/* the gap after the switch + jump multiple */}
        <g aria-hidden="true" style={{ opacity: pExtra }}>
          {gapPath && (
            <path d={gapPath} style={{ fill: "var(--fr-warning)", fillOpacity: 0.14, stroke: "none" }} />
          )}
          {jump && jumpAt && (
            <text
              x={jumpAt.x}
              y={jumpAt.y + 6}
              textAnchor="middle"
              style={{
                fill: "var(--fr-text)",
                fontSize: CHART_FONT.title + 2,
                fontWeight: 700,
                paintOrder: "stroke",
                stroke: "var(--fr-bg)",
                strokeWidth: 4,
                strokeLinejoin: "round",
              }}
            >
              <title>{jump.title}</title>
              {jump.text}
            </text>
          )}
        </g>

        {/* naive: thin, neutral */}
        <g clipPath={`url(#${uid}-naive)`} aria-hidden="true">
          <path
            d={pathOf(naive) ?? ""}
            style={{
              fill: "none",
              stroke: "var(--fr-naive-line)",
              strokeWidth: 1.5,
              strokeLinejoin: "round",
            }}
          />
          {dots(naive, "var(--fr-naive-line)", 2.5)}
        </g>

        {/* harmonized: thick, accent; estimated years dashed and lighter */}
        <g clipPath={`url(#${uid}-harm)`} aria-hidden="true">
          {harmonizedSegments(rows).map((seg, i) => (
            <path
              key={i}
              d={pathOf(seg.rows.map((r) => ({ year: r.year, v: r.harmonized_index }))) ?? ""}
              style={{
                fill: "none",
                stroke: "var(--fr-accent)",
                strokeWidth: 3,
                strokeLinejoin: "round",
                strokeLinecap: "round",
                strokeDasharray: seg.estimated ? "6 4" : undefined,
                strokeOpacity: seg.estimated ? KIND_STYLE.estimated.fillOpacity : 1,
              }}
            />
          ))}
          {dots(harm, "var(--fr-accent)", 3.5)}
        </g>

        {/* direct labels */}
        <g aria-hidden="true">
          {ends.map((e, i) => {
            const show = e.key === "naive" ? pNaive >= 1 : pHarm >= 1;
            return (
              <text
                key={e.key}
                // Right-aligned labels never start left of the chart (C1: single-year state at 360 px).
                x={
                  narrow
                    ? Math.max(Math.min(e.x, plotR), 4 + e.label.length * (CHART_FONT.small + 1) * 0.62)
                    : e.x + 8
                }
                y={labelYs[i]}
                textAnchor={narrow ? "end" : "start"}
                style={{
                  fill: e.color,
                  fontSize: CHART_FONT.small + 1,
                  fontWeight: e.key === "harm" ? 700 : 500,
                  opacity: show ? 1 : 0,
                  paintOrder: "stroke",
                  stroke: "var(--fr-bg)",
                  strokeWidth: narrow ? 4 : 0,
                  strokeLinejoin: "round",
                }}
              >
                {e.label}
              </text>
            );
          })}
        </g>

        {!hasAny && (
          <text
            x={(M.left + plotR) / 2}
            y={(M.top + plotB) / 2}
            textAnchor="middle"
            style={{ fill: "var(--fr-muted)", fontSize: CHART_FONT.body }}
          >
            No data for this chart
          </text>
        )}
      </svg>

      <div className="fr-sr-only">
        <table>
          <caption>
            {NAIVE_LABEL} and {HARMONIZED_LABEL.toLowerCase()} record as indices
            {base ? ` (1 = the ${base[0]}–${base[1]} average)` : ""}.{jump ? ` ${jump.title}` : ""}
            {sw ? ` ${MARKER_LABEL} from ${sw.year}.` : ""}
          </caption>
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col">{NAIVE_LABEL} (index)</th>
              <th scope="col">Raw record source</th>
              <th scope="col">{HARMONIZED_LABEL} (index)</th>
              <th scope="col">Kind</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year}>
                <th scope="row">{r.year}</th>
                <td>{formatNumber(r.naive_index)}</td>
                <td>
                  {r.naive_source === "modis"
                    ? "MODIS (Terra + Aqua)"
                    : (SENSOR_STYLE[r.naive_source]?.label ?? r.naive_source)}
                </td>
                <td>{formatNumber(r.harmonized_index)}</td>
                <td>{KIND_STYLE[r.kind]?.label ?? r.kind}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
});
