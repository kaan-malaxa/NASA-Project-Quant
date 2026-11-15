/** Resolve an analysis interval independently of exact-date selection. */
export function analysisYears(index, from, to) {
  if (!index?.default_years) return [undefined, undefined];
  const first = from == null ? index.default_years[0] : Number(from);
  const last = to == null ? index.default_years[1] : Number(to);
  if (!index.available_years.includes(first) || !index.available_years.includes(last) || first > last) return index.default_years;
  return [first, last];
}
