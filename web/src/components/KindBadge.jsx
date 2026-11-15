import { Badge } from "@/components/ui/badge";
import { KIND_INFO } from "@/lib/glossary.js";
import { useViz } from "@/components/Viz.jsx";

/** R6's KindBadge when it exists; until then (or while it loads) a plain text badge: kind as words, never colour alone. */
export default function KindBadge({ kind }) {
  const viz = useViz();
  if (viz?.KindBadge) return <viz.KindBadge kind={kind} />;
  const info = KIND_INFO[kind];
  return (
    <Badge variant="outline" title={info?.text} data-kind={kind}>
      {info?.label ?? kind}
    </Badge>
  );
}
