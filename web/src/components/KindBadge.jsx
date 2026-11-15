import { Badge } from "@/components/ui/badge";
import { KIND_INFO } from "@/lib/glossary.js";

/*
 * Uses R6's KindBadge from "@/viz" (contracts section 8) as soon as it exists. Until then a plain text badge is
 * shown, so the kind is always readable as words, never colour alone. The glob returns {} when viz/index is absent,
 * so the build never breaks on a missing folder.
 */
const vizModules = import.meta.glob("../viz/index.{js,jsx,ts,tsx}", { eager: true });
const VizKindBadge = Object.values(vizModules)[0]?.KindBadge;

export default function KindBadge({ kind }) {
  if (VizKindBadge) return <VizKindBadge kind={kind} />;
  const info = KIND_INFO[kind];
  return (
    <Badge variant="outline" title={info?.text} data-kind={kind}>
      {info?.label ?? kind}
    </Badge>
  );
}
