import { CheckCircle2, CircleAlert, XCircle } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import SectionState from "@/components/SectionState.jsx";
import KindBadge from "@/components/KindBadge.jsx";
import GlossaryTerm from "@/components/GlossaryTerm.jsx";
import { VizSlot } from "@/components/Viz.jsx";
import { useJson } from "@/data/useJson.js";
import { useRegions } from "@/data/useRegions.js";
import { useFileExists } from "@/data/useFileExists.js";
import { dataUrl } from "@/data/fetchJson.js";
import { regionFilePath } from "@/data/files.js";
import { fmt3, fmtInt } from "@/lib/format3.js";
import { monthName } from "@/lib/format.js";
import {
  EYESIGHT_STATUS_LABELS, METHOD_LABELS, TEST_INFO, baselineLabel, sensorLabel, testLabel,
} from "@/lib/labels.js";
import { compareToBaselines, groupByRegion } from "@/lib/validation.js";
import { FIRMS_URL } from "@/app/AppShell.jsx";
import { DataTable, MethodsSection, RegionHeading } from "./methods/parts.jsx";
import { useDocumentMeta } from "@/lib/useDocumentMeta.js";
import SectionNav from "./region/SectionNav.jsx";

const has = (a) => Array.isArray(a) && a.length > 0;

/** Contents of the page, in order. Sections whose data is absent are not rendered and drop out of the list. */
const METHODS_SECTIONS = [
  { id: "steps", label: "Five steps" },
  { id: "drift", label: "The bending ruler" },
  { id: "validation", label: "Does it work?" },
  { id: "planted-truth", label: "Planted-truth test" },
  { id: "eyesight", label: "Satellite eyesight" },
  { id: "data", label: "Data" },
  { id: "limitations", label: "Limitations" },
  { id: "ai-use", label: "How we used AI" },
  { id: "attribution", label: "Credits" },
];

/** #/methods — screen 9, from methods.json, manifest.json and each region's calibration.json. */
export default function Methods() {
  useDocumentMeta("Methods and honesty", "How Prometheus Torch harmonizes MODIS and VIIRS hotspot records, how it was tested, and its limits.");
  const methods = useJson("methods.json");
  const manifest = useJson("manifest.json");
  const { state: regionsState, regions } = useRegions();
  const [params, setParams] = useSearchParams();
  const selectedRegion = regions.find((region) => region.id === params.get("region")) || regions[0];
  const visibleRegions = regions.length > 1 && selectedRegion ? [selectedRegion] : regions;
  const original = methods.status === "ok" && regionsState.status === "ok" ? methods.data : null;
  const m = original && regions.length > 1 ? {
    ...original,
    ...Object.fromEntries(["drift", "validation", "eyesight", "inputs", "filters"].map((key) =>
      [key, (original[key] || []).filter((row) => row.region === selectedRegion?.id)])),
  } : original;

  // Region names for every id that appears (synthetic regions included: planted-truth and drift rows may use them).
  const allRegions = regionsState.status === "ok" ? regionsState.data.regions : [];
  const nameOf = (id) => allRegions.find((r) => r.id === id)?.name ?? id;

  return (
    <article aria-labelledby="methods-title" className="space-y-8">
      <header className="space-y-2">
        <h1 id="methods-title" className="text-3xl font-semibold tracking-tight">
          Methods and honesty
        </h1>
        <p className="max-w-3xl text-pretty">
          How the record was built, how we tested it, and where it can be wrong. Every number on this page comes from the
          pipeline&apos;s output files, including the ones that do not flatter us.
        </p>
      </header>
      {regions.length > 1 ? (
        <label className="block max-w-md space-y-2 text-sm font-medium">
          <span>Methods for a place</span>
          <select value={selectedRegion?.id || ""} className="bg-background w-full rounded-md border px-3 py-2"
            onChange={(event) => { const next = new URLSearchParams(params); next.set("region", event.target.value); setParams(next); }}>
            {regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
          </select>
        </label>
      ) : null}

      {m ? null : <SectionState state={methods} title="Methods data" />}

      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        {/* Contents: a sticky list beside the sections on wide screens, a scrolling row of chips above them on phones. */}
        <aside className="bg-background/95 sticky top-[var(--sticky-offset,0px)] z-30 -mx-4 mb-6 border-b px-4 backdrop-blur lg:top-[calc(var(--sticky-offset,0px)+1rem)] lg:mx-0 lg:mb-0 lg:self-start lg:border-b-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
          <p className="text-muted-foreground hidden px-3 pb-2 text-xs font-medium tracking-wide uppercase lg:block">
            On this page
          </p>
          <div className="lg:hidden">
            <SectionNav sections={METHODS_SECTIONS} label="Methods sections" watch={m} />
          </div>
          <div className="hidden lg:block">
            <SectionNav sections={METHODS_SECTIONS} orientation="vertical" label="Methods contents" watch={m} />
          </div>
        </aside>

        <div className="min-w-0 space-y-6">
          {m?.decisions ? <FiveSteps d={m.decisions} /> : null}
          {m && (has(m.drift) || visibleRegions.some((r) => r.files?.includes("calibration"))) ? (
            <Drift drift={m.drift || []} regions={visibleRegions} nameOf={nameOf} trustedThrough={m.decisions?.aqua_trusted_through} />
          ) : null}
          {has(m?.validation) ? <Validation rows={m.validation} nameOf={nameOf} /> : null}
          {has(m?.planted_truth) ? <PlantedTruth rows={m.planted_truth} manifest={manifest} /> : null}
          {has(m?.eyesight) ? <Eyesight entries={m.eyesight} nameOf={nameOf} /> : null}
          {m && (has(m.inputs) || has(m.filters) || has(m.sources)) ? <Data m={m} nameOf={nameOf} manifest={manifest} /> : null}
          <Closing m={m} />
        </div>
      </div>
    </article>
  );
}

function FiveSteps({ d }) {
  const [y0, y1] = d.baseline_years || [];
  return (
    <MethodsSection
      id="steps"
      title="What we did, in five steps"
      intro="Two generations of satellites see fire differently. We put both records on one scale before comparing years."
    >
      <ol className="max-w-3xl list-decimal space-y-2 pl-6">
        <li>
          Collected the <GlossaryTerm term="modis">MODIS</GlossaryTerm> and <GlossaryTerm term="viirs">VIIRS</GlossaryTerm>{" "}
          <GlossaryTerm term="hotspot">hotspot</GlossaryTerm> records from <GlossaryTerm term="firms">NASA FIRMS</GlossaryTerm>{" "}
          and removed low-confidence and non-fire detections (the filters are listed under Data, below).
        </li>
        <li>
          Counted burning as <GlossaryTerm term="fire_cell_day">fire cell-days</GlossaryTerm>: one map hexagon (H3
          resolution {d.count_resolution}) on one day with at least one hotspot. This stops the sharper satellite from
          counting one fire many times.
        </li>
        <li>
          Chose one reference scale, {d.reference}, and trusted it as recorded through {d.aqua_trusted_through}.
        </li>
        <li>
          Translated VIIRS counts onto that scale with factors fitted on years when both satellites flew; VIIRS on Suomi
          NPP is used through {d.snpp_through}, then the next VIIRS satellite. Values translated this way are labelled{" "}
          <KindBadge kind="harmonized" />.
        </li>
        <li>
          Compared each week, month and year with the same period in the baseline years
          {y0 ? ` ${y0}–${y1}` : ""}, and published every validation test below, good or bad.
        </li>
      </ol>
    </MethodsSection>
  );
}

function Drift({ drift, regions, nameOf, trustedThrough }) {
  const ids = [...new Set([...regions.filter((r) => r.files?.includes("calibration")).map((r) => r.id), ...drift.map((x) => x.region)])];
  return (
    <MethodsSection
      id="drift"
      title="The ruler was bending"
      intro="We fitted the VIIRS-to-Aqua factor separately for every year. If MODIS Aqua stayed steady, the factor should stay flat; where it departs, we stop trusting Aqua and switch the reference to translated VIIRS. The eras table shows which satellite supplies each period."
    >
      {ids.map((id) => (
        <div key={id} className="space-y-3">
          <RegionHeading name={nameOf(id)} />
          {drift.some((x) => x.region === id) ? (
            <VizSlot name="DriftChart" drift={drift} region={id} trustedThrough={trustedThrough} placeholderClassName="h-56" />
          ) : null}
          {regions.find((r) => r.id === id)?.files?.includes("calibration") ? <ErasTable regionId={id} /> : null}
        </div>
      ))}
    </MethodsSection>
  );
}

function ErasTable({ regionId }) {
  const cal = useJson(regionFilePath(regionId, "calibration"));
  return (
    <SectionState state={cal} title="Eras" hideWhenAbsent skeletonClassName="h-24">
      {(c) =>
        has(c.eras) ? (
          <DataTable
            caption="Which satellite supplies each period of the harmonized record"
            rowKey={(e) => e.from}
            columns={[
              { key: "from", label: "From" },
              { key: "to", label: "To", render: (e) => e.to ?? "today" },
              { key: "source", label: "Satellite", render: (e) => sensorLabel(e.source) },
              { key: "kind", label: "Kind", render: (e) => <KindBadge kind={e.kind} /> },
            ]}
            rows={c.eras}
          />
        ) : null
      }
    </SectionState>
  );
}

function Comparison({ row }) {
  const c = compareToBaselines(row);
  if (!c) return null;
  const word = c.abs ? "closer to zero" : "lower";
  return c.lowest ? (
    <span className="inline-flex items-start gap-1">
      <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      Ours is {word} than every baseline
    </span>
  ) : (
    <span className="inline-flex items-start gap-1">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      Ours is not {word} than: {c.loses.map(baselineLabel).join(", ")}
    </span>
  );
}

function Validation({ rows, nameOf }) {
  const groups = groupByRegion(rows);
  return (
    <MethodsSection
      id="validation"
      title="Does the translation work?"
      intro="We hid one year at a time, predicted it from the other satellite, and measured the error. Each test is compared with simpler methods (the baselines). For error measures, lower is better."
    >
      {[...groups.entries()].map(([region, list]) => (
        <div key={region} className="space-y-2">
          <RegionHeading name={nameOf(region)} />
          <div className="overflow-x-auto">
            <DataTable
              rowKey={(r) => `${r.test}-${r.method}`}
              columns={[
                {
                  key: "test",
                  label: "Test",
                  render: (r) => (
                    <>
                      {testLabel(r.test)}
                      {TEST_INFO[r.test]?.note ? <p className="text-muted-foreground mt-1 text-xs">{TEST_INFO[r.test].note}</p> : null}
                    </>
                  ),
                },
                { key: "method", label: "Method", render: (r) => METHOD_LABELS[r.method] ?? r.method },
                { key: "value", label: "Ours", align: "right", render: (r) => fmt3(r.value) },
                {
                  key: "baselines",
                  label: "Baselines",
                  render: (r) =>
                    r.baselines && Object.keys(r.baselines).length ? (
                      <ul>
                        {Object.entries(r.baselines).map(([k, v]) => (
                          <li key={k}>
                            {baselineLabel(k)}: <span className="tabular-nums">{fmt3(v)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      "—"
                    ),
                },
                { key: "compare", label: "Which is lower", render: (r) => <Comparison row={r} /> },
                { key: "n", label: "n", align: "right", render: (r) => fmtInt(r.n) },
                { key: "years", label: "Years", render: (r) => (r.years?.length === 2 ? `${r.years[0]}–${r.years[1]}` : "—") },
                { key: "note", label: "Note", render: (r) => r.note || "—" },
              ]}
              rows={list}
            />
          </div>
        </div>
      ))}
    </MethodsSection>
  );
}

function PassFail({ pass }) {
  return pass ? (
    <span className="inline-flex items-center gap-1 font-medium">
      <CheckCircle2 aria-hidden="true" className="size-4" /> Pass
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 font-medium">
      <XCircle aria-hidden="true" className="size-4" /> Fail
    </span>
  );
}

function PlantedTruth({ rows, manifest }) {
  const audit = useFileExists("numbers_audit.md", manifest);
  return (
    <MethodsSection
      id="planted-truth"
      title="Tested on a world where we know the answer"
      intro="We simulated a region with known fires and known satellite behaviour, ran the whole pipeline on it, and checked whether it recovered what we planted. A quantity passes when the recovered value is within the stated tolerance."
    >
      <div className="overflow-x-auto">
        <DataTable
          rowKey={(r) => r.quantity}
          columns={[
            { key: "quantity", label: "Quantity", render: (r) => <code className="text-xs">{r.quantity}</code> },
            { key: "truth", label: "Planted", align: "right", render: (r) => fmt3(r.truth) },
            { key: "recovered", label: "Recovered", align: "right", render: (r) => fmt3(r.recovered) },
            { key: "tolerance", label: "Tolerance", align: "right", render: (r) => `± ${fmt3(r.tolerance)}` },
            { key: "pass", label: "Result", render: (r) => <PassFail pass={r.pass} /> },
          ]}
          rows={rows}
        />
      </div>
      {audit === "yes" ? (
        <p className="text-sm">
          Every headline number and the file it comes from:{" "}
          <a href={dataUrl("numbers_audit.md")} className="underline underline-offset-4">
            numbers audit
          </a>
          .
        </p>
      ) : null}
    </MethodsSection>
  );
}

function Eyesight({ entries, nameOf }) {
  return (
    <MethodsSection
      id="eyesight"
      title="How well did the old satellite see?"
      intro="For each patch of burning that VIIRS saw, we asked whether MODIS Aqua saw it too, and how that chance grows with fire strength. This second, independent route to the translation factor is compared with the first below."
    >
      {entries.map((e) => (
        <div key={e.region} className="space-y-3">
          <RegionHeading name={nameOf(e.region)} />
          <p className="text-sm">
            <GlossaryTerm term="eyesight_curve">Eyesight curve</GlossaryTerm> status:{" "}
            <span className="font-medium" data-eyesight-status={e.status}>
              {EYESIGHT_STATUS_LABELS[e.status] ?? e.status}
            </span>
          </p>
          {e.status !== "absent" ? (
            <>
              <VizSlot name="EyesightCurve" eyesight={e} placeholderClassName="h-56" />
              <VizSlot name="HeldoutAgreement" comparison={e.heldout_compare ?? []} placeholderClassName="h-56" />
              {has(e.k_compare) ? (
                <DataTable
                  caption="Fitted monthly factors (calibration diagnostic; held-out evidence is shown above)"
                  rowKey={(r) => r.month}
                  columns={[
                    { key: "month", label: "Month", render: (r) => monthName(r.month) },
                    { key: "k_tier1", label: "Tier 1 (counts)", align: "right", render: (r) => fmt3(r.k_tier1) },
                    { key: "k_tier2", label: "Tier 2 (eyesight curve)", align: "right", render: (r) => fmt3(r.k_tier2) },
                  ]}
                  rows={e.k_compare}
                />
              ) : null}
            </>
          ) : null}
        </div>
      ))}
    </MethodsSection>
  );
}

function Data({ m, nameOf, manifest }) {
  return (
    <MethodsSection
      id="data"
      title="Data"
      intro="What went in, what we removed and why, and where each date or claim on this site comes from."
    >
      {has(m.inputs) ? (
        <div className="space-y-2">
          <h3 className="font-semibold">Inputs</h3>
          <div className="overflow-x-auto">
            <DataTable
              rowKey={(r, i) => `${r.source}-${r.region}-${i}`}
              columns={[
                { key: "source", label: "Source", render: (r) => <code className="text-xs">{r.source}</code> },
                { key: "region", label: "Place", render: (r) => nameOf(r.region) },
                { key: "rows", label: "Rows", align: "right", render: (r) => fmtInt(r.rows) },
                { key: "dates", label: "Dates", render: (r) => (r.first_date ? `${r.first_date} to ${r.last_date}` : "—") },
                { key: "via", label: "How obtained", render: (r) => [r.via, r.downloaded ? `on ${r.downloaded}` : null].filter(Boolean).join(", ") || "—" },
              ]}
              rows={m.inputs}
            />
          </div>
        </div>
      ) : null}
      {has(m.filters) ? (
        <div className="space-y-2">
          <h3 className="font-semibold">Filters</h3>
          <div className="overflow-x-auto">
            <DataTable
              rowKey={(r, i) => `${r.region}-${r.sensor}-${r.step}-${i}`}
              columns={[
                { key: "region", label: "Place", render: (r) => nameOf(r.region) },
                { key: "sensor", label: "Satellite", render: (r) => sensorLabel(r.sensor) },
                { key: "step", label: "Step" },
                { key: "rows_in", label: "Rows in", align: "right", render: (r) => fmtInt(r.rows_in) },
                { key: "rows_dropped", label: "Rows removed", align: "right", render: (r) => fmtInt(r.rows_dropped) },
              ]}
              rows={m.filters}
            />
          </div>
        </div>
      ) : null}
      {has(m.sources) ? (
        <div className="space-y-2">
          <h3 className="font-semibold">Sources for dates and claims</h3>
          <ul className="max-w-3xl list-disc space-y-1 pl-6 text-sm">
            {m.sources.map((s) => (
              <li key={s.claim_id}>
                {s.text}{" "}
                <a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                  Source
                </a>{" "}
                <span className="text-muted-foreground">(checked {s.checked})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {manifest.status === "ok" ? (
        <p className="text-muted-foreground text-sm">
          This build: data generated {manifest.data.generated_at}, code version {manifest.data.code_version},{" "}
          {fmtInt(manifest.data.files?.length ?? 0)} files.
          {m.decisions?.science_yaml_sha256 ? ` Scientific settings fingerprint ${m.decisions.science_yaml_sha256.slice(0, 12)}.` : ""}
        </p>
      ) : null}
    </MethodsSection>
  );
}

function Closing({ m }) {
  return (
    <>
      {has(m?.limitations) ? (
        <MethodsSection id="limitations" title="Limitations" intro="What this record cannot tell you.">
          <ul className="max-w-3xl list-disc space-y-1 pl-6">
            {m.limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </MethodsSection>
      ) : null}
      {m?.ai_use ? (
        <MethodsSection id="ai-use" title="How we used AI">
          <p className="max-w-3xl text-pretty whitespace-pre-line">{m.ai_use}</p>
        </MethodsSection>
      ) : null}
      <MethodsSection id="attribution" title="Credits">
        <ul className="max-w-3xl space-y-1 text-sm">
          <li>
            Fire data:{" "}
            <a href={FIRMS_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              NASA FIRMS
            </a>{" "}
            (Fire Information for Resource Management System).
          </li>
          <li>Boundaries: Natural Earth.</li>
          <li>Base map: © OpenStreetMap contributors, tiles by OpenFreeMap.</li>
        </ul>
        <p className="text-sm font-medium">Not affiliated with or endorsed by NASA.</p>
      </MethodsSection>
    </>
  );
}
