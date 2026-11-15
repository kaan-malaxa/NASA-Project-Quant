// DriftChart (spec §9.7, prompt D1): yearly calibration factor k for one region, with range
// whiskers, a band for the trusted-period average (years up to trustedThrough, i.e. the 2013–2022
// fit window), and a vertical line at trustedThrough: "We stop trusting Aqua here". Years after the
// line use the warning style: orange, hollow dot, dashed whisker (shape and text, not colour alone).

import { scaleLinear } from "d3";
import { forwardRef, useMemo } from "react";
import { VizDefs } from "./defs";
import { mergeRefs, useElementWidth } from "./hooks";
import { driftDomain, trustedMean, yearOfIso } from "./methodsLayout";
import { wrapText } from "./smallLayout";
import { CHART_FONT, KIND_STYLE, SENSOR_STYLE, formatNumber } from "./theme";

const TRUST_LABEL = "We stop trusting Aqua here";
const SENSOR_ORDER = ["snpp", "noaa20", "noaa21", "aqua", "terra"];
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const k2 = (v) => (isNum(v) ? formatNumber(v, 2) : "no data");

/** @type {import("react").ForwardRefRenderFunction<SVGSVGElement, import("./types").DriftChartProps>} */
function DriftChartImpl({ drift, region, trustedThrough }, ref) {
  const [measureRef, measured] = useElementWidth(640);
  const rootRef = useMemo(() => mergeRefs(ref, measureRef), [ref, measureRef]);

  const rows = useMemo(
    () => (drift ?? []).filter((d) => d.region === region).sort((a, b) => a.year - b.year),
    [drift, region],
  );
  const trustedYear = yearOfIso(trustedThrough);
  const sensors = [...new Set(rows.map((r) => r.sensor))].sort(
    (a, b) => SENSOR_ORDER.indexOf(a) - SENSOR_ORDER.indexOf(b),
  );
  const sensorNames = sensors.map((s) => SENSOR_STYLE[s]?.label ?? s);
  const bands = sensors.map((s) =>
    trustedMean(
      rows.filter((r) => r.sensor === s),
      trustedYear,
    ),
  );
  const firstBand = bands.find(Boolean);

  const W = Math.max(280, measured);
  const narrow = W < 520;
  const muted = { fill: "var(--fr-muted)", fontSize: CHART_FONT.min };

  // ---- caption: the takeaway in words (numbers only from props) ----
  const caption =
    rows.length === 0
      ? `No calibration drift data for this region.`
      : `Each dot is one year's k: Aqua fire cell-days per ${sensorNames.join(" or ")} fire cell-day, ` +
        `with its range.` +
        (firstBand ? ` The band is the ${firstBand.from}–${firstBand.to} average.` : "") +
        (trustedYear
          ? ` After ${trustedYear}, Aqua drifted off its usual overpass time; hollow orange dots mark those years, which are not used.`
          : "");
  const capLines = wrapText(caption, W - 16, CHART_FONT.small);
  const capH = capLines.length * 16 + 6;

  if (rows.length === 0) {
    const H = capH + 8;
    return (
      <svg
        ref={rootRef}
        className="fr-viz"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        tabIndex={0}
        aria-label={caption}
        style={{ display: "block", maxWidth: "100%" }}
      >
        {capLines.map((l, i) => (
          <text key={i} x={8} y={18 + i * 16} style={{ fill: "var(--fr-muted)", fontSize: CHART_FONT.small }}>
            {l}
          </text>
        ))}
      </svg>
    );
  }

  // ---- geometry ----
  // Axis title on its own line above the "We stop trusting Aqua here" label (D1: they collided).
  const M = { top: capH + 46, right: 14, bottom: 30, left: 46 };
  const plotH = narrow ? 180 : 220;
  const plotB = M.top + plotH;
  const H = plotB + M.bottom;
  const years = rows.map((r) => r.year);
  const y0 = Math.min(...years);
  const y1 = Math.max(...years);
  const x = scaleLinear()
    .domain([y0 - 0.5, y1 + 0.5])
    .range([M.left, W - M.right]);
  const y = scaleLinear().domain(driftDomain(rows, bands)).nice().range([plotB, M.top]);
  const yearW = x(y0 + 1) - x(y0);
  const yearStep = [1, 2, 5, 10].find((s) => yearW * s >= 34) ?? 10;
  const xTicks = [];
  for (let t = Math.ceil(y0 / yearStep) * yearStep; t <= y1; t += yearStep) xTicks.push(t);
  if (xTicks.length === 0) xTicks.push(y0);
  const yTicks = y.ticks(narrow ? 4 : 5);
  const offset = (s) => (sensors.indexOf(s) - (sensors.length - 1) / 2) * Math.min(8, yearW / 4);
  const after = (yr) => trustedYear !== null && yr > trustedYear;
  const lineX =
    trustedYear !== null && trustedYear >= y0 - 1 && trustedYear <= y1 ? x(trustedYear + 0.5) : null;
  const allMissing = rows.every((r) => !isNum(r.k_annual));

  const aria =
    `Calibration drift for ${region}, ${y0}–${y1}. ${caption} ` +
    bands
      .map((b, i) =>
        b
          ? `${sensorNames[i]}: ${b.from}–${b.to} average k ${k2(b.k)} (range ${k2(b.lo)} to ${k2(b.hi)}).`
          : "",
      )
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
        tabIndex={0}
        aria-label={aria}
        style={{ display: "block", maxWidth: "100%" }}
      >
        <VizDefs />
        <g aria-hidden="true">
          {capLines.map((l, i) => (
            <text
              key={i}
              x={8}
              y={18 + i * 16}
              style={{ fill: "var(--fr-text)", fontSize: CHART_FONT.small }}
            >
              {l}
            </text>
          ))}

          {/* axis title */}
          <text x={M.left - 38} y={M.top - 28} style={muted}>
            k (Aqua ÷ VIIRS fire cell-days)
          </text>

          {/* gridlines + y ticks */}
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
                {formatNumber(v, 2)}
              </text>
            </g>
          ))}

          {/* x ticks */}
          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={plotB + 18} textAnchor="middle" style={muted}>
              {t}
            </text>
          ))}
          <line
            x1={M.left}
            x2={W - M.right}
            y1={plotB}
            y2={plotB}
            style={{ stroke: "var(--fr-axis)", strokeWidth: 1 }}
          />

          {/* years with no k: hatched, never drawn as zero */}
          {rows
            .filter((r) => !isNum(r.k_annual))
            .map((r) => (
              <rect
                key={`m-${r.sensor}-${r.year}`}
                x={x(r.year - 0.5) + 1}
                y={M.top}
                width={Math.max(1, yearW - 2)}
                height={plotH}
                style={{ fill: KIND_STYLE.missing.fill, opacity: 0.7 }}
              />
            ))}
          {allMissing && (
            <text x={(M.left + W - M.right) / 2} y={M.top + plotH / 2} textAnchor="middle" style={muted}>
              No data: no k for these years
            </text>
          )}

          {/* trusted-period average band per sensor */}
          {bands.map((b, i) =>
            b && isNum(b.lo) && isNum(b.hi) ? (
              <g key={sensors[i]}>
                <rect
                  x={M.left}
                  y={y(b.hi)}
                  width={W - M.right - M.left}
                  height={Math.max(1, y(b.lo) - y(b.hi))}
                  style={{ fill: SENSOR_STYLE[sensors[i]]?.color ?? "var(--fr-accent)", fillOpacity: 0.14 }}
                />
                <line
                  x1={M.left}
                  x2={W - M.right}
                  y1={y(b.k)}
                  y2={y(b.k)}
                  style={{ stroke: SENSOR_STYLE[sensors[i]]?.color ?? "var(--fr-accent)", strokeWidth: 1 }}
                />
                <text
                  x={M.left + 4}
                  y={y(b.hi) - 4}
                  style={{
                    ...muted,
                    fill: "var(--fr-text)",
                    paintOrder: "stroke",
                    stroke: "var(--fr-bg)",
                    strokeWidth: 3,
                  }}
                >
                  {sensors.length > 1 ? `${sensorNames[i]}: ` : ""}
                  {b.from}–{b.to} average
                </text>
              </g>
            ) : null,
          )}

          {/* the line where Aqua stops being trusted */}
          {lineX !== null && (
            <g>
              <line
                x1={lineX}
                x2={lineX}
                y1={M.top - 8}
                y2={plotB}
                style={{ stroke: "var(--fr-warning)", strokeWidth: 1.5, strokeDasharray: "5 3" }}
              />
              {(() => {
                const w = TRUST_LABEL.length * CHART_FONT.small * 0.6;
                const right = lineX + 6 + w <= W - 2;
                return (
                  <text
                    x={right ? lineX + 6 : lineX - 6}
                    y={M.top - 10}
                    textAnchor={right ? "start" : "end"}
                    style={{ fill: "var(--fr-warning)", fontSize: CHART_FONT.small, fontWeight: 600 }}
                  >
                    {TRUST_LABEL}
                  </text>
                );
              })()}
            </g>
          )}
        </g>

        {/* one whisker + dot per year and sensor; <title> gives each mark a name on hover */}
        {rows
          .filter((r) => isNum(r.k_annual))
          .map((r) => {
            const cx = x(r.year) + offset(r.sensor);
            const late = after(r.year);
            const color = late
              ? "var(--fr-warning)"
              : sensors.length > 1
                ? (SENSOR_STYLE[r.sensor]?.color ?? "var(--fr-text)")
                : "var(--fr-text)";
            const name =
              `${r.year}, ${SENSOR_STYLE[r.sensor]?.label ?? r.sensor}: k ${k2(r.k_annual)}` +
              (isNum(r.lo) && isNum(r.hi) ? ` (range ${k2(r.lo)} to ${k2(r.hi)})` : "") +
              (late ? ", after Aqua stopped being trusted" : "");
            return (
              <g key={`${r.sensor}-${r.year}`}>
                <title>{name}</title>
                {isNum(r.lo) && isNum(r.hi) && (
                  <>
                    <line
                      x1={cx}
                      x2={cx}
                      y1={y(r.lo)}
                      y2={y(r.hi)}
                      style={{ stroke: color, strokeWidth: 1.5, strokeDasharray: late ? "3 2" : undefined }}
                    />
                    {[r.lo, r.hi].map((v, i) => (
                      <line
                        key={i}
                        x1={cx - 3}
                        x2={cx + 3}
                        y1={y(v)}
                        y2={y(v)}
                        style={{ stroke: color, strokeWidth: 1.5 }}
                      />
                    ))}
                  </>
                )}
                <circle
                  cx={cx}
                  cy={y(r.k_annual)}
                  r={4}
                  style={{ fill: late ? "var(--fr-bg)" : color, stroke: color, strokeWidth: 2 }}
                />
              </g>
            );
          })}
      </svg>

      <div className="fr-sr-only">
        <table>
          <caption>
            Yearly calibration factor k for {region}, with its range. Years after{" "}
            {trustedYear ?? "the cut-off"} are not trusted.
          </caption>
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col">Sensor</th>
              <th scope="col">k</th>
              <th scope="col">Range</th>
              <th scope="col">Trusted</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.sensor}-${r.year}`}>
                <th scope="row">{r.year}</th>
                <td>{SENSOR_STYLE[r.sensor]?.label ?? r.sensor}</td>
                <td>{k2(r.k_annual)}</td>
                <td>{isNum(r.lo) && isNum(r.hi) ? `${k2(r.lo)} to ${k2(r.hi)}` : "no data"}</td>
                <td>{after(r.year) ? "no" : "yes"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export const DriftChart = forwardRef(DriftChartImpl);
