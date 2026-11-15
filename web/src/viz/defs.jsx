// Shared SVG <defs>. Put <VizDefs /> as the first child of every chart's root <svg>, so an
// exported SVG carries its own hatch pattern. Duplicate ids across charts are harmless here:
// every copy is identical.

export const HATCH_ID = "fr-hatch";

export function VizDefs() {
  return (
    <defs>
      {/* No data: 45° hatch, 1 px lines in the muted colour on the background colour. */}
      <pattern id={HATCH_ID} patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
        <rect width={6} height={6} style={{ fill: "var(--fr-hatch-bg)" }} />
        <line x1={0} y1={0} x2={0} y2={6} style={{ stroke: "var(--fr-hatch-line)", strokeWidth: 1 }} />
      </pattern>
    </defs>
  );
}
