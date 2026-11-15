import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import KindBadge from "@/components/KindBadge.jsx";
import { useJson } from "@/data/useJson.js";
import { regionFilePath } from "@/data/files.js";
import NowcastBody from "@/screens/region/NowcastBody.jsx";
import Reveal from "./Reveal.jsx";
import { BADGED_KINDS, liveRegion } from "./liveRegion.js";
import { compareWithBaseline, latestCompleteYear, weekStrip } from "./latestYear.js";
import { fmtNumber } from "@/lib/format.js";

const isSample = (n) => n?.kind === "sample" || n?.code_version === "sample";

/**
 * Landing page · "Live this week": the nowcast of the first non-synthetic region, as one card.
 * The body is the region page's own NowcastBody (same wording for every status). If nowcast.json is missing or fails
 * validation the whole section is hidden here (the region page shows the error instead); dev builds log why.
 * @param {object} props
 * @param {object[]} props.regions regions.json `regions` (all of them; synthetic ones are skipped)
 */
export default function LiveThisWeek({ regions }) {
  const region = liveRegion(regions);
  const ref = useRef(null);
  // Fetched straight away (the landing loader waits for it), not when the section scrolls into view.
  const path = region ? regionFilePath(region.id, "nowcast") : null;
  const state = useJson(path);
  // "absent" = not on the server; before the fetch starts useJson also says "absent", so only count it with a path.
  const failed = path !== null && ["absent", "invalid", "network"].includes(state.status);

  const n = state.status === "ok" ? state.data : null;

  // No recent satellite data: show the latest complete year in the record instead (trend.json, weekly.json).
  const noLive = n?.status === "unavailable";
  const listed = (name) => (region?.files || []).includes(name);
  const trendPath = noLive && listed("trend") ? regionFilePath(region.id, "trend") : null;
  const weeklyPath = noLive && listed("weekly") ? regionFilePath(region.id, "weekly") : null;
  const trend = useJson(trendPath);
  const weekly = useJson(weeklyPath);
  const year = noLive ? latestCompleteYear(region?.last_data_day) : null;
  const latest =
    noLive && trend.status === "ok" && weekly.status === "ok" && year !== null
      ? {
          year,
          compare: compareWithBaseline(trend.data.annual, year, n.baseline_years),
          weeks: weekStrip(weekly.data.rows, year),
          weekUnit: weekly.data.series_meta?.harmonized?.unit ?? null,
        }
      : null;
  const latestFailed =
    noLive &&
    (!trendPath ||
      !weeklyPath ||
      year === null ||
      ["absent", "invalid", "network"].includes(trend.status) ||
      ["absent", "invalid", "network"].includes(weekly.status) ||
      (latest !== null && latest.compare === null));
  const hidden = failed || latestFailed;

  useEffect(() => {
    if (hidden && import.meta.env.DEV) {
      const why = failed
        ? `nowcast.json ${state.status}`
        : `trend.json ${trend.status}, weekly.json ${weekly.status}`;
      console.info(`Live this week hidden: ${region?.id} ${why}.`, state.detail ?? "");
    }
  }, [hidden, failed, region, state, trend.status, weekly.status]);

  if (!region || hidden) return null;
  if (noLive) return <LatestYearCard region={region} nowcast={n} latest={latest} innerRef={ref} />;

  return (
    <Reveal aria-labelledby="live-title" className="landing-live">
      <div ref={ref} className="mx-auto w-full max-w-6xl px-4 pb-16">
        <div className="bg-card text-card-foreground space-y-4 rounded-xl border p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                Live this week
              </p>
              <h2 id="live-title" className="text-2xl font-bold tracking-tight">
                {region.name}
              </h2>
            </div>
            {n ? (
              <div className="flex flex-wrap gap-2" data-testid="live-badges">
                {BADGED_KINDS.includes(n.kind) ? <KindBadge kind={n.kind} /> : null}
                {isSample(n) ? <KindBadge kind="sample" /> : null}
              </div>
            ) : null}
          </div>
          {/* Fixed minimum height: the skeleton and the loaded body take the same room, so nothing jumps. */}
          <div className="min-h-48" data-testid="live-body">
            {n ? (
              <NowcastBody nowcast={n} kindBadge={false} />
            ) : (
              <div role="status" aria-label="Loading this week's activity">
                <Skeleton className="h-48 w-full" />
              </div>
            )}
          </div>
          <Button asChild size="lg">
            <Link to={`/r/${region.id}`}>See the full picture</Link>
          </Button>
        </div>
      </div>
    </Reveal>
  );
}

/**
 * When there is no recent satellite data: the latest complete year in the record, as labelled values only (no
 * hand-written sentence with a number or a direction). The nowcast's own sentence says why.
 */
function LatestYearCard({ region, nowcast, latest, innerRef }) {
  const c = latest?.compare;
  return (
    <Reveal aria-labelledby="live-title" className="landing-live">
      <div ref={innerRef} className="mx-auto w-full max-w-6xl px-4 pb-16">
        <div
          className="bg-card text-card-foreground space-y-5 rounded-xl border p-5 shadow-sm sm:p-6"
          data-testid="latest-year"
        >
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              {region.name}
            </p>
            <h2 id="live-title" className="text-2xl font-bold tracking-tight">
              Latest year in the record{latest ? `: ${latest.year}` : ""}
            </h2>
            <p className="text-muted-foreground text-sm">{nowcast.sentence}</p>
          </div>
          {latest && c ? (
            <>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <dt className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
                    {latest.year}, harmonized record <KindBadge kind={c.row.kind} />
                  </dt>
                  <dd className="text-3xl font-semibold tabular-nums">{fmtNumber(c.row.harmonized, 0)}</dd>
                  <dd className="text-muted-foreground text-sm">
                    Aqua-equivalent fire cell-days in the year · likely range {fmtNumber(c.row.lo, 0)} to{" "}
                    {fmtNumber(c.row.hi, 0)}
                  </dd>
                </div>
                {c.median !== null ? (
                  <div className="space-y-1">
                    <dt className="text-muted-foreground text-sm">
                      Typical year: median of the {c.others ? "other " : ""}baseline years, {c.baseline[0]} to{" "}
                      {c.baseline[1]}
                    </dt>
                    <dd className="text-3xl font-semibold tabular-nums">{fmtNumber(c.median, 0)}</dd>
                    <dd className="text-muted-foreground text-sm">
                      Aqua-equivalent fire cell-days in a year
                    </dd>
                  </div>
                ) : null}
              </dl>
              <WeekStrip weeks={latest.weeks} year={latest.year} unit={latest.weekUnit} />
            </>
          ) : (
            <div role="status" aria-label="Loading the latest year">
              <Skeleton className="h-40 w-full" />
            </div>
          )}
          <Button asChild size="lg">
            <Link to={`/r/${region.id}`}>See the full picture</Link>
          </Button>
        </div>
      </div>
    </Reveal>
  );
}

/** Each week of the year as a thin bar; weeks without data are hatched, never drawn as zero. */
function WeekStrip({ weeks, year, unit }) {
  const max = Math.max(1, ...weeks.map((w) => w.value ?? 0));
  const W = 520;
  const H = 64;
  const bw = W / weeks.length;
  const missing = weeks.filter((w) => w.value === null).length;
  return (
    <figure className="space-y-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-16 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Each week of ${year} in the harmonized record: ${weeks.length - missing} weeks with data, ${missing} without.`}
      >
        <defs>
          <pattern
            id="week-hatch"
            width="4"
            height="4"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="4" stroke="var(--muted-foreground)" strokeWidth="1" />
          </pattern>
        </defs>
        {weeks.map((w, i) =>
          w.value === null ? (
            <rect
              key={w.week}
              x={i * bw + 0.5}
              y={0}
              width={bw - 1}
              height={H}
              fill="url(#week-hatch)"
              opacity={0.6}
            />
          ) : (
            <rect
              key={w.week}
              x={i * bw + 0.5}
              y={H - (H * w.value) / max}
              width={bw - 1}
              height={(H * w.value) / max}
              fill="var(--primary)"
              opacity={0.75}
            />
          ),
        )}
      </svg>
      <figcaption className="text-muted-foreground text-xs">
        Each week of {year}
        {unit ? ` (${unit})` : ""}. Hatched: no data.
      </figcaption>
    </figure>
  );
}
