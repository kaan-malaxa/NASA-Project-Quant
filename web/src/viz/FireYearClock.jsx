// FireYearClock (spec §9.5, prompt B2): the week heatmap wrapped around a circle. The signature view.
// 52 wedges (week 1 at 12 o'clock, clockwise), one ring per year (earliest innermost, the current year
// outermost). Cell styles come from the same buildHeatGrid + cellStyle as CalendarHeatmap, so the two
// views can never disagree. Hover outlines are pure CSS (.fr-cell:hover in tokens.css).

import { arc } from "d3";
import { forwardRef, useId, useMemo, useState } from "react";
import {
  INNER_FRACTION,
  circularRuns,
  monthSectors,
  peakPhrase,
  polar,
  ringRadii,
  runAngles,
  textArcPath,
  weekAngles,
} from "./clockLayout";
import { VizDefs } from "./defs";
import { buildHeatGrid, lensUnit, NAIVE_SPLICE_YEAR } from "./heatmapData";
import { mergeRefs, useElementWidth } from "./hooks";
import { CHART_FONT, formatNumber, formatWeekShort, monthName } from "./theme";

const CRITICAL_LABEL = "critical weeks";
const SPLICE_LABEL = "sensor switch";
const MAX_DIAMETER = 640;
const MARGIN = 46; // room outside the rings for the critical band, its label and month names
const textW = (s, size = CHART_FONT.min) => s.length * size * 0.58;

export const FireYearClock = forwardRef(function FireYearClock(
  { weekly, climatology, season, lens, mode, range, currentYear, onSelect },
  ref,
) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [measureRef, measured] = useElementWidth(560);
  const rootRef = useMemo(() => mergeRefs(ref, measureRef), [ref, measureRef]);

  const unit = lensUnit(weekly?.series_meta, lens, "week");
  const from = range?.from;
  const to = range?.to;
  const grid = useMemo(
    () =>
      buildHeatGrid({
        rows: weekly?.rows,
        grain: "week",
        lens,
        mode,
        climatology,
        range: from && to ? { from, to } : undefined,
        unit,
      }),
    [weekly, lens, mode, climatology, from, to, unit],
  );
  const { cells } = grid;

  // ---- rings: first data year (innermost) … current year (outermost) ----
  const firstYear = grid.years[0];
  const lastDataYear = grid.years[grid.years.length - 1];
  const lastYear =
    firstYear === undefined
      ? undefined
      : Math.max(lastDataYear, Number.isFinite(currentYear) ? currentYear : lastDataYear);
  const nRings = firstYear === undefined || lastYear === undefined ? 0 : lastYear - firstYear + 1;

  // ---- geometry: viewBox = measured CSS width; the clock is centred and capped ----
  const W = Math.max(280, measured);
  const D = Math.min(W, MAX_DIAMETER);
  const H = D;
  const cx = W / 2;
  const cy = D / 2;
  const R = D / 2 - MARGIN;
  const r0 = R * INNER_FRACTION;
  const ring = (year) => ringRadii(year - (firstYear ?? year), nRings, r0, R);

  const arcGen = useMemo(
    () =>
      arc()
        .innerRadius((d) => d.inner)
        .outerRadius((d) => d.outer)
        .startAngle((d) => d.a0)
        .endAngle((d) => d.a1)
        .padRadius(R)
        .padAngle(0.5 / Math.max(R, 1)), // 0.5 px between neighbouring weeks
    [R],
  );
  const cellArc = (c) => {
    const [inner, outer] = ring(c.year);
    const [a0, a1] = weekAngles(c.period);
    return { inner: inner + 0.25, outer: Math.max(inner + 0.5, outer - 0.25), a0, a1 }; // 0.5 px between rings
  };

  // ---- cells: one <path> each, built once per data/layout change ----
  const cellsLayer = useMemo(() => {
    const byYear = new Map();
    for (const c of cells) {
      const list = byYear.get(c.year);
      if (list) list.push(c);
      else byYear.set(c.year, [c]);
    }
    return [...byYear.entries()].map(([year, list]) => (
      <g role="row" key={year}>
        {list.map((c) => (
          <path
            key={c.period}
            id={`${uid}-c${c.index}`}
            data-i={c.index}
            className="fr-cell"
            role="gridcell"
            aria-label={c.label}
            d={arcGen(cellArc(c)) ?? ""}
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
    // cellArc depends only on firstYear, nRings, r0, R and arcGen, all listed.
  }, [cells, uid, arcGen, firstYear, nRings, r0, R]);

  // ---- interaction (same model as CalendarHeatmap; up = outward = later year) ----
  const [hover, setHover] = useState(null);
  const [active, setActive] = useState(null);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lookup = useMemo(() => new Map(cells.map((c) => [`${c.year}:${c.period}`, c.index])), [cells]);
  const safeActive = active !== null && active < cells.length ? active : null;

  const indexFromEvent = (e) => {
    const v = e.target.getAttribute?.("data-i");
    return v === null || v === undefined ? null : Number(v);
  };
  const find = (year, week) => lookup.get(`${year}:${week}`);
  const stepWeek = (c, d) => {
    for (let k = 1; k < 52; k++) {
      const w = ((((c.period - 1 + d * k) % 52) + 52) % 52) + 1; // wraps around the circle
      const hit = find(c.year, w);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  const stepYear = (c, d) => {
    for (
      let y = c.year + d;
      firstYear !== undefined && lastYear !== undefined && y >= firstYear && y <= lastYear;
      y += d
    ) {
      const hit = find(y, c.period);
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
        target = stepWeek(cur, 1);
        break;
      case "ArrowLeft":
        target = stepWeek(cur, -1);
        break;
      case "ArrowUp":
        target = stepYear(cur, 1);
        break;
      case "ArrowDown":
        target = stepYear(cur, -1);
        break;
      case "Home":
        target = find(cur.year, 1) ?? stepWeek({ ...cur, period: 52 }, 1);
        break;
      case "End":
        target = find(cur.year, 52) ?? stepWeek({ ...cur, period: 1 }, -1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        onSelect?.({ year: cur.year, week: cur.period });
        return;
      case "Escape":
        setHidden(true);
        return;
      default:
        return;
    }
    e.preventDefault();
    if (target !== undefined) {
      setActive(target);
      setHidden(false);
    }
  };

  // ---- centre text ----
  const shown = hover ?? (focused && !hidden ? safeActive : null);
  const shownCell = shown !== null ? cells[shown] : undefined;
  const phrase = peakPhrase(season);
  let centre = [];
  if (shownCell) {
    centre = [
      { text: String(shownCell.year), strong: true },
      { text: formatWeekShort(shownCell.year, shownCell.period) },
      { text: shownCell.value === null ? "no data" : formatNumber(shownCell.value) },
    ];
  } else if (phrase) {
    const wide = r0 * 2 >= textW(phrase, 13) + 8;
    centre = wide
      ? [{ text: "Peak:" }, { text: phrase, strong: true }]
      : [{ text: "Peak:" }, ...phrase.split(" ").map((t) => ({ text: t, strong: true }))];
  }

  // ---- decorations ----
  const months = monthSectors();
  const critRuns = circularRuns(season?.critical_weeks ?? []);
  const bandArc = arc()
    .innerRadius((d) => d.inner)
    .outerRadius((d) => d.outer)
    .startAngle((d) => d.a0)
    .endAngle((d) => d.a1);
  const longest = critRuns.reduce((best, run) => {
    const [a0, a1] = runAngles(run);
    return !best || a1 - a0 > runAngles(best)[1] - runAngles(best)[0] ? run : best;
  }, null);
  // Label along the longest run, centred on it; the text path is widened when the run is short.
  // On the lower half the path is reversed (upright text), so its baseline moves outward.
  const critPath = longest
    ? (() => {
        const [a0, a1] = runAngles(longest);
        const span = Math.max(a1 - a0, (textW(CRITICAL_LABEL) + 10) / (R + 16)) + 0.4;
        const m = (a0 + a1) / 2;
        const { flipped } = textArcPath(m - span / 2, m + span / 2, R + 16);
        return textArcPath(m - span / 2, m + span / 2, flipped ? R + 20 : R + 12);
      })()
    : null;

  const currentRing =
    firstYear !== undefined && Number.isFinite(currentYear) && currentYear >= firstYear
      ? ring(currentYear)
      : null;
  const yearLabels =
    firstYear !== undefined && lastYear !== undefined
      ? Array.from({ length: nRings }, (_, i) => firstYear + i).filter((y) => y % 5 === 0)
      : [];
  const spliceRing =
    lens === "naive_splice" &&
    firstYear !== undefined &&
    NAIVE_SPLICE_YEAR > firstYear &&
    lastYear !== undefined &&
    NAIVE_SPLICE_YEAR <= lastYear
      ? ring(NAIVE_SPLICE_YEAR)[0]
      : null;

  const focusOutline =
    focused && safeActive !== null && cells[safeActive] ? (
      <path
        d={arcGen(cellArc(cells[safeActive])) ?? ""}
        pointerEvents="none"
        style={{ fill: "none", stroke: "var(--fr-focus-color)", strokeWidth: 2 }}
      />
    ) : null;

  const seriesLabel =
    lens === "naive_splice"
      ? "the raw record as downloaded (MODIS Aqua, then VIIRS)"
      : (weekly?.series_meta?.[lens]?.label ?? lens);
  const aria =
    cells.length === 0
      ? "Fire year clock: no data."
      : `Fire year clock of ${seriesLabel}: one ring per year, ${firstYear} in the centre to ${lastYear} on the outside; ` +
        `weeks run clockwise from January at the top. ${phrase ? `Peak: ${phrase}. ` : ""}` +
        (mode === "activity"
          ? "Brighter means more burning. "
          : "Purple is quieter than usual, orange busier. ") +
        "Hatched cells have no data. Left and right arrows move by week, up and down by year, Enter selects.";

  return (
    <>
      <svg
        ref={rootRef}
        className="fr-viz"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="grid"
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
        <g transform={`translate(${cx},${cy})`}>
          {/* cells */}
          <g
            onMouseOver={(e) => {
              const i = indexFromEvent(e);
              if (i !== hover) setHover(i);
            }}
            onMouseLeave={() => setHover(null)}
            onClick={(e) => {
              const i = indexFromEvent(e);
              if (i === null || !cells[i]) return;
              setActive(i);
              onSelect?.({ year: cells[i].year, week: cells[i].period });
            }}
            style={{ cursor: onSelect ? "pointer" : "default" }}
          >
            {cellsLayer}
          </g>

          {/* month spokes (over the rings, in the background colour so they read as boundaries) */}
          <g aria-hidden="true" pointerEvents="none">
            {months.map((m) => {
              const [x0, y0] = polar(m.a0, r0);
              const [x1, y1] = polar(m.a0, R + 2);
              const [x2, y2] = polar(m.a0, R + 10);
              return (
                <g key={m.month}>
                  <line
                    x1={x0}
                    y1={y0}
                    x2={x1}
                    y2={y1}
                    style={{ stroke: "var(--fr-bg)", strokeWidth: 1, strokeOpacity: 0.85 }}
                  />
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    style={{ stroke: "var(--fr-muted)", strokeWidth: 1 }}
                  />
                </g>
              );
            })}
          </g>

          {/* current year ring outline */}
          {currentRing && (
            <g
              aria-hidden="true"
              pointerEvents="none"
              style={{ fill: "none", stroke: "var(--fr-text)", strokeWidth: 1.5 }}
            >
              <circle r={currentRing[0]} />
              <circle r={currentRing[1]} />
            </g>
          )}

          {/* naive splice: ring boundary at the sensor switch */}
          {spliceRing !== null && (
            <g aria-hidden="true" pointerEvents="none">
              <circle
                r={spliceRing}
                style={{ fill: "none", stroke: "var(--fr-text)", strokeWidth: 1.5, strokeDasharray: "4 2" }}
              />
              <text
                x={0}
                y={spliceRing + 12}
                textAnchor="middle"
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

          {/* year labels at week 1 for every fifth year */}
          <g aria-hidden="true" pointerEvents="none">
            {yearLabels.map((y) => {
              const [a, b] = ring(y);
              return (
                <text
                  key={y}
                  x={3}
                  y={-(a + b) / 2 + 4}
                  style={{
                    fill: "var(--fr-text)",
                    fontSize: CHART_FONT.min,
                    paintOrder: "stroke",
                    stroke: "var(--fr-bg)",
                    strokeWidth: 3,
                  }}
                >
                  {y}
                </text>
              );
            })}
          </g>

          {/* critical weeks: outer arc band + label along it */}
          {critRuns.length > 0 && (
            <g aria-hidden="true" pointerEvents="none">
              {critRuns.map((run) => {
                const [a0, a1] = runAngles(run);
                return (
                  <path
                    key={`${run[0]}-${run[1]}`}
                    d={bandArc({ inner: R + 3, outer: R + 8, a0, a1 }) ?? ""}
                    style={{ fill: "var(--fr-warning)" }}
                  />
                );
              })}
              {critPath && (
                <>
                  <path id={`${uid}-crit`} d={critPath.d} style={{ fill: "none", stroke: "none" }} />
                  <text style={{ fill: "var(--fr-text)", fontSize: CHART_FONT.min, fontWeight: 600 }}>
                    <textPath href={`#${uid}-crit`} startOffset="50%" textAnchor="middle">
                      {CRITICAL_LABEL}
                    </textPath>
                  </text>
                </>
              )}
            </g>
          )}

          {/* month names around the outside */}
          <g aria-hidden="true" pointerEvents="none">
            {months.map((m) => {
              const [x, y] = polar(m.mid, R + 33);
              return (
                <text
                  key={m.month}
                  x={x}
                  y={y + 4}
                  textAnchor="middle"
                  style={{ fill: "var(--fr-muted)", fontSize: CHART_FONT.min }}
                >
                  {monthName(m.month, "short")}
                </text>
              );
            })}
          </g>

          {focusOutline}

          {/* centre: typical peak, or the hovered/focused cell */}
          <g aria-hidden="true" pointerEvents="none">
            {cells.length === 0 ? (
              <text textAnchor="middle" y={4} style={{ fill: "var(--fr-muted)", fontSize: CHART_FONT.body }}>
                No data
              </text>
            ) : (
              centre.map((l, i) => (
                <text
                  key={i}
                  x={0}
                  y={(i - (centre.length - 1) / 2) * 14 + 4}
                  textAnchor="middle"
                  style={{
                    fill: l.strong ? "var(--fr-text)" : "var(--fr-muted)",
                    fontSize: l.strong ? 13 : CHART_FONT.min,
                    fontWeight: l.strong ? 650 : 400,
                    paintOrder: "stroke",
                    stroke: "var(--fr-bg)",
                    strokeWidth: 3,
                  }}
                >
                  {l.text}
                </text>
              ))
            )}
          </g>
        </g>
      </svg>

      <div className="fr-sr-only">
        <table>
          <caption>
            {seriesLabel}, by week, in {grid.unit}. “no data” means the record does not cover that week.
          </caption>
          <thead>
            <tr>
              <th scope="col">Year</th>
              {Array.from({ length: 52 }, (_, i) => (
                <th scope="col" key={i}>
                  Week {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.years.map((y) => (
              <tr key={y}>
                <th scope="row">{y}</th>
                {Array.from({ length: 52 }, (_, i) => {
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
