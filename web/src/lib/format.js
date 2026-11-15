/** Display formatting only; every value comes from the JSON files. */

const nf = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

export function fmtNumber(v, digits = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return "no data";
  return (digits === 0 ? nf0 : nf).format(v);
}

/** Signed percent, e.g. "+12.3%" / "−4%" / "0%". */
export function fmtSignedPct(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "no data";
  const s = nf.format(Math.abs(v));
  if (v > 0) return `+${s}%`;
  if (v < 0) return `−${s}%`;
  return `${s}%`;
}

export function fmtRangePct(lo, hi) {
  return `${fmtSignedPct(lo)} to ${fmtSignedPct(hi)}`;
}

/** 87 -> "87th", 1 -> "1st", 22 -> "22nd". */
export function ordinal(v) {
  const n = Math.round(v);
  const t = n % 100;
  const suffix = t >= 11 && t <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${suffix}`;
}

export function monthName(m, locale = "en") {
  return new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(Date.UTC(2001, m - 1, 1));
}

/** ISO timestamp -> { local: viewer's locale, utc: "YYYY-MM-DD HH:MM UTC" }. */
export function fmtAsOf(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { local: iso, utc: iso };
  return {
    local: d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
    utc: `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`,
  };
}
