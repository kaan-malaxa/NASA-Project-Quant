import { forwardRef } from "react";

/** Both predictions for each point were fitted without that point's calendar year. */
export const HeldoutAgreement = forwardRef(function HeldoutAgreement({ comparison = [] }, ref) {
  if (!comparison.length) return <p>Matching held-out comparisons are unavailable.</p>;
  const max = Math.max(...comparison.flatMap((row) => [row.tier1, row.tier2]), 1) * 1.05;
  const x = (value) => 65 + 460 * value / max;
  const y = (value) => 300 - 245 * value / max;
  return <figure>
    <svg ref={ref} viewBox="0 0 600 365" role="img" aria-label="Two translation routes compared on matching excluded-year weeks" className="w-full">
      <line x1={x(0)} y1={y(0)} x2={x(max)} y2={y(max)} stroke="var(--fr-muted)" strokeDasharray="5 3" />
      {comparison.map((row) => <circle key={`${row.year}-${row.week}`} cx={x(row.tier1)} cy={y(row.tier2)} r="2.5"
        fill="var(--fr-accent)" opacity="0.55" aria-label={`${row.year}, week ${row.week}: Tier 1 ${row.tier1}, Tier 2 ${row.tier2}; excluded year ${row.excluded_year}`} />)}
      {[0, 0.5, 1].map((fraction) => <g key={fraction} fill="var(--fr-text)" fontSize="12">
        <text x={x(max * fraction)} y="320" textAnchor="middle">{Math.round(max * fraction)}</text>
        <text x="55" y={y(max * fraction)} textAnchor="end">{Math.round(max * fraction)}</text>
      </g>)}
      <text x="300" y="350" textAnchor="middle" fill="var(--fr-text)" fontSize="13">Tier 1 predicted Aqua-equivalent fire cell-days per week</text>
      <text x="17" y="170" transform="rotate(-90 17 170)" textAnchor="middle" fill="var(--fr-text)" fontSize="13">Tier 2 predicted fire cell-days per week</text>
    </svg>
    <figcaption className="text-sm">Each point compares the same excluded year and week. The dashed line marks equal predictions.</figcaption>
  </figure>;
});
