import { useEffect, useId, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CircleCheck, CircleHelp, CircleSlash, Minus, TriangleAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import SectionState from "@/components/SectionState.jsx";
import KindBadge from "@/components/KindBadge.jsx";
import GlossaryTerm from "@/components/GlossaryTerm.jsx";
import { useSpatialShards } from "@/data/useSpatialShards.js";
import { spatialAreaSeries } from "@/lib/spatial.js";
import { checkClaim, configFromDoc, seriesFromArea, seriesFromDoc, signedPct, windowText } from "@/lib/claimCheck.js";
import StorySection from "./StorySection.jsx";

/** Verdict code -> short label and icon (the label always carries the meaning; colour never does alone). */
const VERDICT_LOOK = {
  holds_up: { label: "Holds up", Icon: CircleCheck, tone: "text-primary" },
  weaker_than_claimed: { label: "Overstated", Icon: ArrowDown, tone: "text-warning" },
  stronger_than_claimed: { label: "Understated", Icon: ArrowUp, tone: "text-warning" },
  contradicted: { label: "Contradicted", Icon: XCircle, tone: "text-destructive" },
  sensor_artifact: { label: "Sensor artifact", Icon: TriangleAlert, tone: "text-warning" },
  no_clear_change: { label: "No clear change", Icon: Minus, tone: "text-muted-foreground" },
  cant_tell_missing: { label: "Can't tell", Icon: CircleHelp, tone: "text-muted-foreground" },
};

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function errorText(error, config) {
  const [y0, y1] = config.record_years;
  if (error === "claimed_pct_range") return `Enter a percentage above 0 and no more than ${config.max_claim_pct}%.`;
  if (error === "years_range") return `Pick years from ${y0} to ${y1}.`;
  if (error === "years_order") return "The first year must be before the second.";
  return "Pick “increased” or “decreased”.";
}

/** "Increased by 172% between 2004 and 2024": the chip text, built only from the example's own fields. */
function claimText(c) {
  return `${c.direction === "increased" ? "Increased" : "Decreased"} by ${c.claimed_pct}% between ${c.from_year} and ${c.to_year}`;
}

const urlClaim = (url) =>
  url.claim_dir && url.claim_pct !== null && url.claim_from !== null && url.claim_to !== null
    ? { place: url.claim_place, direction: url.claim_dir, claimed_pct: url.claim_pct, from_year: url.claim_from, to_year: url.claim_to }
    : null;

/** Region page section after the Verdict: a claim written as a sentence of controls, checked against both records. */
export default function ClaimCheckerSection({ region, state, files, url, setUrl, lastDataDay }) {
  return (
    <StorySection
      id="claim-checker"
      title="Check a claim"
      intro="Heard that fires have doubled? Write the claim below. It is checked against the raw record and the corrected record with fixed rules and fixed sentences. No AI or chatbot is involved."
    >
      <SectionState state={state} title="Claim Checker" skeletonClassName="h-64">
        {(doc) => <ClaimChecker region={region} doc={doc} files={files} url={url} setUrl={setUrl} lastDataDay={lastDataDay} />}
      </SectionState>
    </StorySection>
  );
}

function ClaimChecker({ region, doc, files, url, setUrl, lastDataDay }) {
  const ids = useId();
  const config = useMemo(() => configFromDoc(doc), [doc]);
  const [r0, r1] = config.record_years;
  const years = useMemo(() => Array.from({ length: r1 - r0 + 1 }, (_, i) => r0 + i), [r0, r1]);
  const claim = urlClaim(url);
  const hasArea = url.aoi.length > 0;
  const first = doc.examples?.[0]?.claim;
  const [draft, setDraft] = useState(() => ({
    place: url.claim_place,
    direction: url.claim_dir ?? "increased",
    pct: url.claim_pct !== null ? String(url.claim_pct) : "",
    from: url.claim_from ?? first?.from_year ?? r0,
    to: url.claim_to ?? first?.to_year ?? r1,
  }));
  // A shared link or an example chip changes the URL: the form shows that claim.
  useEffect(() => {
    if (!claim) return;
    setDraft({ place: claim.place, direction: claim.direction, pct: String(claim.claimed_pct), from: claim.from_year, to: claim.to_year });
  }, [claim?.place, claim?.direction, claim?.claimed_pct, claim?.from_year, claim?.to_year]);

  // Drawn area: the same authoritative area series as the "Your area" panel (lib/spatial.js), both lenses.
  const areaWanted = claim?.place === "aoi" && hasArea;
  const index = files.spatial_index;
  const indexYears = index?.status === "ok" && index.data.years.length ? [index.data.years[0].year, index.data.years.at(-1).year] : [];
  const shards = useSpatialShards(region.id, index, indexYears, areaWanted);
  const series = useMemo(() => {
    if (!claim) return null;
    if (claim.place !== "aoi") return { status: "ok", data: seriesFromDoc(doc, region.name) };
    if (!hasArea) return { status: "no_area" };
    if (shards.status !== "ok") return shards;
    const h = spatialAreaSeries({ shards: shards.data, cells: url.aoi, lens: "harmonized" });
    const n = spatialAreaSeries({ shards: shards.data, cells: url.aoi, lens: "naive_splice" });
    return { status: "ok", data: seriesFromArea(h, n, config) };
  }, [claim?.place, doc, region.name, hasArea, shards, url.aoi, config]);

  const result = useMemo(
    () => (claim && series?.status === "ok" ? checkClaim(claim, series.data, config) : null),
    [claim?.place, claim?.direction, claim?.claimed_pct, claim?.from_year, claim?.to_year, series, config],
  );

  const [draftError, setDraftError] = useState(null);
  const submit = (e) => {
    e.preventDefault();
    const pct = Number(draft.pct);
    setUrl({
      claim_place: draft.place,
      claim_dir: draft.direction,
      claim_pct: draft.pct.trim() === "" || !Number.isFinite(pct) ? null : pct,
      claim_from: Number(draft.from),
      claim_to: Number(draft.to),
    });
    if (draft.pct.trim() === "" || !Number.isFinite(pct)) setDraftError(errorText("claimed_pct_range", config));
    else setDraftError(null);
  };
  const pick = (c) => {
    setDraftError(null);
    setUrl({ claim_place: "region", claim_dir: c.direction, claim_pct: c.claimed_pct, claim_from: c.from_year, claim_to: c.to_year });
  };
  const showOnChart = (lens) => {
    if (!result?.windows) return;
    const to = `${result.windows.end[1]}-12-31`;
    setUrl({ lens, view: "months", from: `${result.windows.start[0]}-01-01`, to: lastDataDay && to > lastDataDay ? lastDataDay : to });
    document.getElementById("calendar")?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  };

  const control = "border-input bg-background h-9 max-w-full rounded-md border px-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2";
  return (
    <div className="space-y-5">
      <form onSubmit={submit} aria-labelledby={`${ids}-legend`} className="space-y-3" noValidate>
        <p id={`${ids}-legend`} className="sr-only">
          Write a claim about satellite-detected burning
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-2 text-lg leading-relaxed">
          <span>Fires in</span>
          <label htmlFor={`${ids}-place`} className="sr-only">Place</label>
          <select id={`${ids}-place`} className={control} value={draft.place} onChange={(e) => setDraft({ ...draft, place: e.target.value })}>
            <option value="region">{region.name}</option>
            <option value="aoi" disabled={!hasArea}>
              {hasArea ? "my drawn area" : "my drawn area (draw one first)"}
            </option>
          </select>
          <span>have</span>
          <label htmlFor={`${ids}-dir`} className="sr-only">Direction</label>
          <select id={`${ids}-dir`} className={control} value={draft.direction} onChange={(e) => setDraft({ ...draft, direction: e.target.value })}>
            <option value="increased">increased</option>
            <option value="decreased">decreased</option>
          </select>
          <span>by</span>
          <label htmlFor={`${ids}-pct`} className="sr-only">Percent change claimed</label>
          <input
            id={`${ids}-pct`}
            className={`${control} w-24 tabular-nums`}
            type="number"
            inputMode="decimal"
            min="0"
            max={config.max_claim_pct}
            step="any"
            placeholder="100"
            value={draft.pct}
            aria-describedby={draftError || result?.error ? `${ids}-error` : undefined}
            aria-invalid={draftError || result?.error === "claimed_pct_range" ? true : undefined}
            onChange={(e) => setDraft({ ...draft, pct: e.target.value })}
          />
          <span>% between</span>
          <label htmlFor={`${ids}-from`} className="sr-only">First year</label>
          <select id={`${ids}-from`} className={`${control} tabular-nums`} value={draft.from} onChange={(e) => setDraft({ ...draft, from: Number(e.target.value) })}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <span>and</span>
          <label htmlFor={`${ids}-to`} className="sr-only">Second year</label>
          <select id={`${ids}-to`} className={`${control} tabular-nums`} value={draft.to} onChange={(e) => setDraft({ ...draft, to: Number(e.target.value) })}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <span>.</span>
        </p>
        <Button type="submit">Check this claim</Button>
      </form>

      {doc.examples?.length ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm" id={`${ids}-examples`}>
            Or try a claim built from this record (each one is the change one of the two records actually shows):
          </p>
          <ul aria-labelledby={`${ids}-examples`} className="flex flex-wrap gap-2">
            {doc.examples.map((ex) => (
              <li key={claimText(ex.claim)}>
                <Button type="button" variant="outline" size="sm" className="h-auto max-w-full py-1.5 text-left whitespace-normal" onClick={() => pick(ex.claim)}>
                  {claimText(ex.claim)}
                  <span className="text-muted-foreground font-normal">
                    ({ex.source_lens === "naive" ? "raw record" : "corrected record"})
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div aria-live="polite" aria-atomic="true" data-testid="claim-result-live">
        {draftError ? (
          <p id={`${ids}-error`} className="text-destructive text-sm" role="alert">{draftError}</p>
        ) : result && !result.ok ? (
          <p id={`${ids}-error`} className="text-destructive text-sm" role="alert">{errorText(result.error, config)}</p>
        ) : claim?.place === "aoi" && series?.status === "no_area" ? (
          <p className="text-sm">Draw an area on the map in “Where” first, then check the claim for it.</p>
        ) : claim && series && series.status !== "ok" && series.status !== "no_area" ? (
          <p className="text-sm">{series.status === "loading" ? "Loading your area’s history…" : "Your area’s history is not available."}</p>
        ) : result?.ok ? (
          <VerdictHeadline result={result} />
        ) : null}
      </div>
      {result?.ok && !draftError ? <ResultDetails result={result} onChart={showOnChart} /> : null}
    </div>
  );
}

function VerdictHeadline({ result }) {
  const look = VERDICT_LOOK[result.verdict];
  return (
    <div className="space-y-2" data-testid="claim-verdict" data-verdict={result.verdict}>
      <p className={`flex items-center gap-2 text-sm font-semibold tracking-wide uppercase ${look.tone}`}>
        <look.Icon aria-hidden="true" className="size-5" />
        {look.label}
      </p>
      <p className="max-w-3xl text-xl font-medium text-pretty sm:text-2xl">{result.sentence}</p>
    </div>
  );
}

/** Naive vs harmonized change on one zero-centred scale, with the harmonized range and the claim marked. */
function ChangeBars({ result }) {
  const h = result.harmonized;
  const values = [result.naive.change_pct, h.lo, h.hi, h.mid, result.claimed_change_pct, 0];
  const extent = Math.max(...values.map(Math.abs)) || 1;
  const pos = (v) => 50 + (v / extent) * 50; // percent of the track width
  const bar = (v) => ({ left: `${Math.min(pos(0), pos(v))}%`, width: `${Math.abs(pos(v) - pos(0))}%` });
  const claimLine = (
    <span aria-hidden="true" className="border-foreground absolute inset-y-0 border-l-2 border-dashed" style={{ left: `${pos(result.claimed_change_pct)}%` }} />
  );
  const zero = <span aria-hidden="true" className="absolute inset-y-0 border-l" style={{ left: "50%", borderColor: "var(--fr-axis)" }} />;
  const unit = result.naive_unit === "hotspots" ? "hotspots" : "fire cell-days, raw sensors";
  return (
    <div className="space-y-3" data-testid="claim-bars">
      <div className="grid gap-1">
        <p className="text-sm">
          <GlossaryTerm term="naive_splice">Raw record (naive splice)</GlossaryTerm>, as most people would compute it:{" "}
          <span className="font-semibold tabular-nums">{signedPct(result.naive.change_pct)}</span>{" "}
          <span className="text-muted-foreground">({unit})</span>
        </p>
        <div className="bg-muted relative h-4 rounded-sm">
          {zero}
          <span aria-hidden="true" className="absolute inset-y-0.5 rounded-sm" style={{ ...bar(result.naive.change_pct), background: "var(--fr-naive-line)" }} />
          {claimLine}
        </div>
      </div>
      <div className="grid gap-1">
        <p className="text-sm">
          <GlossaryTerm term="harmonized">Corrected record (harmonized)</GlossaryTerm>:{" "}
          <span className="font-semibold tabular-nums">{signedPct(h.mid)}</span>{" "}
          <span className="text-muted-foreground tabular-nums">
            (<GlossaryTerm term="range">likely range</GlossaryTerm> {signedPct(h.lo)} to {signedPct(h.hi)}; Aqua-equivalent fire cell-days)
          </span>
        </p>
        <div className="bg-muted relative h-4 rounded-sm">
          {zero}
          <span aria-hidden="true" className="absolute inset-y-0.5 rounded-sm" style={{ ...bar(h.mid), background: "var(--fr-accent)" }} />
          <span aria-hidden="true" className="absolute top-1/2 h-2 -translate-y-1/2 border-x-2 border-y-0" style={{ left: `${pos(h.lo)}%`, width: `${Math.max(pos(h.hi) - pos(h.lo), 0.5)}%`, borderColor: "var(--fr-text)" }} />
          {claimLine}
        </div>
      </div>
      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <span aria-hidden="true" className="border-foreground inline-block h-3 border-l-2 border-dashed" />
        Dashed line: the claim, {signedPct(result.claimed_change_pct)}. The two records use different units; each bar is a change within its own record.
      </p>
    </div>
  );
}

function ResultDetails({ result, onChart }) {
  const cantTell = result.verdict === "cant_tell_missing";
  return (
    <div className="space-y-4 rounded-lg border p-4">
      {!cantTell && result.naive ? <ChangeBars result={result} /> : null}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-muted-foreground mr-1 text-sm">Data in the compared years:</span>
        {result.kinds.map((k) => <KindBadge key={k} kind={k} />)}
      </div>
      {result.windows ? (
        <p className="text-sm tabular-nums">
          Years compared: <span className="font-medium">{windowText(result.windows.start)}</span> with{" "}
          <span className="font-medium">{windowText(result.windows.end)}</span>
          {result.missing_years.length ? <> · no data in {result.missing_years.join(", ")}</> : null}
        </p>
      ) : null}
      {result.artifact_share !== null ? (
        <p className="text-sm">
          <CircleSlash aria-hidden="true" className="mr-1 inline size-4 align-text-bottom" />
          <GlossaryTerm term="artifact_share">Artifact share</GlossaryTerm>:{" "}
          {result.notes.find((n) => n.id === "artifact_share")?.text}
        </p>
      ) : null}
      {result.notes.filter((n) => n.id !== "artifact_share").length ? (
        <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
          {result.notes.filter((n) => n.id !== "artifact_share").map((n) => <li key={n.id}>{n.text}</li>)}
        </ul>
      ) : null}
      {result.windows ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onChart("naive_splice")}>
            See it on the chart: raw record
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onChart("harmonized")}>
            See it on the chart: corrected record
          </Button>
        </div>
      ) : null}
    </div>
  );
}
