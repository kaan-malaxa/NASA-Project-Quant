// Pure layout helpers for BrokenRuler (no React, no DOM), unit-tested in __tests__/rulerLayout.test.js.

import { formatNumber } from "./format";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Rows sorted by year (copy). */
export function sortRows(rows) {
  return [...(rows ?? [])].sort((a, b) => a.year - b.year);
}

/**
 * The year the naive record switches sensor: the first row whose naive_source differs from the
 * previous row's. Read from the data (SD-09 splice), never hard-coded. null if there is no switch.
 */
export function switchYear(rows) {
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].naive_source !== rows[i - 1].naive_source)
      return { year: rows[i].year, source: rows[i].naive_source };
  }
  return null;
}

/** Year ticks every 5 years (multiples of 5). Falls back to the first/last year when that gives fewer than 2. */
export function yearTicks(first, last) {
  const ticks = [];
  for (let y = Math.ceil(first / 5) * 5; y <= last; y += 5) ticks.push(y);
  if (ticks.length >= 2) return ticks;
  return first === last ? [first] : [first, last];
}

/** Top of the index axis: the largest index × 1.1, at least 1.2 so the 1.0 line is never at the top. */
export function indexDomainMax(rows) {
  let max = 0;
  for (const r of rows) {
    if (isNum(r.naive_index)) max = Math.max(max, r.naive_index);
    if (isNum(r.harmonized_index)) max = Math.max(max, r.harmonized_index);
  }
  return Math.max(1.2, max * 1.1);
}

/**
 * Split the harmonized line into runs of estimated / not-estimated rows. Each run after the first
 * starts with the previous run's last row, so the drawn segments join without a gap.
 */
export function harmonizedSegments(rows) {
  const out = [];
  for (const r of rows) {
    const est = r.kind === "estimated";
    const cur = out[out.length - 1];
    if (cur && cur.estimated === est) cur.rows.push(r);
    else out.push({ estimated: est, rows: cur ? [cur.rows[cur.rows.length - 1], r] : [r] });
  }
  return out;
}

/** Runs of consecutive years with no data at all (kind missing, or both indices null). */
export function missingRuns(rows) {
  const runs = [];
  for (const r of rows) {
    const missing = r.kind === "missing" || (!isNum(r.naive_index) && !isNum(r.harmonized_index));
    if (!missing) continue;
    const last = runs[runs.length - 1];
    if (last && last.to === r.year - 1) last.to = r.year;
    else runs.push({ from: r.year, to: r.year });
  }
  return runs;
}

/** Indexes of defined values with no defined neighbour (a line cannot show them; draw a dot). */
export function isolatedIndexes(values) {
  const out = [];
  values.forEach((v, i) => {
    if (!isNum(v)) return;
    if (!isNum(values[i - 1] ?? null) && !isNum(values[i + 1] ?? null)) out.push(i);
  });
  return out;
}

/** Last defined value of a series, or null. */
export function lastDefined(items, get) {
  for (let i = items.length - 1; i >= 0; i--) if (isNum(get(items[i]))) return items[i];
  return null;
}

/**
 * Push label y positions apart so none are closer than `gap`, keeping them inside [lo, hi].
 * Returns positions in the input order.
 */
export function separateLabels(ys, gap, lo, hi) {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k++) order[k].y = Math.max(order[k].y, order[k - 1].y + gap);
  const overflow = order.length ? order[order.length - 1].y - hi : 0;
  if (overflow > 0) for (const o of order) o.y -= overflow;
  for (let k = 0; k < order.length; k++)
    order[k].y = Math.max(order[k].y, k === 0 ? lo : order[k - 1].y + gap);
  const out = new Array(ys.length);
  for (const o of order) out[o.i] = o.y;
  return out;
}

/** The "×{value}" annotation and its tooltip, or null when the file has no usable jump multiple. */
export function jumpLabel(j) {
  if (!j || !isNum(j.value) || j.value <= 0) return null;
  const v = formatNumber(j.value, 1);
  const range =
    isNum(j.lo) && isNum(j.hi) && j.lo !== j.hi
      ? `, range ${formatNumber(j.lo, 1)}–${formatNumber(j.hi, 1)}`
      : "";
  const years = j.years ? `, ${j.years[0]}–${j.years[1]}` : "";
  return {
    text: `×${v}`,
    title: `Jump multiple ×${v}${range}${years}. ${j.definition ?? ""}`.trim(),
  };
}

/** Accessible name: the pipeline's sentence; a data-derived fallback when it is absent or a placeholder. */
export function rulerAriaLabel(ruler, rows) {
  const s = ruler?.sentence?.trim();
  if (s && s !== "…" && s !== "...") return s;
  const base = ruler?.index_base_years;
  const span = rows.length ? `, ${rows[0].year} to ${rows[rows.length - 1].year}` : "";
  const baseText = base ? ` (1 = the ${base[0]}–${base[1]} average)` : "";
  return rows.length
    ? `Raw record, as downloaded, compared with the harmonized record as indices${baseText}${span}.`
    : "Raw record compared with the harmonized record: no data.";
}
