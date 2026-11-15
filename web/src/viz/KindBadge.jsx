// KindBadge (spec §9.6, prompt B3): a small label for a value's kind. Icon + text + border style
// all differ per kind, so the kind never depends on colour alone.

import { ArrowLeftRight, Ban, CircleDashed, FlaskConical, Satellite } from "lucide-react";
import { KIND_STYLE } from "./theme";

/** Per kind: icon, border style, and background. Hatched background for "no data", as in the charts. */
const LOOK = {
  observed: { Icon: Satellite, border: "1px solid var(--fr-border)", background: "var(--fr-surface)" },
  harmonized: { Icon: ArrowLeftRight, border: "1px solid var(--fr-accent)", background: "var(--fr-surface)" },
  estimated: {
    Icon: CircleDashed,
    border: "1px dashed var(--fr-estimate-stroke)",
    background: "var(--fr-surface)",
  },
  missing: {
    Icon: Ban,
    border: "1px solid var(--fr-border)",
    background:
      "repeating-linear-gradient(45deg, var(--fr-hatch-bg) 0 4px, color-mix(in srgb, var(--fr-hatch-line) 45%, transparent) 4px 5px)",
  },
  sample: { Icon: FlaskConical, border: "1px dotted var(--fr-warning)", background: "var(--fr-surface)" },
};

/** @param {import("./types").KindBadgeProps} props */
export function KindBadge({ kind }) {
  const style = KIND_STYLE[kind];
  const look = LOOK[kind] ?? LOOK.observed;
  const { Icon } = look;
  return (
    <span
      className="fr-kind-badge"
      data-kind={kind}
      title={style?.description}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 8px 1px 6px",
        border: look.border,
        borderRadius: kind === "estimated" ? "var(--fr-radius-sm)" : "var(--fr-radius-pill)",
        background: look.background,
        color: "var(--fr-text)",
        fontFamily: "var(--fr-font-sans)",
        fontSize: "var(--fr-text-xs)",
        lineHeight: 1.5,
        whiteSpace: "nowrap",
      }}
    >
      <Icon aria-hidden="true" focusable="false" size={12} strokeWidth={2} />
      {style?.label ?? kind}
    </span>
  );
}
