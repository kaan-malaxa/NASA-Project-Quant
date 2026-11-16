import { Link } from "react-router-dom";
import { FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import LoadingFrame from "@/components/LoadingFrame.jsx";
import { PageLoading } from "@/components/LoadingFrame.jsx";
import SectionState from "@/components/SectionState.jsx";
import { VizSlot } from "@/components/Viz.jsx";
import { useRegions } from "@/data/useRegions.js";
import { useRegionData } from "@/data/useRegionData.js";
import { useUrlState } from "@/data/useUrlState.js";
import { useJson } from "@/data/useJson.js";
import { useDocumentMeta } from "@/lib/useDocumentMeta.js";
import { fmt3 } from "@/lib/format3.js";
import VerdictSection from "./region/VerdictSection.jsx";
import CalendarSection from "./region/CalendarSection.jsx";
import { quantityLabel, trueTrend, truthCheck } from "./simulation/plantedTruth.js";

const INTRO =
  "Synthland is a made-up place. We built its fire record ourselves, with a known answer, then ran it through the same pipeline as the real data. If the method works, the harmonized result should match the truth we put in.";

/** The label on every part of this page: it must never be mistaken for real data. */
function SimulatedBadge() {
  return (
    <Badge variant="outline" className="border-warning text-foreground gap-1.5" data-testid="simulated-badge">
      <FlaskConical aria-hidden="true" className="size-3.5" />
      Simulated data
    </Badge>
  );
}

/** #/simulation · the planted-truth test, told from the simulated region's own files and methods.json. */
export default function Simulation() {
  useDocumentMeta(
    "Simulation test",
    "A made-up region with a known answer, run through the same pipeline as the real data, to show the method works.",
  );
  const { state: regionsState } = useRegions();
  // The simulated region: the first region marked synthetic in regions.json (not typed by name).
  const sim =
    regionsState.status === "ok" ? regionsState.data.regions.find((r) => r.synthetic === true) : null;
  const { status, region, files } = useRegionData(sim?.id, { includeSynthetic: true });
  const methods = useJson("methods.json");
  const [url, setUrl] = useUrlState(region?.last_data_day ?? null);
  const planted = methods.status === "ok" ? methods.data.planted_truth || [] : [];
  const truth = trueTrend(planted);
  const trend = files?.trend?.status === "ok" ? files.trend.data : null;
  const check = truthCheck(truth, trend?.harmonized ?? null);

  return (
    <article aria-labelledby="sim-title" className="space-y-8">
      <header className="space-y-3">
        <SimulatedBadge />
        <h1 id="sim-title" className="text-3xl font-semibold tracking-tight">
          Simulation test
        </h1>
        <p className="max-w-3xl text-lg text-pretty">{INTRO}</p>
      </header>

      {regionsState.status !== "ok" ? (
        regionsState.status === "loading" ? <PageLoading kind="region" heading="simulation" includeHeader={false} /> : <SectionState state={regionsState} title="Places" />
      ) : !sim ? (
        <p className="text-muted-foreground">There is no simulated region in this build of the data.</p>
      ) : status !== "ok" ? (
        <SectionState state={regionsState} title="Simulated region" variant="verdict" />
      ) : (
        <>
          {/* b. The broken ruler: naive splice against harmonized, for the simulated region */}
          <section aria-labelledby="sim-ruler-title" className="space-y-3">
            <SimulatedBadge />
            <h2 id="sim-ruler-title" className="text-xl font-semibold tracking-tight">
              The sensor jump, and its correction
            </h2>
            <SectionState state={files.ruler} title="The broken ruler" skeletonClassName="h-64">
              {(data) => (
                <figure className="space-y-3">
                  <VizSlot name="BrokenRuler" ruler={data} placeholderClassName="h-64" />
                  <figcaption className="max-w-3xl text-pretty">{data.sentence}</figcaption>
                </figure>
              )}
            </SectionState>
          </section>

          {/* c. The verdict next to the planted truth */}
          <section className="space-y-3" aria-label="The verdict, compared with the planted truth">
            <SimulatedBadge />
            <VerdictSection state={files.trend} />
            <div className="bg-card space-y-3 rounded-xl border p-5" data-testid="truth-check">
              <h2 className="text-lg font-semibold">The answer we planted</h2>
              {methods.status === "loading" ? <LoadingFrame title="planted-truth checks" variant="table" /> : check ? (
                <p className={`text-pretty ${check.inside ? "" : "text-warning"}`}>{check.sentence}</p>
              ) : (
                <p className="text-muted-foreground text-sm">
                  The data files hold no planted true trend for this region, so the result is shown without a
                  comparison.
                </p>
              )}
              {planted.length ? <PlantedTable rows={planted} /> : null}
            </div>
          </section>

          {/* d. The fire calendar, with the lens toggle (naive splice / harmonized / ...) */}
          <section className="space-y-3" aria-label="The fire calendar of the simulated region">
            <SimulatedBadge />
            <CalendarSection
              files={files}
              url={url}
              setUrl={setUrl}
              lastDataDay={region.last_data_day}
              chartRef={null}
            />
          </section>

          {/* e. Links */}
          <nav aria-label="More about the simulation" className="flex flex-wrap gap-4 text-sm font-medium">
            {/* The region page shows simulated regions only with ?debug=1. */}
            <Link
              to={{ pathname: `/r/${region.id}`, search: "?debug=1" }}
              className="underline underline-offset-4"
            >
              See the full {region.name.replace(/\s*\(.*\)$/, "")} region page
            </Link>
            <Link to="/methods" className="underline underline-offset-4">
              How the test works
            </Link>
          </nav>
        </>
      )}
    </article>
  );
}

/** Every planted check: the truth, what the pipeline recovered, the tolerance and the result, all from methods.json. */
function PlantedTable({ rows }) {
  const passed = rows.filter((r) => r.pass).length;
  return (
    <div className="space-y-2">
      <p className="text-sm">
        The pipeline recovered {passed} of {rows.length} planted answers within their tolerance.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="text-muted-foreground text-left">
            <tr>
              <th className="py-1 pr-3 font-medium">Planted quantity</th>
              <th className="py-1 pr-3 font-medium">Truth</th>
              <th className="py-1 pr-3 font-medium">Recovered</th>
              <th className="py-1 pr-3 font-medium">Tolerance</th>
              <th className="py-1 font-medium">Result</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((r) => (
              <tr key={r.quantity} className="border-t">
                <td className="py-1.5 pr-3">{quantityLabel(r.quantity)}</td>
                <td className="py-1.5 pr-3">{fmt3(r.truth)}</td>
                <td className="py-1.5 pr-3">{fmt3(r.recovered)}</td>
                <td className="py-1.5 pr-3">±{fmt3(r.tolerance)}</td>
                <td className="py-1.5">{r.pass ? "Passed" : "Failed"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
