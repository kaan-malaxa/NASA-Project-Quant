import { VIEW, arrowsGeometry } from "./sensorArrows.js";

const MONO = "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)";
const FG = "var(--foreground)";
const ACCENT = "var(--primary)";
const PROBLEM_LABEL =
  "Two satellite records drawn as arrows: the older MODIS record and the newer VIIRS record. Where they meet, the newer record starts higher, so the joined record jumps.";
const SOLUTION_LABEL =
  "The newer VIIRS record is translated down onto the older MODIS scale, and the two join into one harmonized record with no jump.";

/** A line with an arrowhead at (x2, y), pointing along the line. Widths stay in screen pixels. */
function Arrow({ x1, x2, y, color, width, opacity }) {
  if (opacity <= 0 || Math.abs(x2 - x1) < 1) return null;
  const dir = x2 >= x1 ? 1 : -1;
  const head = Math.abs(x2 - x1) > 12;
  return (
    <g opacity={opacity}>
      <line
        x1={x1}
        y1={y}
        x2={x2}
        y2={y}
        stroke={color}
        strokeWidth={width}
        vectorEffect="non-scaling-stroke"
      />
      {head ? (
        <path d={`M ${x2} ${y} L ${x2 - dir * 10} ${y - 5} L ${x2 - dir * 10} ${y + 5} Z`} fill={color} />
      ) : null}
    </g>
  );
}

/**
 * The "two records" diagram (problem -> solution). Geometry from arrowsGeometry; years from ruler.json (or none).
 * @param {object} p
 * @param {number} p.intro 0..1 the collision animation (plays once)
 * @param {number} p.merge 0..1 the move to the solution
 * @param {number | null} [p.pulse] 0..1 the ring pulse along the joined arrow, or null
 * @param {{ first: number, switch: number, last: number } | null} p.years from loaderYears(ruler.json)
 * @param {boolean} [p.still] reduced motion: no pulsing gap
 */
export default function SensorArrows({ intro, merge, pulse = null, years, still = false }) {
  const g = arrowsGeometry({ intro, merge, years });
  const V = VIEW;
  return (
    <figure className="sensor-arrows w-full">
      <svg
        viewBox={`0 0 ${V.w} ${V.h}`}
        role="img"
        aria-label={merge >= 0.5 ? SOLUTION_LABEL : PROBLEM_LABEL}
        className="block h-auto w-full"
        style={{ fontFamily: MONO }}
      >
        {/* time axis with the years from ruler.json */}
        <line
          x1={V.left}
          y1={V.axisY}
          x2={V.right}
          y2={V.axisY}
          stroke={FG}
          strokeOpacity={0.3}
          vectorEffect="non-scaling-stroke"
        />
        {g.ticks.map((t) => (
          <g key={t.label}>
            <line
              x1={t.x}
              y1={V.axisY - 4}
              x2={t.x}
              y2={V.axisY + 4}
              stroke={FG}
              strokeOpacity={0.5}
              vectorEffect="non-scaling-stroke"
            />
            <text x={t.x} y={V.axisY + 20} textAnchor="middle" fontSize="12" fill="var(--muted-foreground)">
              {t.label}
            </text>
          </g>
        ))}
        <line
          x1={g.switchX}
          y1={V.axisY}
          x2={g.switchX}
          y2={V.highY - 16}
          stroke={FG}
          strokeOpacity={0.18}
          strokeDasharray="2 4"
          vectorEffect="non-scaling-stroke"
        />

        <Arrow
          x1={g.modis.x1}
          x2={g.modis.x2}
          y={g.modis.y}
          color={FG}
          width={1.25}
          opacity={g.modis.opacity}
        />
        <Arrow
          x1={g.viirs.x1}
          x2={g.viirs.x2}
          y={g.viirs.y}
          color={ACCENT}
          width={2.5}
          opacity={g.viirs.opacity}
        />
        <Arrow
          x1={g.joined.x1}
          x2={g.joined.x2}
          y={g.joined.y}
          color={ACCENT}
          width={2.5}
          opacity={g.joined.opacity}
        />

        {/* the collision spark */}
        {g.spark.opacity > 0 ? (
          <g stroke={ACCENT} opacity={g.spark.opacity}>
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i / 8) * Math.PI * 2 + 0.3;
              return (
                <line
                  key={i}
                  x1={g.spark.x + Math.cos(a) * g.spark.r}
                  y1={g.spark.y + Math.sin(a) * g.spark.r}
                  x2={g.spark.x + Math.cos(a) * (g.spark.r + 7)}
                  y2={g.spark.y + Math.sin(a) * (g.spark.r + 7)}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </g>
        ) : null}

        {/* the jump: a dashed bracket between the two levels */}
        {g.bracket.opacity > 0 ? (
          <g opacity={g.bracket.opacity} className={g.settled && !still ? "sensor-gap-pulse" : undefined}>
            <line
              x1={g.bracket.x}
              y1={g.bracket.y1}
              x2={g.bracket.x}
              y2={g.bracket.y2}
              stroke={FG}
              strokeOpacity={0.7}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
            {[g.bracket.y1, g.bracket.y2].map((y) => (
              <line
                key={y}
                x1={g.bracket.x - 5}
                y1={y}
                x2={g.bracket.x + 5}
                y2={y}
                stroke={FG}
                strokeOpacity={0.7}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <text
              x={g.bracket.x - 10}
              y={(g.bracket.y1 + g.bracket.y2) / 2 + 4}
              textAnchor="end"
              fontSize="12"
              fill={FG}
            >
              the jump
            </text>
          </g>
        ) : null}

        {/* labels */}
        <text x={V.left} y={V.lowY - 12} fontSize="13" fill={FG} opacity={g.labels.modis.opacity}>
          MODIS
        </text>
        <text
          x={V.right}
          y={g.viirs.y - 12}
          textAnchor="end"
          fontSize="13"
          fill={ACCENT}
          opacity={g.labels.viirs.opacity}
        >
          VIIRS
        </text>
        <text x={V.left} y={V.lowY - 12} fontSize="13" fill={ACCENT} opacity={g.labels.harmonized.opacity}>
          Harmonized
        </text>

        {/* a thin ring pulse running along the joined arrow, once */}
        {pulse !== null && pulse > 0 && pulse < 1 ? (
          <circle
            cx={V.left + (V.right - V.left) * pulse}
            cy={V.lowY}
            r={8}
            fill="none"
            stroke={ACCENT}
            opacity={1 - 0.6 * pulse}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>
      <figcaption className="text-muted-foreground mt-2 text-xs" style={{ fontFamily: MONO }}>
        Illustration, not to scale.
      </figcaption>
    </figure>
  );
}
