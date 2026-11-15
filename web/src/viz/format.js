// Number and date formatters for chart labels, tooltips and aria-labels.
// All dates are UTC. Week numbers follow SD-08: week = min(52, (doy − 1) // 7 + 1).

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const NO_DATA_TEXT = "no data";
const MINUS = "−";
const EN_DASH = "–";

/** Month name for 1–12. */
export function monthName(month, style = "long") {
  const names = style === "long" ? MONTHS_LONG : MONTHS_SHORT;
  return names[month - 1] ?? "";
}

// ---- numbers --------------------------------------------------------------------------

const fmtCache = new Map();
function nf(maxFractionDigits) {
  const key = String(maxFractionDigits);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en", { maximumFractionDigits: maxFractionDigits, minimumFractionDigits: 0 });
    fmtCache.set(key, f);
  }
  return f;
}

/**
 * A value for display. null/undefined/NaN → "no data" (missing is never shown as 0).
 * Precision adapts to size: ≥ 100 → whole numbers, ≥ 10 → 1 decimal, otherwise 2 decimals.
 */
export function formatNumber(value, maxFractionDigits) {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_DATA_TEXT;
  const abs = Math.abs(value);
  const digits = maxFractionDigits ?? (abs >= 100 ? 0 : abs >= 10 ? 1 : 2);
  return nf(digits).format(value).replace("-", MINUS);
}

/** "812 Aqua-equivalent fire cell-days per week" or "no data". */
export function formatValue(value, unit) {
  const n = formatNumber(value);
  return n === NO_DATA_TEXT ? n : `${n} ${unit}`;
}

/** "700–900", or "" when lo and hi are equal or either is missing. */
export function formatRange(lo, hi) {
  if (lo === null || lo === undefined || hi === null || hi === undefined) return "";
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) return "";
  return `${formatNumber(lo)}${EN_DASH}${formatNumber(hi)}`;
}

/** Signed percentage with a true minus sign: "+12%", "−3.5%", "0%". */
export function formatSignedPercent(value, maxFractionDigits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_DATA_TEXT;
  const body = nf(maxFractionDigits).format(Math.abs(value));
  if (body === "0") return "0%";
  return `${value > 0 ? "+" : MINUS}${body}%`;
}

/** English ordinal of an integer: 1st, 2nd, 3rd, 11th, 22nd. */
export function ordinal(n) {
  const i = Math.round(n);
  const mod100 = i % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${i}th`;
  switch (i % 10) {
    case 1:
      return `${i}st`;
    case 2:
      return `${i}nd`;
    case 3:
      return `${i}rd`;
    default:
      return `${i}th`;
  }
}

/** "96th percentile" (rounded to a whole number) or "no data". */
export function formatPercentile(p) {
  if (p === null || p === undefined || !Number.isFinite(p)) return NO_DATA_TEXT;
  return `${ordinal(Math.round(p))} percentile`;
}

// ---- dates ----------------------------------------------------------------------------

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year) {
  return isLeapYear(year) ? 366 : 365;
}

/** Day of year (1-based) → "YYYY-MM-DD" (UTC). */
export function doyToIso(year, doy) {
  const d = new Date(Date.UTC(year, 0, 1));
  d.setUTCDate(doy);
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → day of year (1-based). */
export function isoToDoy(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000) + 1;
}

/** SD-08 week number for a day of year. */
export function weekOfDoy(doy) {
  return Math.min(52, Math.floor((doy - 1) / 7) + 1);
}

/** First and last date of an SD-08 week. Week 52 runs to 31 December (8 days, 9 in leap years). */
export function weekDateRange(year, week) {
  const startDoy = (week - 1) * 7 + 1;
  const endDoy = week >= 52 ? daysInYear(year) : startDoy + 6;
  return { from: doyToIso(year, startDoy), to: doyToIso(year, endDoy) };
}

/** "2026-11-14" → "14 Nov 2026"; with year=false → "14 Nov". */
export function formatDate(iso, withYear = true) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return withYear ? `${d} ${monthName(m, "short")} ${y}` : `${d} ${monthName(m, "short")}`;
}

/** "14–20 Oct", "28 Oct – 3 Nov", "24–31 Dec" (no year). */
export function formatWeekShort(year, week) {
  const { from, to } = weekDateRange(year, week);
  const [, fm, fd] = from.split("-").map(Number);
  const [, tm, td] = to.split("-").map(Number);
  if (fm === tm) return `${fd}${EN_DASH}${td} ${monthName(tm, "short")}`;
  return `${fd} ${monthName(fm, "short")} ${EN_DASH} ${td} ${monthName(tm, "short")}`;
}

/** "14–20 Oct 2026", "28 Oct – 3 Nov 2026", "24–31 Dec 2023". */
export function formatWeek(year, week) {
  return `${formatWeekShort(year, week)} ${year}`;
}

/** Day of year (in a non-leap reference year) → "31 Oct". For season timing labels across years. */
export function formatDoy(doy) {
  return formatDate(doyToIso(2001, Math.round(doy)), false);
}

/**
 * A week of year in words, from the middle day of the week in a non-leap reference year:
 * days 1–10 "early", 11–20 "mid", 21+ "late". Example: week 43 → "late October".
 */
export function weekToPhrase(week) {
  const { from } = weekDateRange(2001, week);
  const middleDoy = isoToDoy(from) + 3;
  const [, m, d] = doyToIso(2001, middleDoy).split("-").map(Number);
  const part = d <= 10 ? "early" : d <= 20 ? "mid" : "late";
  return `${part} ${monthName(m)}`;
}
