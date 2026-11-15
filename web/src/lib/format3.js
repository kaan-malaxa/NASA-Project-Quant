const nf3 = new Intl.NumberFormat("en", { maximumFractionDigits: 3 });
const nfInt = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

/** Up to 3 decimals (the precision of every pipeline number). */
export function fmt3(v) {
  return v === null || v === undefined || Number.isNaN(v) ? "—" : nf3.format(v);
}

/** Whole numbers with thousands separators. */
export function fmtInt(v) {
  return v === null || v === undefined || Number.isNaN(v) ? "—" : nfInt.format(v);
}
