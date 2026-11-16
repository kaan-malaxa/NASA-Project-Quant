import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import SectionState from "@/components/SectionState.jsx";
import KindBadge from "@/components/KindBadge.jsx";
import GlossaryTerm from "@/components/GlossaryTerm.jsx";
import { VizSlot, useViz } from "@/components/Viz.jsx";
import { buildLensList, seriesForLens } from "@/lib/lenses.js";
import { cellDetail } from "@/lib/cellDetail.js";
import { fmtNumber, monthName, ordinal } from "@/lib/format.js";
import { sensorLabel } from "@/lib/labels.js";
import { GLOSSARY } from "@/lib/glossary.js";
import StorySection, { firstNotOk } from "./StorySection.jsx";

const VIEW_OPTIONS = [
  { id: "clock", label: "Clock" },
  { id: "weeks", label: "Weeks" },
  { id: "months", label: "Months" },
];
const MODE_OPTIONS = [
  { id: "activity", label: "Activity" },
  { id: "anomaly", label: "Compared with normal" },
];

function Toggle({ label, value, options, onChange, renderItem = undefined, available = true }) {
  return (
    <div data-tour={available ? (label === "View" ? "view" : label === "Show" ? "mode" : "lens") : undefined} className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      <ToggleGroup
        type="single"
        variant="outline"
        aria-label={label}
        value={value}
        onValueChange={(v) => v && onChange(v)}
        className="flex flex-wrap justify-start"
      >
        {options.map((o) => (renderItem ? renderItem(o) : <ToggleGroupItem key={o.id} value={o.id}>{o.label}</ToggleGroupItem>))}
      </ToggleGroup>
    </div>
  );
}

/** Screen 4 · Calendar: clock / weeks / months, six lenses, activity / anomaly, cell detail. */
export default function CalendarSection({ files, url, setUrl, lastDataDay, chartRef }) {
  const { weekly, monthly, climatology, season } = files;
  const [selected, setSelected] = useState(null);
  const viz = useViz();

  const lenses = useMemo(() => (weekly?.status === "ok" ? buildLensList(weekly.data.series_meta) : []), [weekly]);
  const lens = lenses.some((l) => l.id === url.lens) ? url.lens : "harmonized";
  const grainTable = url.view === "months" ? monthly : weekly;
  const blocking = firstNotOk(grainTable, climatology);
  const range = { from: url.from, to: url.to ?? lastDataDay };
  const currentYear = Number((lastDataDay || "").slice(0, 4)) || new Date().getUTCFullYear();
  const seasonData = season?.status === "ok" ? season.data : undefined;

  const unitFor = (table, year) => table?.series_meta?.[seriesForLens(lens, year ?? currentYear)]?.unit ?? null;
  const unit = grainTable?.status === "ok" ? unitFor(grainTable.data) : null;

  const detail = useMemo(() => {
    if (!selected || climatology?.status !== "ok") return null;
    const table = selected.week != null ? weekly : monthly;
    if (table?.status !== "ok") return null;
    const d = cellDetail(table.data, selected, lens, climatology.data.baseline_years, viz?.percentileRank);
    return { ...d, unit: unitFor(table.data, selected.year), baseline: climatology.data.baseline_years };
  }, [selected, lens, weekly, monthly, climatology, viz]);

  return (
    <StorySection
      id="calendar"
      title="The fire calendar"
      intro="Every week or month since 2003. Pick how to read the record and whether to compare each period with a normal year."
    >
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <Toggle available={!blocking} label="View" value={url.view} options={VIEW_OPTIONS} onChange={(view) => setUrl({ view })} />
        <Toggle available={!blocking} label="Show" value={url.mode} options={MODE_OPTIONS} onChange={(mode) => setUrl({ mode })} />
      </div>
      {lenses.length ? (
        <Toggle
          available={!blocking}
          label="Record (lens)"
          value={lens}
          options={lenses}
          onChange={(l) => setUrl({ lens: l })}
          renderItem={(o) =>
            o.id === "naive_splice" ? (
              <Tooltip key={o.id}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem value={o.id}>{o.label}</ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{GLOSSARY.naive_splice.text}</TooltipContent>
              </Tooltip>
            ) : (
              <ToggleGroupItem key={o.id} value={o.id}>
                {o.label}
              </ToggleGroupItem>
            )
          }
        />
      ) : null}

      {blocking ? (
        <SectionState state={blocking} title="Calendar" skeletonClassName="h-80" />
      ) : (
        <div className="space-y-3">
          {url.view === "clock" ? (
            <VizSlot
              name="FireYearClock"
              weekly={weekly.data}
              climatology={climatology.data}
              season={seasonData}
              lens={lens}
              mode={url.mode}
              range={range}
              currentYear={currentYear}
              onSelect={setSelected}
              ref={chartRef}
              placeholderClassName="h-80"
            />
          ) : (
            <VizSlot
              name="CalendarHeatmap"
              grain={url.view === "months" ? "month" : "week"}
              weekly={url.view === "weeks" ? weekly.data : undefined}
              monthly={url.view === "months" ? monthly.data : undefined}
              climatology={climatology.data}
              season={seasonData}
              lens={lens}
              mode={url.mode}
              range={range}
              onSelect={setSelected}
              ref={chartRef}
              placeholderClassName="h-80"
            />
          )}
          <VizSlot name="Legend" scale={url.mode} unit={unit ?? ""} placeholderClassName="h-10" />
          <p className="text-sm">
            Unit: {unit ? <UnitWithTerms unit={unit} /> : "not stated in the file"}.
            {url.mode === "anomaly" ? (
              <>
                {" "}
                Colours show each period&apos;s <GlossaryTerm term="percentile">percentile</GlossaryTerm> against the same
                period in the baseline years.
              </>
            ) : null}
          </p>
          <p className="text-muted-foreground text-sm">
            Hatched cells: no data (the satellite was not working). Dashed, lighter cells: estimates.
          </p>
          {detail ? <CellPanel detail={detail} onClose={() => setSelected(null)} /> : null}
        </div>
      )}
    </StorySection>
  );
}

/** Adds glossary hovers to the unit words that need them. */
function UnitWithTerms({ unit }) {
  const parts = unit.split(/(fire cell-days?|Aqua-equivalent|VIIRS-equivalent)/);
  const key = { "fire cell-days": "fire_cell_day", "fire cell-day": "fire_cell_day", "Aqua-equivalent": "aqua_equivalent", "VIIRS-equivalent": "viirs_equivalent" };
  return parts.map((p, i) => (key[p] ? <GlossaryTerm key={i} term={key[p]}>{p}</GlossaryTerm> : <span key={i}>{p}</span>));
}

function CellPanel({ detail: d, onClose }) {
  const when = d.grain === "week" ? `Week ${d.slot}, ${d.year}` : `${monthName(d.slot)} ${d.year}`;
  return (
    <div role="region" aria-label={`Details for ${when}`} className="bg-card relative max-w-md rounded-lg border p-4 text-sm" aria-live="polite">
      <Button variant="ghost" size="icon" onClick={onClose} className="absolute top-2 right-2" aria-label="Close details">
        <X aria-hidden="true" />
      </Button>
      <p className="font-semibold">{when}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">Value</dt>
        <dd className="tabular-nums">
          {d.value === null ? "No data" : fmtNumber(d.value)} {d.value !== null && d.unit ? <span className="text-muted-foreground">{d.unit}</span> : null}
        </dd>
        {d.value !== null && d.lo !== null && d.hi !== null && (d.lo !== d.value || d.hi !== d.value) ? (
          <>
            <dt className="text-muted-foreground">
              <GlossaryTerm term="range">Likely range</GlossaryTerm>
            </dt>
            <dd className="tabular-nums">
              {fmtNumber(d.lo)} to {fmtNumber(d.hi)}
            </dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Kind</dt>
        <dd>
          <KindBadge kind={d.kind} />
        </dd>
        <dt className="text-muted-foreground">Satellite</dt>
        <dd>{d.source ? sensorLabel(d.source) : "None"}</dd>
        <dt className="text-muted-foreground">
          <GlossaryTerm term="percentile">Percentile</GlossaryTerm>
        </dt>
        <dd>
          {d.unranked ? "Too little burning at this time of year to rank." : d.percentile === null
            ? "Not ranked"
            : `${ordinal(d.percentile)} among ${d.nOthers} baseline years, ${d.baseline[0]}–${d.baseline[1]}`}
        </dd>
      </dl>
    </div>
  );
}
