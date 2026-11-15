/**
 * One-page guard for the Season Brief. The page box is the smaller of A4 and US Letter with 12 mm margins:
 * 186 mm x 255 mm. If the content is taller, it is scaled down to fit (never up, never below MIN_SCALE).
 */
export const PRINT_HEIGHT_MM = 255;
export const MIN_SCALE = 0.75;
export const PX_PER_MM = 96 / 25.4;

/** Scale factor that fits `contentPx` CSS pixels into one page; 1 when it already fits. */
export function fitScale(contentPx, pageMm = PRINT_HEIGHT_MM) {
  const contentMm = contentPx / PX_PER_MM;
  if (!(contentMm > pageMm)) return 1;
  return Math.max(MIN_SCALE, Math.floor((pageMm / contentMm) * 1000) / 1000);
}
