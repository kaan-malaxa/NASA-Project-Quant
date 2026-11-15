import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GLOSSARY } from "@/lib/glossary.js";

/**
 * A technical term with a dotted underline and a hover / focus definition from lib/glossary.js.
 * <GlossaryTerm term="fire_cell_day">fire cell-days</GlossaryTerm>
 */
export default function GlossaryTerm({ term, children }) {
  const entry = GLOSSARY[term];
  if (!entry) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="cursor-help underline decoration-dotted underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {children ?? entry.term}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-sm leading-snug">
        <span className="font-semibold">{entry.term}: </span>
        {entry.text}
      </TooltipContent>
    </Tooltip>
  );
}
