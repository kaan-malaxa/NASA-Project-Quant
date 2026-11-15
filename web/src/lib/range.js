/**
 * Date-range analytics on daily.json (contracts 6.4). Pure; no React.
 * Missing days (null) are skipped and counted, never treated as zero.
 * A month under 80 % covered or a year under 90 % covered (the SD-08 thresholds) is marked incomplete and left out of
 * the rankings and of the mean per year.
 */
import { FIRST_DAY, isIsoDate } from "./urlState.js";
import { NAIVE_SPLICE_SWITCH_YEAR } from "./lenses.js";

export const MONTH_MIN_COVERAGE = 0.8;
export const YEAR_MIN_COVERAGE = 0.9;
const DAY_MS = 86400000;

const toMs = (iso) => Date.parse(`${iso}T00:00:00Z`);
const toIso = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso, n) => toIso(toMs(iso) + n * DAY_MS);
export const daysBetween = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY_MS);
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const daysInYear = (y) => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365);

/** Which daily series serves a lens; lenses not in daily.json fall back to harmonized. */
export function resolveDailyLens(daily, lens) {
  const s = daily?.series || {};
  if (lens === "naive_splice" && s.aqua_raw && s.viirs_raw) return { lens, fellBack: false };
  if (lens !== "naive_splice" && s[lens]) return { lens, fellBack: false };
  return { lens: "harmonized", fellBack: lens !== "harmonized" };
}

export function seriesNameAt(lens, year) {
  if (lens !== "naive_splice") return lens;
  return year < NAIVE_SPLICE_SWITCH_YEAR ? "aqua_raw" : "viirs_raw";
}

/** kind_runs lookup: the run for (series, date); null when no run covers it. */
export function makeKindLookup(daily) {
  const runs = (daily.kind_runs || []).map((r) => ({ ...r, toIso: r.to ?? "9999-12-31" }));
  return (series, iso) => runs.find((r) => r.series === series && r.from <= iso && iso <= r.toIso) ?? null;
}

/** Kind of a day that has data when no kind_run covers it: sample files stay sample; raw series are as recorded. */
export function fallbackKind(daily, series) {
  if (daily.code_version === "sample") return "sample";
  return series.endsWith("_raw") ? "observed" : "harmonized";
}

/** Rank helper: descending total, earlier first on ties. */
const byTotal = (a, b) => b.total - a.total || a.key.localeCompare(b.key);

/**
 * @param {object} daily daily.json
 * @param {{ lens?: string, from: string, to: string }} opts
 */
export function computeRange(daily, { lens = "harmonized", from, to }) {
  const { lens: used, fellBack } = resolveDailyLens(daily, lens);
  const dataFirst = daily.start;
  const dataLast = addDays(daily.start, daily.n_days - 1);
  const wantFrom = isIsoDate(from) ? from : dataFirst;
  const wantTo = isIsoDate(to) ? to : dataLast;
  const f = wantFrom < dataFirst ? dataFirst : wantFrom;
  const t = wantTo > dataLast ? dataLast : wantTo;
  const clipped = f !== wantFrom || t !== wantTo;

  const unitSeries = used === "naive_splice" ? "aqua_raw" : used;
  const unit = daily.series[unitSeries]?.unit ?? null;
  const base = {
    lens: used, requestedLens: lens, fellBack, unit, from: f, to: t, clipped, dataFirst, dataLast,
  };
  if (f > t) {
    return { ...base, empty: true, nDays: 0, nWithData: 0, nMissing: 0, total: null, lo: null, hi: null, kinds: [],
      busiestDay: null, months: [], years: [], topMonths: [], topYears: [], busiestMonth: null, busiestYear: null, meanPerYear: null };
  }

  const kindOf = makeKindLookup(daily);
  const i0 = daysBetween(dataFirst, f);
  const i1 = daysBetween(dataFirst, t);
  const months = new Map();
  const years = new Map();
  const kinds = new Set();
  let total = 0, lo = 0, hi = 0, nWithData = 0, nMissing = 0;
  let busiestDay = null;

  for (let i = i0; i <= i1; i++) {
    const iso = addDays(dataFirst, i);
    const y = Number(iso.slice(0, 4));
    const m = Number(iso.slice(5, 7));
    const name = seriesNameAt(used, y);
    const s = daily.series[name];
    const v = s?.value?.[i];
    const mk = `${iso.slice(0, 7)}`;
    if (!months.has(mk)) months.set(mk, { key: mk, year: y, month: m, total: 0, lo: 0, hi: 0, days: 0, inRange: 0 });
    if (!years.has(y)) years.set(y, { key: String(y), year: y, total: 0, lo: 0, hi: 0, days: 0, inRange: 0 });
    const M = months.get(mk);
    const Y = years.get(y);
    M.inRange++;
    Y.inRange++;
    if (v === null || v === undefined) {
      nMissing++;
      continue;
    }
    const vlo = s.lo?.[i] ?? v;
    const vhi = s.hi?.[i] ?? v;
    nWithData++;
    total += v; lo += vlo; hi += vhi;
    M.total += v; M.lo += vlo; M.hi += vhi; M.days++;
    Y.total += v; Y.lo += vlo; Y.hi += vhi; Y.days++;
    kinds.add(kindOf(name, iso)?.kind ?? fallbackKind(daily, name));
    if (!busiestDay || v > busiestDay.value) busiestDay = { date: iso, value: v };
  }

  // Coverage is measured against the whole calendar month / year, so a month or year cut by the range is incomplete.
  const monthList = [...months.values()].map((M) => {
    const coverage = M.days / daysInMonth(M.year, M.month);
    return { ...M, coverage, complete: coverage >= MONTH_MIN_COVERAGE };
  });
  const yearList = [...years.values()].map((Y) => {
    const coverage = Y.days / daysInYear(Y.year);
    const fullyInside = Y.inRange === daysInYear(Y.year);
    return { ...Y, coverage, fullyInside, complete: coverage >= YEAR_MIN_COVERAGE };
  });
  const topMonths = monthList.filter((x) => x.complete).sort(byTotal).slice(0, 5);
  const topYears = yearList.filter((x) => x.complete).sort(byTotal).slice(0, 5);
  const meanYears = yearList.filter((x) => x.fullyInside && x.complete);
  const meanPerYear = meanYears.length
    ? {
        value: meanYears.reduce((a, x) => a + x.total, 0) / meanYears.length,
        lo: meanYears.reduce((a, x) => a + x.lo, 0) / meanYears.length,
        hi: meanYears.reduce((a, x) => a + x.hi, 0) / meanYears.length,
        years: meanYears.map((x) => x.year),
      }
    : null;

  const order = ["observed", "harmonized", "estimated", "sample"];
  return {
    ...base,
    empty: false,
    nDays: i1 - i0 + 1,
    nWithData,
    nMissing,
    total: nWithData ? total : null,
    lo: nWithData ? lo : null,
    hi: nWithData ? hi : null,
    kinds: [...order.filter((k) => kinds.has(k)), ...(nMissing ? ["missing"] : [])],
    busiestDay,
    months: monthList,
    years: yearList,
    topMonths,
    topYears,
    busiestMonth: topMonths[0] ?? null,
    busiestYear: topYears[0] ?? null,
    meanPerYear,
  };
}

/** Quick presets, relative to the last data day L (contracts section 7 bounds: 2003-01-01 to L). */
export const PRESETS = [
  { id: "all", label: "All years" },
  { id: "last10", label: "Last 10 years" },
  { id: "viirs", label: "VIIRS era 2012+" },
  { id: "this_year", label: "This year" },
  { id: "last12m", label: "Last 12 months" },
];

function minusYears(iso, n) {
  const y = Number(iso.slice(0, 4)) - n;
  const md = iso.slice(5);
  // 29 Feb in a non-leap target year becomes 28 Feb.
  const safe = md === "02-29" && daysInYear(y) === 365 ? "02-28" : md;
  return `${y}-${safe}`;
}

function minusMonths(iso, n) {
  let y = Number(iso.slice(0, 4));
  let m = Number(iso.slice(5, 7)) - n;
  while (m < 1) { m += 12; y -= 1; }
  const d = Math.min(Number(iso.slice(8, 10)), daysInMonth(y, m));
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** @returns {{ from: string, to: string }} */
export function presetRange(id, lastDataDay) {
  const L = lastDataDay;
  const clampFrom = (s) => (s < FIRST_DAY ? FIRST_DAY : s);
  switch (id) {
    case "last10": return { from: clampFrom(addDays(minusYears(L, 10), 1)), to: L };
    case "viirs": return { from: "2012-01-01", to: L };
    case "this_year": return { from: `${L.slice(0, 4)}-01-01`, to: L };
    case "last12m": return { from: clampFrom(addDays(minusMonths(L, 12), 1)), to: L };
    case "all":
    default: return { from: FIRST_DAY, to: L };
  }
}

export function activePreset(range, lastDataDay) {
  return PRESETS.find((p) => {
    const r = presetRange(p.id, lastDataDay);
    return r.from === range.from && r.to === range.to;
  })?.id ?? null;
}
