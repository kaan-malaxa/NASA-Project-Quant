/**
 * CSV exports built in the browser (contracts section 7, downloads 1 and 2). Pure; no DOM.
 * The first line of every file is a comment row that explains the file.
 */
import { addDays, daysBetween, fallbackKind, makeKindLookup, resolveDailyLens, seriesNameAt } from "./range.js";
import { seriesForLens } from "./lenses.js";

/** One CSV field: empty for null/undefined; quoted (with doubled quotes) when it holds , " or a line break. */
export function csvField(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvLine = (fields) => fields.map(csvField).join(",");

/** "# FireRosetta <code_version> <generated_at> region=<id> lens=<lens> unit=<unit> source=NASA FIRMS" */
export function commentRow({ code_version, generated_at, region, lens, unit }) {
  const u = unit && /[",\r\n]/.test(unit) ? `"${unit.replace(/"/g, '""')}"` : unit ?? "";
  return `# FireRosetta ${code_version ?? "unknown"} ${generated_at ?? "unknown"} region=${region} lens=${lens} unit=${u} source=NASA FIRMS`;
}

/** firerosetta_<region>_<lens>_<from>_<to>[_<suffix>].<ext> */
export function exportFileName({ region, lens, from, to, suffix = undefined, ext }) {
  return ["firerosetta", region, lens, from, to, suffix].filter(Boolean).join("_") + `.${ext}`;
}

/**
 * One line per day in the range (clipped to the data):
 * date,series,value,lo,hi,kind,source,unit. Missing days have empty value/lo/hi and kind "missing".
 * Lenses not in daily.json fall back to harmonized (the comment row and the series column say which).
 */
export function buildSeriesCsv(daily, lens, range) {
  const { lens: used } = resolveDailyLens(daily, lens);
  const dataLast = addDays(daily.start, daily.n_days - 1);
  const from = range.from < daily.start ? daily.start : range.from;
  const to = range.to > dataLast ? dataLast : range.to;
  const kindOf = makeKindLookup(daily);
  const unitOf = (name) => daily.series[name]?.unit ?? "";
  const lines = [
    commentRow({ ...daily, region: daily.region, lens: used, unit: unitOf(used === "naive_splice" ? "aqua_raw" : used) }),
    "date,series,value,lo,hi,kind,source,unit",
  ];
  if (from > to) return lines.join("\n") + "\n";
  const i0 = daysBetween(daily.start, from);
  const i1 = daysBetween(daily.start, to);
  for (let i = i0; i <= i1; i++) {
    const date = addDays(daily.start, i);
    const name = seriesNameAt(used, Number(date.slice(0, 4)));
    const s = daily.series[name];
    const v = s?.value?.[i];
    if (v === null || v === undefined) {
      lines.push(csvLine([date, name, null, null, null, "missing", null, unitOf(name)]));
      continue;
    }
    const run = kindOf(name, date);
    lines.push(
      csvLine([date, name, v, s.lo ? s.lo[i] : null, s.hi ? s.hi[i] : null, run?.kind ?? fallbackKind(daily, name), run?.source ?? null, unitOf(name)]),
    );
  }
  return lines.join("\n") + "\n";
}

const MONTH_COLS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEK_COLS = Array.from({ length: 52 }, (_, i) => `w${String(i + 1).padStart(2, "0")}`);

/**
 * The calendar on screen as a table: one row per year that overlaps the range, a leading "year" column, 52 week or
 * 12 month value columns (empty = no data), and a trailing "kinds" column listing the kinds in that row so estimated
 * and harmonized values stay distinguishable from observed ones.
 * @param {"week" | "month"} grain
 * @param {import("../data/types").SeriesJson} table weekly.json or monthly.json
 */
export function buildCalendarCsv(grain, table, lens, range) {
  const n = grain === "week" ? 52 : 12;
  const cols = grain === "week" ? WEEK_COLS : MONTH_COLS;
  const y0 = Number(range.from.slice(0, 4));
  const y1 = Number(range.to.slice(0, 4));
  const unit = table.series_meta?.[seriesForLens(lens, y1)]?.unit ?? table.series_meta?.[lens]?.unit ?? "";
  const byKey = new Map();
  for (const r of table.rows || []) byKey.set(`${r.series}|${r.year}|${r[grain]}`, r);

  const lines = [commentRow({ ...table, lens, unit }), csvLine(["year", ...cols, "kinds"])];
  for (let y = y0; y <= y1; y++) {
    const kinds = new Set();
    const values = [];
    for (let s = 1; s <= n; s++) {
      const r = byKey.get(`${seriesForLens(lens, y)}|${y}|${s}`);
      if (!r || r.value === null || r.value === undefined) {
        values.push(null);
        if (r) kinds.add("missing");
        continue;
      }
      values.push(r.value);
      kinds.add(r.kind);
    }
    if (values.every((v) => v === null) && kinds.size === 0) continue; // year not in the file at all
    lines.push(csvLine([y, ...values, [...kinds].sort().join(";")]));
  }
  return lines.join("\n") + "\n";
}
