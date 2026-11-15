import { forwardRef } from "react";
import { GLOSSARY } from "../lib/glossary.js";

/** Both predictions for each point were fitted without that point's calendar year. */
export const HeldoutAgreement = forwardRef(function HeldoutAgreement({ comparison = [] }, ref) {
  if (!comparison.length) return <p>Matching held-out comparisons are unavailable.</p>;
  const max = Math.max(...comparison.flatMap((row) => [row.tier1, row.tier2]), 1) * 1.05;
  const x = (value) => 65 + 460 * value / max;
  const y = (value) => 300 - 245 * value / max;
  return <figure>
    <svg ref={ref} viewBox="0 0 600 365" role="img" tabIndex={0} aria-label="Two translation routes compared on matching excluded-year weeks" className="fr-viz w-full">
      <line x1={x(0)} y1={y(0)} x2={x(max)} y2={y(max)} stroke="var(--fr-muted)" strokeDasharray="5 3" />
      {comparison.map((row) => <circle key={`${row.year}-${row.week}`} cx={x(row.tier1)} cy={y(row.tier2)} r="2.5"
        fill="var(--fr-accent)" opacity="0.55"><title>{`${row.year}, week ${row.week}: Tier 1 ${row.tier1}, Tier 2 ${row.tier2}; excluded year ${row.excluded_year}`}</title></circle>)}
      {[0, 0.5, 1].map((fraction) => <g key={fraction} fill="var(--fr-text)" fontSize="12">
        <text x={x(max * fraction)} y="320" textAnchor="middle">{Math.round(max * fraction)}</text>
        <text x="55" y={y(max * fraction)} textAnchor="end">{Math.round(max * fraction)}</text>
      </g>)}
      <text x="300" y="350" textAnchor="middle" fill="var(--fr-text)" fontSize="13">Count-based prediction (Aqua-equivalent)<title>{GLOSSARY.aqua_equivalent.text}</title></text>
      <text x="17" y="170" transform="rotate(-90 17 170)" textAnchor="middle" fill="var(--fr-text)" fontSize="13">Detection-model prediction</text>
    </svg>
    <figcaption className="text-sm">Both routes predict <abbr title={GLOSSARY.aqua_equivalent.text}>Aqua-equivalent</abbr> <abbr title={GLOSSARY.fire_cell_day.text}>fire cell-days</abbr> per week. Each point compares the same week, with both models fitted without that calendar year. The dashed line marks equal predictions.</figcaption>
    <div className="fr-sr-only"><table>
      <caption>Matching held-out predictions, in Aqua-equivalent fire cell-days per week</caption>
      <thead><tr><th scope="col">Year</th><th scope="col">Week</th><th scope="col">Excluded year</th><th scope="col">Tier 1</th><th scope="col">Tier 2</th></tr></thead>
      <tbody>{comparison.map((row) => <tr key={`${row.year}-${row.week}`}><th scope="row">{row.year}</th><td>{row.week}</td><td>{row.excluded_year}</td><td>{row.tier1}</td><td>{row.tier2}</td></tr>)}</tbody>
    </table></div>
  </figure>;
});
