// Shared SVG <defs>. Put <VizDefs /> as the first child of every chart's root <svg>, so an
// exported SVG carries its own hatch pattern. Duplicate ids across charts are harmless here:
// every copy is identical.

export const HATCH_ID = "fr-hatch";

export function VizDefs() {
  return (
    <defs>
      {/* No data: 45° hatch, 1 px lines in the muted colour on the background colour. Lines 4 px apart
          (was 6): a ~10 px clock cell showed a single line and read as blank, especially in print (E1). */}
      <pattern id={HATCH_ID} patternUnits="userSpaceOnUse" width={4} height={4} patternTransform="rotate(45)">
        <rect width={4} height={4} style={{ fill: "var(--fr-hatch-bg)" }} />
        <line x1={0} y1={0} x2={0} y2={4} style={{ stroke: "var(--fr-hatch-line)", strokeWidth: 1 }} />
      </pattern>
    </defs>
  );
}
