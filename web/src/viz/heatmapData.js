// Pure data preparation for the calendar charts (CalendarHeatmap now, FireYearClock in B2).
// No React, no DOM. Unit-tested in __tests__/heatmap.test.js.

import { cellStyle, isLowActivity, lowActivityThreshold } from "./cellStyle";
import { percentileRank } from "./percentile";
import {
  KIND_STYLE,
  SENSOR_STYLE,
  UNRANKED_LABEL,
  activityDomainMax,
  activityScale,
  anomalyScale,
  formatNumber,
  formatPercentile,
  formatRange,
  formatWeek,
  monthName,
  weekDateRange,
  weekOfDoy,
} from "./theme";

/** Contracts §6.2: the naive splice is aqua_raw before this year and viirs_raw from it. */
export const NAIVE_SPLICE_YEAR = 2012;

export const periodsOf = (grain) => (grain === "week" ? 52 : 12);

export function periodOf(r) {
  return "week" in r ? r.week : r.month;
}

/** The rows of one lens. naive_splice = aqua_raw before 2012, viirs_raw from 2012 (built here, in the browser). */
export function lensRows(rows, lens) {
  const list = rows ?? [];
  if (lens === "naive_splice") {
    return list.filter((r) =>
      r.year < NAIVE_SPLICE_YEAR ? r.series === "aqua_raw" : r.series === "viirs_raw",
    );
  }
  return list.filter((r) => r.series === lens);
}

/** Unit of a lens from series_meta (naive_splice: the raw unit). */
export function lensUnit(meta, lens, grain) {
  const key = lens === "naive_splice" ? "aqua_raw" : lens;
  return meta?.[key]?.unit ?? `fire cell-days per ${grain}`;
}

/** First and last date of a period. */
export function periodDates(year, grain, period) {
  if (grain === "week") return weekDateRange(year, period);
  const last = new Date(Date.UTC(year, period, 0)).getUTCDate();
  const mm = String(period).padStart(2, "0");
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}

/** True when the period lies entirely outside [range.from, range.to] (ISO strings compare as dates). */
export function outsideRange(year, grain, period, range) {
  if (!range) return false;
  const { from, to } = periodDates(year, grain, period);
  return to < range.from || from > range.to;
}

export function periodLabel(year, grain, period) {
  return grain === "week" ? formatWeek(year, period) : `${monthName(period)} ${year}`;
}

/**
 * Columns marked by the critical-weeks band. Week grain: the critical weeks themselves.
 * Month grain: every month containing any day of a critical week (non-leap reference year).
 */
export function criticalColumns(grain, criticalWeeks) {
  const weeks = new Set((criticalWeeks ?? []).filter((w) => w >= 1 && w <= 52));
  if (grain === "week") return weeks;
  const months = new Set();
  for (const w of weeks) {
    const { from, to } = weekDateRange(2001, w);
    const m0 = Number(from.slice(5, 7));
    const m1 = Number(to.slice(5, 7));
    for (let m = m0; m <= m1; m++) months.add(m);
  }
  return months;
}

/** Week columns where each month starts (for month labels on the week grain). */
export function monthStartWeeks() {
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const doy = Math.round((Date.UTC(2001, m - 1, 1) - Date.UTC(2001, 0, 1)) / 86_400_000) + 1;
    out.push({ month: m, week: weekOfDoy(doy) });
  }
  return out;
}

/** The source that covers most cells of a year (for the era strip). */
export function dominantSource(sources) {
  const counts = new Map();
  for (const s of sources) if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
  let best = null;
  let n = 0;
  for (const [s, c] of counts) if (c > n) [best, n] = [s, c];
  return best;
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Everything the calendar draws, computed once per data/lens/mode change. */
export function buildHeatGrid({ rows, grain, lens, mode, climatology, range, unit }) {
  const mine = lensRows(rows ?? [], lens)
    .filter((r) => {
      const p = periodOf(r);
      return p >= 1 && p <= periodsOf(grain);
    })
    .sort((a, b) => a.year - b.year || periodOf(a) - periodOf(b));

  const years = [...new Set(mine.map((r) => r.year))];
  const domainMax = activityDomainMax(mine.map((r) => (r.kind === "missing" ? null : r.value)));
  const scales = { activity: activityScale(domainMax), anomaly: anomalyScale() };

  // SD-11 baseline: the same period in the baseline years, same lens, missing excluded.
  const [b0, b1] = climatology?.baseline_years ?? [-Infinity, Infinity];
  const baseline = new Map();
  if (mode === "anomaly") {
    for (const r of mine) {
      if (r.year < b0 || r.year > b1 || r.kind === "missing" || !isNum(r.value)) continue;
      const p = periodOf(r);
      const list = baseline.get(p);
      if (list) list.push(r.value);
      else baseline.set(p, [r.value]);
    }
  }
  const p90 = new Map();
  for (const s of grain === "week" ? (climatology?.weeks ?? []) : (climatology?.months ?? [])) {
    p90.set("week" in s ? s.week : s.month, s.p90);
  }

  const cells = mine.map((r, index) => {
    const period = periodOf(r);
    const missing = r.kind === "missing" || !isNum(r.value);
    let percentile = null;
    let unranked = false;
    if (mode === "anomaly" && !missing) {
      unranked = isLowActivity(r.value, p90.get(period), lowActivityThreshold(grain, period));
      const pr = percentileRank(r.value, baseline.get(period) ?? []);
      percentile = Number.isFinite(pr) ? pr : null;
    }
    const style = cellStyle({ value: r.value, kind: r.kind, percentile, unranked }, mode, scales);

    const when = periodLabel(r.year, grain, period);
    const lines = [when];
    if (missing) {
      lines.push("No data: the satellite record does not cover this period");
    } else {
      lines.push(`${formatNumber(r.value)} ${unit}`);
      const rg = formatRange(r.lo, r.hi);
      if (rg) lines.push(`Range ${rg}`);
      if (mode === "anomaly") {
        lines.push(
          style.state === "unranked" ? UNRANKED_LABEL : `${formatPercentile(percentile)} of ${b0}–${b1}`,
        );
      }
    }
    const src = r.source ? (SENSOR_STYLE[r.source]?.label ?? r.source) : null;
    lines.push(`${KIND_STYLE[r.kind]?.label ?? r.kind}${src ? ` · ${src}` : ""}`);

    return {
      index,
      year: r.year,
      period,
      value: missing ? null : r.value,
      lo: r.lo,
      hi: r.hi,
      kind: missing ? "missing" : r.kind,
      source: r.source,
      percentile,
      unranked,
      outside: outsideRange(r.year, grain, period, range),
      style,
      lines,
      label: lines.map((l) => l.replace(/\.$/, "")).join(". ") + ".",
    };
  });

  const bySource = new Map();
  for (const c of cells) {
    const list = bySource.get(c.year);
    if (list) list.push(c.source);
    else bySource.set(c.year, [c.source]);
  }
  const rowSource = new Map();
  for (const y of years) rowSource.set(y, dominantSource(bySource.get(y) ?? []));

  return { grain, unit, years, cells, rowSource, domainMax };
}
