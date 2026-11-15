import { useMemo } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import SectionState from "@/components/SectionState.jsx";
import KindBadge from "@/components/KindBadge.jsx";
import { VizSlot } from "@/components/Viz.jsx";
import { useSpatialShards } from "@/data/useSpatialShards.js";
import { spatialAreaSeries } from "@/lib/spatial.js";
import { areaClimatology, areaKm2, latestRatio, toMonthlyJson, topMonths } from "@/lib/aoi.js";
import { fmtNumber, monthName } from "@/lib/format.js";

const km2Format = new Intl.NumberFormat("en", { maximumSignificantDigits: 2 });
const mbFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
/** Download progress in megabytes (1 MB = 1,000,000 bytes). */
const mb = (bytes) => `${mbFormat.format(bytes / 1e6)} MB`;

function Progress({ progress }) {
  const { loaded = 0, total = null } = progress || {};
  return (
    <div role="status" className="space-y-1 text-sm">
      <p>
        Loading area data… {mb(loaded)}
        {total ? ` of ${mb(total)}` : ""}
      </p>
      <progress className="h-2 w-full max-w-sm" value={total ? loaded : undefined} max={total || undefined} />
    </div>
  );
}

/** Your area uses the same authoritative contributions and units as the regional lens. */
export default function AoiPanel({ region, files, url, setUrl }) {
  const index = files.spatial_index;
  const available = index?.data?.years ?? [];
  const years = available.length ? [available[0].year, available.at(-1).year] : [];
  const csv = { state: useSpatialShards(region.id, index, years, true) };
  const cells = url.aoi;
  const km2 = useMemo(() => areaKm2(cells), [cells]);
  const clear = () => setUrl({ aoi: [] });
  const baseline = files.climatology?.status === "ok" ? files.climatology.data.baseline_years : null;
  const unit = url.lens === "viirs_equiv" ? "VIIRS-equivalent fire cell-days per month" :
    ["aqua_raw", "viirs_raw", "naive_splice"].includes(url.lens) ? "fire cell-days per month" : "Aqua-equivalent fire cell-days per month";

  const result = useMemo(() => {
    if (csv.state?.status !== "ok" || files.calibration?.status !== "ok") return null;
    const allSeries = spatialAreaSeries({ shards: csv.state.data, cells, lens: url.lens });
    const wanted = new Set((files.monthly?.data?.rows ?? []).map((row) => row.year));
    const series = allSeries.filter((row) => wanted.has(row.year));
    const months = baseline ? areaClimatology(allSeries, baseline) : null;
    const kinds = [...new Set(series.map((s) => s.kind))];
    return {
      series,
      monthly: { ...toMonthlyJson(series, files.calibration.data, url.lens, unit),
        configuration: files.monthly?.data?.configuration, calibration: files.calibration.data,
        baseline_rows: allSeries.map((row) => ({ ...row, series: url.lens })) },
      climatology: months ? { baseline_years: baseline, unit_week: null, unit_month: unit, weeks: [], months } : null,
      latest: months ? latestRatio(series, months) : null,
      kinds: ["observed", "harmonized", "estimated", "sample", "missing"].filter((k) => kinds.includes(k)),
    };
  }, [csv.state, files.calibration, files.monthly, cells, baseline, url.lens, unit]);

  const top = result ? topMonths(result.series, { from: url.from, to: url.to ?? region.last_data_day }) : [];

  return (
    <div className="space-y-4 rounded-lg border p-4" role="region" aria-labelledby="aoi-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id="aoi-title" className="text-lg font-semibold">
          Your area ({cells.length} {cells.length === 1 ? "hexagon" : "hexagons"}, about {km2Format.format(km2)} km²)
        </h3>
        <Button size="sm" variant="outline" onClick={clear}>
          <X aria-hidden="true" /> Clear area
        </Button>
      </div>

      {files.spatial_index?.status === "absent" ? (
        <p className="text-sm">Area data are not available for this place.</p>
      ) : csv.state?.status === "loading" || csv.state?.status === "lazy" ? (
        <Progress progress={csv.progress} />
      ) : csv.state?.status !== "ok" ? (
        <SectionState state={csv.state} title="Area data" />
      ) : files.calibration?.status !== "ok" ? (
        <SectionState state={files.calibration} title="Calibration" />
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span>Calibration measured for the whole region is applied to your area. Treat small areas as indicative.</span>
            {result.kinds.map((k) => (
              <KindBadge key={k} kind={k} />
            ))}
          </p>
          {result.climatology ? (
            <VizSlot
              name="CalendarHeatmap"
              grain="month"
              monthly={result.monthly}
              climatology={result.climatology}
              lens={url.lens}
              mode={url.mode}
              range={{ from: url.from, to: url.to ?? region.last_data_day }}
              placeholderClassName="h-64"
            />
          ) : null}
          <p className="text-muted-foreground text-sm">Unit: {unit}. Daily source selection and coverage scaling match the regional record.</p>
          {result.latest && result.latest.median !== null ? (
            <p className="text-sm">
              Latest month in the data, {monthName(result.latest.month)} {result.latest.year} (it may still be in progress):{" "}
              {fmtNumber(result.latest.value)}, against a typical {monthName(result.latest.month)} of {fmtNumber(result.latest.median)}
              {result.latest.ratio !== null ? ` (${fmtNumber(result.latest.ratio)} times the typical value)` : ""}.
            </p>
          ) : null}
          <div>
            <h4 className="font-medium">Top months in this date range</h4>
            {top.length ? (
              <ol className="mt-1 list-decimal space-y-0.5 pl-6 text-sm tabular-nums">
                {top.map((s) => (
                  <li key={`${s.year}-${s.month}`}>
                    {monthName(s.month)} {s.year}: {fmtNumber(s.value)}
                    {s.lo !== s.hi ? (
                      <span className="text-muted-foreground">
                        {" "}
                        ({fmtNumber(s.lo)} to {fmtNumber(s.hi)})
                      </span>
                    ) : null}{" "}
                    <KindBadge kind={s.kind} />
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted-foreground mt-1 text-sm">No burning recorded in your area in this date range.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
