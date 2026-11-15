import { Badge } from "@/components/ui/badge";
import KindBadge from "@/components/KindBadge.jsx";
import GlossaryTerm from "@/components/GlossaryTerm.jsx";
import { VizSlot } from "@/components/Viz.jsx";
import { fmtAsOf, fmtNumber, monthName } from "@/lib/format.js";
import { statusLabel } from "@/lib/labels.js";

/** SD-11 copy for low_activity. */
export const LOW_ACTIVITY_COPY = "Too little burning at this time of year to rank.";

function AsOf({ nowcast }) {
  // No near-real-time input yet: the pipeline writes as_of and the window as null (status "unavailable").
  if (!nowcast.as_of) return null;
  const t = fmtAsOf(nowcast.as_of);
  return (
    <p className="text-muted-foreground text-sm">
      As of <time dateTime={nowcast.as_of}>{t.local}</time> (your time) · {t.utc}. Window{" "}
      {nowcast.window.start} to {nowcast.window.end}.
    </p>
  );
}

function InputNote({ nowcast }) {
  return (
    <p className="text-muted-foreground text-sm">
      <GlossaryTerm term="nrt">Near-real-time</GlossaryTerm> input. {nowcast.input_note}
    </p>
  );
}

/** "November so far: {value} vs a typical {median} by this date." Omitted when either number is missing. */
export function monthToDateLine(mtd) {
  if (
    !mtd ||
    mtd.value === null ||
    mtd.value === undefined ||
    mtd.median === null ||
    mtd.median === undefined
  )
    return null;
  return `${monthName(mtd.month)} so far: ${fmtNumber(mtd.value)} vs a typical ${fmtNumber(mtd.median)} by this date.`;
}

function MonthToDate({ mtd }) {
  const line = monthToDateLine(mtd);
  if (!line) return null;
  return (
    <p className="text-sm">
      {line}{" "}
      <span className="text-muted-foreground">
        (Aqua-equivalent <GlossaryTerm term="fire_cell_day">fire cell-days</GlossaryTerm>)
      </span>
    </p>
  );
}

export function StatusBadge({ status }) {
  return (
    <Badge variant="outline" data-status={status} className="text-sm">
      Status: {statusLabel(status)}
    </Badge>
  );
}

/**
 * The body of "This week" for one nowcast.json: the unavailable, low-activity and ranked layouts.
 * Shared by the region page (ThisWeekSection) and the landing page (LiveThisWeek).
 * `kindBadge`: show the kind badge in the ranked layout (the landing page places its own).
 */
export default function NowcastBody({ nowcast: n, kindBadge = true }) {
  if (n.status === "unavailable") {
    return (
      <div className="space-y-2 rounded-lg border border-dashed p-4" data-layout="unavailable">
        <StatusBadge status={n.status} />
        <p>{n.sentence}</p>
        <AsOf nowcast={n} />
        <InputNote nowcast={n} />
      </div>
    );
  }
  if (n.status === "low_activity") {
    return (
      <div className="space-y-2 rounded-lg border p-4" data-layout="low_activity">
        <StatusBadge status={n.status} />
        <p className="text-lg">{n.sentence}</p>
        <p className="text-muted-foreground text-sm">{LOW_ACTIVITY_COPY}</p>
        <MonthToDate mtd={n.month_to_date} />
        <AsOf nowcast={n} />
        <InputNote nowcast={n} />
      </div>
    );
  }
  return (
    <div className="space-y-3" data-layout="ranked">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={n.status} />
        {kindBadge ? <KindBadge kind={n.kind} /> : null}
      </div>
      <p className="max-w-3xl text-lg font-medium text-pretty">{n.sentence}</p>
      <VizSlot name="PercentileStrip" nowcast={n} placeholderClassName="h-24" />
      <MonthToDate mtd={n.month_to_date} />
      <AsOf nowcast={n} />
      <InputNote nowcast={n} />
    </div>
  );
}
