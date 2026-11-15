import SectionState from "@/components/SectionState.jsx";
import KindBadge from "@/components/KindBadge.jsx";
import GlossaryTerm from "@/components/GlossaryTerm.jsx";
import { VizSlot } from "@/components/Viz.jsx";
import { fmtRangePct, fmtSignedPct } from "@/lib/format.js";
import { DIRECTION_LABELS, variantLabel } from "@/lib/labels.js";
import StorySection from "./StorySection.jsx";

/** Kinds present in the harmonized annual series (observed years, translated years, ...), in a stable order. */
function harmonizedKinds(trend) {
  const order = ["observed", "harmonized", "estimated", "missing", "sample"];
  const seen = new Set((trend.annual || []).map((a) => a.kind));
  return order.filter((k) => seen.has(k));
}

function TrendFigure({ label, fig, kinds }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {fmtSignedPct(fig.pct_per_decade)} <span className="text-base font-normal">per decade</span>
      </p>
      <p className="text-sm tabular-nums">
        <GlossaryTerm term="range">Likely range</GlossaryTerm>: {fmtRangePct(fig.lo, fig.hi)}
      </p>
      <p className="mt-1 text-sm">{fig.pct_per_decade === null ? `Unavailable: ${fig.reason ?? "insufficient observations"}` : DIRECTION_LABELS[fig.direction] ?? fig.direction}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {kinds.map((k) => (
          <KindBadge key={k} kind={k} />
        ))}
      </div>
    </div>
  );
}

/** Screen 3 · Verdict, from trend.json. */
export default function VerdictSection({ state }) {
  return (
    <StorySection id="verdict" title="The verdict">
      <SectionState state={state} title="Verdict" skeletonClassName="h-56">
        {(trend) => {
          const hKinds = harmonizedKinds(trend);
          // The raw (naive) record is counted as recorded; it carries "sample" only when the file is sample data.
          const nKinds = hKinds.includes("sample") ? ["sample"] : ["observed"];
          return (
            <div className="space-y-4">
              <p className="max-w-3xl text-lg font-medium text-pretty sm:text-xl">{trend.sentence}</p>
            {trend.qualification ? <p className="text-sm">{trend.qualification}</p> : null}
              <VizSlot name="TrendBars" trend={trend} placeholderClassName="h-56" />
              <div className="grid gap-3 sm:grid-cols-2">
                <TrendFigure label="What the raw record suggests" fig={trend.naive} kinds={nKinds} />
                <TrendFigure label="After harmonization" fig={trend.harmonized} kinds={hKinds} />
              </div>
              {trend.robustness?.length ? (
                <details className="rounded-lg border p-4">
                  <summary className="cursor-pointer font-medium">How sure are we?</summary>
                  <p className="text-muted-foreground mt-2 text-sm">
                    The same trend calculated in other reasonable ways. If they disagree in direction, the verdict says so.
                  </p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left">
                          <th className="py-1 pr-4 font-medium">Variant</th>
                          <th className="py-1 pr-4 font-medium">Per decade</th>
                          <th className="py-1 pr-4 font-medium">Likely range</th>
                          <th className="py-1 font-medium">Direction</th>
                        </tr>
                      </thead>
                      <tbody className="tabular-nums">
                        {trend.robustness.map((r) => (
                          <tr key={r.variant} className="border-t">
                            <td className="py-1 pr-4">{variantLabel(r.variant)}</td>
                            <td className="py-1 pr-4">{fmtSignedPct(r.pct_per_decade)}</td>
                            <td className="py-1 pr-4">{fmtRangePct(r.lo, r.hi)}</td>
                            <td className="py-1">{DIRECTION_LABELS[r.direction] ?? r.direction}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ) : null}
            </div>
          );
        }}
      </SectionState>
    </StorySection>
  );
}
