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

/** Bytes in words: "512 bytes", "12.3 kB", "4.6 MB" (1 kB = 1000 bytes). */
export function fmtBytes(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "size unknown";
  if (n < 1000) return `${n} bytes`;
  if (n < 1e6) return `${(n / 1e3).toFixed(1)} kB`;
  if (n < 1e9) return `${(n / 1e6).toFixed(1)} MB`;
  return `${(n / 1e9).toFixed(2)} GB`;
}
