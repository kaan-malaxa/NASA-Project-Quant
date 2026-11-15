// Placeholder frame used by every component until its real implementation lands.
// Renders a real root <svg> (forwarded ref) so R5's export code works against stubs too.

import { forwardRef } from "react";

export const StubFrame = forwardRef(function StubFrame({ name, detail }, ref) {
  return (
    <svg
      ref={ref}
      className="fr-viz"
      viewBox="0 0 320 88"
      width="100%"
      role="img"
      aria-label={`${name} (placeholder): ${detail}`}
      data-stub={name}
      style={{ display: "block", maxWidth: 480 }}
    >
      <rect
        x={0.5}
        y={0.5}
        width={319}
        height={87}
        rx={8}
        style={{ fill: "var(--fr-surface)", stroke: "var(--fr-border)", strokeWidth: 1 }}
      />
      <text x={16} y={36} style={{ fill: "var(--fr-text)", fontSize: 16, fontWeight: 600 }}>
        {name}
      </text>
      <text x={16} y={62} style={{ fill: "var(--fr-muted)", fontSize: 12 }}>
        {detail}
      </text>
    </svg>
  );
});
