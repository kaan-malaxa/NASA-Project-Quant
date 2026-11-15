/** Sum authoritative contributions; source selection and coverage scaling are performed in Python. */
export function spatialAreaSeries({ shards, cells, regionMonthly = undefined, lens = "harmonized" }) {
  const selected = new Set(cells);
  const out = [];
  for (const shard of shards ?? []) {
    const name = lens === "naive_splice" ? (shard.year < 2012 ? "aqua_raw" : "viirs_raw") : lens;
    const series = shard.series.indexOf(name);
    const totals = new Map();
    for (const [cell, month, which, value, lo, hi] of shard.monthly) {
      if (which !== series || !selected.has(shard.cells[cell])) continue;
      const sum = totals.get(month) ?? [0, 0, 0];
      sum[0] += value; sum[1] += lo ?? value; sum[2] += hi ?? value;
      totals.set(month, sum);
    }
    for (const bin of shard.monthly_bins.filter((bin) => bin.series === series)) {
      const missing = bin.value === null || bin.kind === "missing";
      const sums = totals.get(bin.month) ?? [0, 0, 0];
      out.push({year: shard.year, month: bin.month, value: missing ? null : sums[0],
        lo: missing ? null : sums[1], hi: missing ? null : sums[2], kind: bin.kind, source: bin.source});
    }
  }
  const years = regionMonthly?.rows?.length ? new Set(regionMonthly.rows.map((row) => row.year)) : null;
  return out.filter((row) => !years || years.has(row.year)).sort((a, b) => a.year - b.year || a.month - b.month);
}

/** Mean yearly map contributions, excluding years whose required bins are missing. */
export function spatialMap(shards, lens, criticalWeeks, header = {}) {
  const cells = new Map();
  let annualYears = 0;
  let criticalYears = 0;
  for (const shard of shards) {
    const name = lens === "naive_splice" ? (shard.year < 2012 ? "aqua_raw" : "viirs_raw") : lens;
    const series = shard.series.indexOf(name);
    const months = shard.monthly_bins.filter((bin) => bin.series === series);
    const weeks = shard.weekly_bins.filter((bin) => bin.series === series && criticalWeeks.includes(bin.week));
    const annualOk = months.length === 12 && months.every((bin) => bin.value !== null && bin.kind !== "missing");
    const criticalOk = criticalWeeks.length > 0 && weeks.length === criticalWeeks.length && weeks.every((bin) => bin.value !== null && bin.kind !== "missing");
    if (annualOk) annualYears++;
    if (criticalOk) criticalYears++;
    for (const [grain, enabled, metric] of [["monthly", annualOk, "all_year"], ["weekly", criticalOk, "critical"]]) {
      if (!enabled) continue;
      for (const [index, slot, which, value] of shard[grain]) {
        if (which !== series || (grain === "weekly" && !criticalWeeks.includes(slot))) continue;
        const cell = shard.cells[index];
        const row = cells.get(cell) ?? {h3: cell, critical: 0, all_year: 0};
        row[metric] += value;
        cells.set(cell, row);
      }
    }
  }
  const unit = lens === "viirs_equiv" ? "VIIRS-equivalent fire cell-days per year" :
    ["aqua_raw", "viirs_raw", "naive_splice"].includes(lens) ? "fire cell-days per year" : "Aqua-equivalent fire cell-days per year";
  return {...header, unit, source: lens, kind: lens === "viirs_equiv" ? "estimated" : ["harmonized", "viirs_as_aqua"].includes(lens) ? "harmonized" : "observed",
    years: shards.length ? [shards[0].year, shards.at(-1).year] : [],
    cells: [...cells.values()].map((row) => ({...row, all_year: annualYears ? row.all_year / annualYears : null,
      critical: criticalYears ? row.critical / criticalYears : null})),
    coverage_note: "Whole-region calibration; monthly and weekly coverage scaling. Years with missing required bins are excluded."};
}
