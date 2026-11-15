/**
 * "Latest year in the record" for the landing page's bottom card (when there is no recent satellite data).
 * Pure helpers: every value comes from regions.json, trend.json, weekly.json and nowcast.json; nothing is typed.
 */

/** The latest complete year: the year of last_data_day if that day is 31 December, otherwise the year before. */
export function latestCompleteYear(lastDataDay) {
  if (typeof lastDataDay !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(lastDataDay)) return null;
  const year = Number(lastDataDay.slice(0, 4));
  return lastDataDay.slice(5) === "12-31" ? year : year - 1;
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * That year's harmonized annual value, and the median of the baseline years for comparison. If the year is itself a
 * baseline year it is left out of the comparison ("the other baseline years").
 * @param {object[]} annual trend.json annual rows
 * @param {number} year
 * @param {[number, number] | null} baselineYears
 * @returns {{ row: object, median: number | null, n: number, baseline: [number, number] | null, others: boolean } | null}
 */
export function compareWithBaseline(annual, year, baselineYears) {
  const row = (annual || []).find(
    (r) => r.year === year && r.harmonized !== null && r.harmonized !== undefined,
  );
  if (!row) return null;
  if (!Array.isArray(baselineYears) || baselineYears.length !== 2) {
    return { row, median: null, n: 0, baseline: null, others: false };
  }
  const [b0, b1] = baselineYears;
  const values = (annual || [])
    .filter((r) => r.year >= b0 && r.year <= b1 && r.year !== year)
    .map((r) => r.harmonized)
    .filter((v) => typeof v === "number" && Number.isFinite(v));
  return {
    row,
    median: median(values),
    n: values.length,
    baseline: [b0, b1],
    others: year >= b0 && year <= b1,
  };
}

/**
 * The year's weekly harmonized values, one slot per week (52, or 53 if the file has week 53). A missing week is
 * null (drawn hatched), never zero.
 */
export function weekStrip(rows, year) {
  const byWeek = new Map(
    (rows || []).filter((r) => r.series === "harmonized" && r.year === year).map((r) => [r.week, r]),
  );
  const weeks = byWeek.has(53) ? 53 : 52;
  return Array.from({ length: weeks }, (_, i) => {
    const r = byWeek.get(i + 1);
    const v = r && typeof r.value === "number" ? r.value : null;
    return { week: i + 1, value: v, kind: v === null ? "missing" : r.kind };
  });
}
