// CalendarHeatmap (spec §9.4, prompt B1): the workhorse and the fallback default view.
// Rows = years (earliest at top), columns = 52 weeks or 12 months. One <rect> per cell (≤ 24 × 52).
// Cell styles come from cellStyle.js (shared with FireYearClock).

import { forwardRef, useId, useMemo, useState } from "react";
import { VizDefs } from "./defs";
import {
  buildHeatGrid,
  criticalColumns,
  lensUnit,
  monthStartWeeks,
  NAIVE_SPLICE_YEAR,
  periodsOf,
} from "./heatmapData";
import { mergeRefs, useElementWidth } from "./hooks";
import { CHART_FONT, SENSOR_STYLE, monthName } from "./theme";

const SPLICE_LABEL = "sensor switch";
const CRITICAL_LABEL = "critical weeks";
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** Rough text width at the chart's small size, for layout decisions only. */
const textW = (s, size = CHART_FONT.min) => s.length * size * 0.58;

function runsOf(cols, n) {
  const runs = [];
  for (let p = 1; p <= n; p++) {
    if (!cols.has(p)) continue;
    const last = runs[runs.length - 1];
    if (last && last[1] === p - 1) last[1] = p;
    else runs.push([p, p]);
  }
  return runs;
}

export const CalendarHeatmap = forwardRef(function CalendarHeatmap(
  { grain, weekly, monthly, climatology, season, lens, mode, range, onSelect },
  ref,
) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [measureRef, measured] = useElementWidth(720);
  const rootRef = useMemo(() => mergeRefs(ref, measureRef), [ref, measureRef]);

  const file = grain === "week" ? weekly : monthly;
  const unit = lensUnit(file?.series_meta, lens, grain);
  const from = range?.from;
  const to = range?.to;
  const grid = useMemo(
    () =>
      buildHeatGrid({
        rows: file?.rows,
        baselineRows: file?.baseline_rows,
        configuration: file?.configuration,
        calibration: file?.calibration,
        grain,
        lens,
        mode,
        climatology,
        range: from && to ? { from, to } : undefined,
        unit,
      }),
    [file, grain, lens, mode, climatology, from, to, unit],
  );
  const { years, cells } = grid;

  // ---- layout: viewBox = measured CSS width ----
  const W = Math.max(280, measured);
  const cols = periodsOf(grain);
  const M = { top: 34, right: 8, bottom: 30, left: 46 };
  const gridW = W - M.left - M.right;
  const cw = gridW / cols;
  const rowH = grain === "week" ? clamp(cw, 8, 16) : clamp(cw * 0.35, 14, 22);
  const gap = cw >= 8 ? 1 : 0.5;
  const gridBottom = M.top + Math.max(years.length, 3) * rowH;
  const yearIndex = useMemo(() => new Map(years.map((y, i) => [y, i])), [years]);
  const colX = (p) => M.left + (p - 1) * cw;
  const rowY = (yi) => M.top + yi * rowH;

  // ---- cells: built once per data/layout change; hover/focus only redraw the overlay ----
  const cellsLayer = useMemo(() => {
    const byYear = new Map();
    for (const c of cells) {
      const list = byYear.get(c.year);
      if (list) list.push(c);
      else byYear.set(c.year, [c]);
    }
    return years.map((y, yi) => (
      <g role="row" key={y}>
        {(byYear.get(y) ?? []).map((c) => (
          <rect
            key={c.period}
            id={`${uid}-c${c.index}`}
            data-i={c.index}
            role="gridcell"
            aria-label={c.label}
            x={colX(c.period) + gap / 2}
            y={rowY(yi) + gap / 2}
            width={Math.max(0.5, cw - gap)}
            height={Math.max(0.5, rowH - gap)}
            opacity={c.outside ? 0.25 : 1}
            style={{
              fill: c.style.fill,
              fillOpacity: c.style.fillOpacity,
              stroke: c.style.stroke,
              strokeWidth: c.style.strokeWidth,
              strokeDasharray: c.style.strokeDasharray,
            }}
          />
        ))}
      </g>
    ));
    // colX/rowY depend only on cw, rowH, M.left and M.top, all listed.
  }, [cells, years, uid, cw, rowH, gap, M.left, M.top]);

  // ---- interaction ----
  const [hover, setHover] = useState(null);
  const [active, setActive] = useState(null);
  const [focused, setFocused] = useState(false);
  const [tipHidden, setTipHidden] = useState(false);
  const lookup = useMemo(() => new Map(cells.map((c) => [`${c.year}:${c.period}`, c.index])), [cells]);
  const safeActive = active !== null && active < cells.length ? active : null;

  const toRef = (c) =>
    grain === "week" ? { year: c.year, week: c.period } : { year: c.year, month: c.period };
  const indexFromEvent = (e) => {
    const v = e.target.getAttribute?.("data-i");
    return v === null || v === undefined ? null : Number(v);
  };
  const step = (c, dYear, dPeriod) => {
    const yi = yearIndex.get(c.year) ?? 0;
    for (let k = 1; k <= Math.max(cols, years.length); k++) {
      const y = years[yi + dYear * k];
      const p = c.period + dPeriod * k;
      if (dYear !== 0 && y === undefined) return undefined;
      if (p < 1 || p > cols) return undefined;
      const hit = lookup.get(`${dYear !== 0 ? y : c.year}:${p}`);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  const onKeyDown = (e) => {
    if (cells.length === 0) return;
    const cur = cells[safeActive ?? cells.length - 1];
    let target;
    switch (e.key) {
      case "ArrowRight":
        target = step(cur, 0, 1);
        break;
      case "ArrowLeft":
        target = step(cur, 0, -1);
        break;
      case "ArrowDown":
        target = step(cur, 1, 0);
        break;
      case "ArrowUp":
        target = step(cur, -1, 0);
        break;
      case "Home":
        target = cells.find((c) => c.year === cur.year)?.index;
        break;
      case "End":
        target = [...cells].reverse().find((c) => c.year === cur.year)?.index;
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        onSelect?.(toRef(cur));
        return;
      case "Escape":
        setTipHidden(true);
        return;
      default:
        return;
    }
    e.preventDefault();
    if (target !== undefined) {
      setActive(target);
      setTipHidden(false);
    }
  };

  // ---- decorations ----
  const critical = criticalColumns(grain, season?.critical_weeks);
  const critRuns = runsOf(critical, cols);
  const critLabelW = textW(CRITICAL_LABEL) + 8;
  let critLabel = null;
  if (critRuns.length > 0) {
    const firstStart = colX(critRuns[0][0]);
    const firstEnd = colX(critRuns[0][1] + 1);
    const nextStart = critRuns[1] ? colX(critRuns[1][0]) : W - M.right;
    if (nextStart - firstEnd >= critLabelW) critLabel = { x: firstEnd + 4, anchor: "start" };
    else if (firstStart - M.left >= critLabelW) critLabel = { x: firstStart - 4, anchor: "end" };
  }

  const monthLabels =
    grain === "week"
      ? monthStartWeeks().map(({ month, week }) => ({
          x: colX(week) + 1,
          text: cw * 4.3 >= textW("Mmm") + 8 ? monthName(month, "short") : monthName(month, "short")[0],
          anchor: "start",
        }))
      : Array.from({ length: 12 }, (_, i) => ({
          x: colX(i + 1) + cw / 2,
          text: cw >= textW("Mmm") + 4 ? monthName(i + 1, "short") : monthName(i + 1, "short")[0],
          anchor: "middle",
        }));

  const showAllYears = rowH >= 11;
  // Rows a year label needs so two labels never touch; a multiple of 5 too close to the first
  // or last year is dropped (C1: "2025" and "2026" overlapped at 360 px).
  const labelRows = Math.ceil((CHART_FONT.min + 2) / rowH);
  const yearLabelled = (y, yi) =>
    showAllYears ||
    yi === 0 ||
    yi === years.length - 1 ||
    (y % 5 === 0 && yi >= labelRows && yi <= years.length - 1 - labelRows);
  const spliceIdx = lens === "naive_splice" ? yearIndex.get(NAIVE_SPLICE_YEAR) : undefined;
  const sources = [...new Set([...grid.rowSource.values()].filter((s) => s !== null))];

  // ---- legend row (era strip + critical fallback) ----
  const legendItems = sources.map((s) => ({
    swatch: (
      <rect width={12} height={4} y={-4} style={{ fill: SENSOR_STYLE[s]?.color ?? "var(--fr-muted)" }} />
    ),
    label: SENSOR_STYLE[s]?.label ?? s,
  }));
  if (critRuns.length > 0 && !critLabel) {
    legendItems.push({
      swatch: <rect width={12} height={6} y={-6} style={{ fill: "var(--fr-warning)" }} />,
      label: CRITICAL_LABEL,
    });
  }
  // Wrap onto a new line rather than run past the right edge (C1: clipped at 360 px).
  const LEGEND_LINE = 16;
  const legendX0 = M.left - 6;
  let lx = legendX0;
  let legendRow = 0;
  const legendPos = legendItems.map((it) => {
    const w = 16 + textW(it.label);
    if (lx > legendX0 && lx + w > W - M.right) {
      lx = legendX0;
      legendRow += 1;
    }
    const pos = { x: lx, row: legendRow };
    lx += w + 14;
    return pos;
  });
  const H = gridBottom + M.bottom + legendRow * LEGEND_LINE;
  const legend = legendItems.map((it, i) => {
    const { x, row } = legendPos[i];
    return (
      <g key={it.label} transform={`translate(${x},${gridBottom + 20 + row * LEGEND_LINE})`}>
        {it.swatch}
        <text x={16} y={0} style={{ fill: "var(--fr-muted)", fontSize: CHART_FONT.min }}>
          {it.label}
        </text>
      </g>
    );
  });

  // ---- tooltip ----
  const tipIndex = hover ?? (focused && !tipHidden ? safeActive : null);
  const tipCell = tipIndex !== null ? cells[tipIndex] : undefined;
  let tooltip = null;
  if (tipCell) {
    const yi = yearIndex.get(tipCell.year) ?? 0;
    const x0 = colX(tipCell.period);
    const y0 = rowY(yi);
    const lineH = 15;
    const w = Math.min(W - 8, Math.max(...tipCell.lines.map((l, i) => textW(l, i === 0 ? 12.5 : 12))) + 16);
    const h = tipCell.lines.length * lineH + 10;
    let tx = x0 + cw + 6;
    if (tx + w > W - 2) tx = x0 - w - 6;
    tx = clamp(tx, 2, W - w - 2);
    let ty = y0 - h - 4;
    if (ty < 2) ty = y0 + rowH + 4;
    ty = Math.min(ty, H - h - 2);
    tooltip = (
      <g transform={`translate(${tx},${ty})`} pointerEvents="none" aria-hidden="true">
        <rect
          width={w}
          height={h}
          rx={6}
          style={{ fill: "var(--fr-surface)", stroke: "var(--fr-border)", strokeWidth: 1 }}
        />
        {tipCell.lines.map((l, i) => (
          <text
            key={i}
            x={8}
            y={18 + i * lineH}
            style={{
              fill: i === 0 ? "var(--fr-text)" : "var(--fr-muted)",
              fontSize: i === 0 ? 12.5 : 12,
              fontWeight: i === 0 ? 600 : 400,
            }}
          >
            {l}
          </text>
        ))}
      </g>
    );
  }
  const outline = (i, color, width) => {
    if (i === null || !cells[i]) return null;
    const c = cells[i];
    const yi = yearIndex.get(c.year) ?? 0;
    return (
      <rect
        x={colX(c.period)}
        y={rowY(yi)}
        width={cw}
        height={rowH}
        pointerEvents="none"
        style={{ fill: "none", stroke: color, strokeWidth: width }}
      />
    );
  };

  const seriesLabel =
    lens === "naive_splice"
      ? "the raw record as downloaded (MODIS Aqua, then VIIRS)"
      : (file?.series_meta?.[lens]?.label ?? lens);
  const [b0, b1] = climatology?.baseline_years ?? [undefined, undefined];
  const aria =
    cells.length === 0
      ? "Calendar: no data."
      : `Calendar of ${seriesLabel}, by ${grain}, ${years[0]}–${years[years.length - 1]}. ` +
        (mode === "activity"
          ? `Brighter cells mean more burning, in ${grid.unit}. `
          : `Colour compares each ${grain} with the same ${grain} in ${b0}–${b1}: purple quieter, orange busier. `) +
        "Hatched cells have no data. Use the arrow keys to move between cells and Enter to select.";

  return (
    <>
      <svg
        ref={rootRef}
        className="fr-viz"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        // A grid must contain rows; with no data the chart is announced as an image with its "no data" label.
        role={cells.length === 0 ? "img" : "grid"}
        aria-label={aria}
        aria-activedescendant={focused && safeActive !== null ? `${uid}-c${safeActive}` : undefined}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => {
          setFocused(true);
          if (safeActive === null && cells.length > 0) setActive(cells.length - 1);
        }}
        onBlur={() => setFocused(false)}
        style={{ display: "block", maxWidth: "100%", overflow: "visible", outline: "none" }}
      >
        <VizDefs />

        {/* month labels on top (both grains) */}
        <g aria-hidden="true">
          {monthLabels.map((m) => (
            <text
              key={m.x}
              x={m.x}
              y={13}
              textAnchor={m.anchor}
              style={{ fill: "var(--fr-muted)", fontSize: CHART_FONT.min }}
            >
              {m.text}
            </text>
          ))}
        </g>

        {/* critical weeks band */}
        {critRuns.length > 0 && (
          <g aria-hidden="true">
            {critRuns.map(([a, b]) => (
              <rect
                key={a}
                x={colX(a)}
                y={20}
                width={colX(b + 1) - colX(a)}
                height={6}
                rx={2}
                style={{ fill: "var(--fr-warning)" }}
              />
            ))}
            {critLabel && (
              <text
                x={critLabel.x}
                y={26.5}
                textAnchor={critLabel.anchor}
                style={{ fill: "var(--fr-text)", fontSize: CHART_FONT.min }}
              >
                {CRITICAL_LABEL}
              </text>
            )}
          </g>
        )}

        {/* year labels + era strip */}
        <g aria-hidden="true">
          {years.map((y, yi) => {
            const src = grid.rowSource.get(y);
            const labelled = yearLabelled(y, yi);
            return (
              <g key={y}>
                {labelled && (
                  <text
                    x={M.left - 10}
                    y={rowY(yi) + rowH / 2 + 4}
                    textAnchor="end"
                    style={{ fill: "var(--fr-muted)", fontSize: CHART_FONT.min }}
                  >
                    {y}
                  </text>
                )}
                {src && (
                  <rect
                    x={M.left - 6}
                    y={rowY(yi) + gap / 2}
                    width={3}
                    height={Math.max(0.5, rowH - gap)}
                    style={{ fill: SENSOR_STYLE[src]?.color ?? "var(--fr-muted)" }}
                  />
                )}
              </g>
            );
          })}
        </g>

        {/* cells */}
        <g
          onMouseOver={(e) => setHover(indexFromEvent(e))}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => {
            const i = indexFromEvent(e);
            if (i === null || !cells[i]) return;
            setActive(i);
            onSelect?.(toRef(cells[i]));
          }}
          style={{ cursor: onSelect ? "pointer" : "default" }}
        >
          {cellsLayer}
        </g>

        {/* naive splice: sensor switch marker between the last Aqua row and the first VIIRS row */}
        {spliceIdx !== undefined && spliceIdx > 0 && (
          <g aria-hidden="true" pointerEvents="none">
            <line
              x1={M.left - 8}
              x2={W - M.right}
              y1={rowY(spliceIdx)}
              y2={rowY(spliceIdx)}
              style={{ stroke: "var(--fr-text)", strokeWidth: 1.5, strokeDasharray: "4 2" }}
            />
            <text
              x={W - M.right}
              y={rowY(spliceIdx) - 3}
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
              {SPLICE_LABEL}
            </text>
          </g>
        )}

        {/* hover + keyboard focus outlines */}
        {outline(hover, "var(--fr-text)", 1.5)}
        {focused && outline(safeActive, "var(--fr-focus-color)", 2)}

        {legend}

        {cells.length === 0 && (
          <text
            x={(M.left + W - M.right) / 2}
            y={M.top + 1.5 * rowH + 5}
            textAnchor="middle"
            style={{ fill: "var(--fr-muted)", fontSize: CHART_FONT.body }}
          >
            No data for this chart
          </text>
        )}

        {tooltip}
      </svg>

      <div className="fr-sr-only">
        <table>
          <caption>
            {seriesLabel}, by {grain}, in {grid.unit}. “no data” means the record does not cover that period.
          </caption>
          <thead>
            <tr>
              <th scope="col">Year</th>
              {Array.from({ length: cols }, (_, i) => (
                <th scope="col" key={i}>
                  {grain === "week" ? `Week ${i + 1}` : monthName(i + 1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y}>
                <th scope="row">{y}</th>
                {Array.from({ length: cols }, (_, i) => {
                  const idx = lookup.get(`${y}:${i + 1}`);
                  const c = idx !== undefined ? cells[idx] : undefined;
                  return <td key={i}>{c ? (c.value === null ? "no data" : c.lines[1]) : ""}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
});
