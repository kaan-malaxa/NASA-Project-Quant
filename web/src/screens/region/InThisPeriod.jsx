import { useMemo } from "react";
import SectionState from "@/components/SectionState.jsx";
import KindBadge from "@/components/KindBadge.jsx";
import GlossaryTerm from "@/components/GlossaryTerm.jsx";
import { computeRange } from "@/lib/range.js";
import { fmtNumber, monthName, ordinal } from "@/lib/format.js";
import { fmtInt } from "@/lib/format3.js";
import { monthToDateLine } from "./ThisWeekSection.jsx";

/** "Aqua-equivalent fire cell-days per day" -> "Aqua-equivalent fire cell-days" (a total over a period). */
const totalUnit = (unit) => (unit ? unit.replace(/ per day$/, "") : "");

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 border-t py-2 first:border-t-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}

function Ranked({ title, items, label, unit }) {
  return (
    <div>
      <h4 className="font-medium">{title}</h4>
      {items.length ? (
        <ol className="mt-1 list-decimal space-y-0.5 pl-6 text-sm tabular-nums">
          {items.map((x) => (
            <li key={x.key}>
              {label(x)}: {fmtNumber(x.total)} <span className="text-muted-foreground">{unit}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground mt-1 text-sm">None fully covered in this range.</p>
      )}
    </div>
  );
}

/** The "This month vs normal" line (challenge wording), from nowcast.month_to_date. */
function ThisMonthLine({ nowcast }) {
  const line = monthToDateLine(nowcast?.month_to_date);
  if (!line) return null;
  const p = nowcast.month_to_date.percentile;
  return (
    <p className="rounded-lg border p-3 text-sm">
      <span className="font-medium">This month vs normal: </span>
      {line}
      {p !== null && p !== undefined ? (
        <>
          {" "}
          That is the {ordinal(p)} <GlossaryTerm term="percentile">percentile</GlossaryTerm> for this point in the month.
        </>
      ) : null}
    </p>
  );
}

/** Range analytics for the selected lens and dates, from daily.json. */
export default function InThisPeriod({ daily, nowcast, url, lastDataDay, lensLabel }) {
  const to = url.to ?? lastDataDay;
  const r = useMemo(
    () => (daily?.status === "ok" ? computeRange(daily.data, { lens: url.lens, from: url.from, to }) : null),
    [daily, url.lens, url.from, to],
  );
  // "When the range includes today": the newest data day is inside the range.
  const includesNow = lastDataDay && url.from <= lastDataDay && to >= lastDataDay;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">In this period</h3>
      {includesNow && nowcast?.status === "ok" ? <ThisMonthLine nowcast={nowcast.data} /> : null}
      <SectionState state={daily} title="In this period" skeletonClassName="h-48">
        {() => {
          if (r.empty) return <p className="text-sm">There is no data in this date range.</p>;
          const unit = totalUnit(r.unit);
          return (
            <div className="space-y-4">
              <p className="text-sm">
                {r.from} to {r.to}, {r.lens === "naive_splice" ? "naive splice" : lensLabel(r.lens)}.
                {r.clipped ? ` Data exist from ${r.dataFirst} to ${r.dataLast}, so the range was shortened to fit.` : ""}
                {r.fellBack
                  ? ` The daily file does not hold the "${lensLabel(r.requestedLens)}" record, so these numbers use the harmonized record.`
                  : ""}
              </p>
              <dl className="max-w-2xl text-sm">
                <Row label="Total">
                  {fmtNumber(r.total)} <span className="text-muted-foreground">{unit}</span>
                  {r.lo !== null && (r.lo !== r.total || r.hi !== r.total) ? (
                    <span className="text-muted-foreground">
                      {" "}
                      (<GlossaryTerm term="range">likely range</GlossaryTerm> {fmtNumber(r.lo)} to {fmtNumber(r.hi)})
                    </span>
                  ) : null}
                  <span className="mt-1 flex flex-wrap gap-1">
                    {r.kinds.map((k) => (
                      <KindBadge key={k} kind={k} />
                    ))}
                  </span>
                </Row>
                <Row label="Days">
                  {fmtInt(r.nWithData)} with data, {fmtInt(r.nMissing)} without (of {fmtInt(r.nDays)}). Days without data
                  are left out, not counted as zero.
                </Row>
                <Row label="Busiest day">
                  {r.busiestDay ? (
                    <>
                      {r.busiestDay.date}: {fmtNumber(r.busiestDay.value)} <span className="text-muted-foreground">{unit}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </Row>
                <Row label="Busiest month">
                  {r.busiestMonth ? `${monthName(r.busiestMonth.month)} ${r.busiestMonth.year}: ${fmtNumber(r.busiestMonth.total)}` : "—"}
                </Row>
                <Row label="Busiest year">
                  {r.busiestYear ? `${r.busiestYear.year}: ${fmtNumber(r.busiestYear.total)}` : "—"}
                </Row>
                <Row label="Mean per year">
                  {r.meanPerYear ? (
                    <>
                      {fmtNumber(r.meanPerYear.value)} <span className="text-muted-foreground">{unit}</span>, over{" "}
                      {r.meanPerYear.years.length} full {r.meanPerYear.years.length === 1 ? "year" : "years"} in the range
                    </>
                  ) : (
                    "No full year inside this range."
                  )}
                </Row>
              </dl>
              <div className="grid gap-4 sm:grid-cols-2">
                <Ranked title="Top years" items={r.topYears} label={(x) => String(x.year)} unit={unit} />
                <Ranked title="Top months" items={r.topMonths} label={(x) => `${monthName(x.month)} ${x.year}`} unit={unit} />
              </div>
              <p className="text-muted-foreground text-xs">
                Rankings leave out years with less than 90 % of days covered and months with less than 80 %, including
                ones cut short by the date range.
              </p>
            </div>
          );
        }}
      </SectionState>
    </div>
  );
}
