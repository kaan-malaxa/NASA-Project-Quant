import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import SectionState from "@/components/SectionState.jsx";
import KindBadge from "@/components/KindBadge.jsx";
import { VizSlot } from "@/components/Viz.jsx";
import { sensorLabel } from "@/lib/labels.js";
import StorySection from "./StorySection.jsx";

/** Screen 7 · Where: HexMap with a critical-weeks / all-year toggle. Drawing an area comes in prompt D1. */
export default function WhereSection({ hex, outline, aoi, setUrl }) {
  const [metric, setMetric] = useState("critical");
  return (
    <StorySection id="where" title="Where it burns">
      <SectionState state={hex} title="Map" skeletonClassName="h-80">
        {(h) => (
          <div className="space-y-3">
            <ToggleGroup
              type="single"
              variant="outline"
              aria-label="Map shows"
              value={metric}
              onValueChange={(v) => v && setMetric(v)}
              className="flex flex-wrap justify-start"
            >
              <ToggleGroupItem value="critical">Critical weeks</ToggleGroupItem>
              <ToggleGroupItem value="all_year">All year</ToggleGroupItem>
            </ToggleGroup>
            <VizSlot
              name="HexMap"
              hex={h}
              outline={outline?.status === "ok" ? outline.data : undefined}
              metric={metric}
              selectedCells={aoi}
              drawEnabled={false}
              onAoiChange={(cells) => setUrl({ aoi: cells })}
              placeholderClassName="h-80"
            />
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span>
                {h.unit}, mean of {h.years[0]}–{h.years[1]}, from {sensorLabel(h.source)}.
              </span>
              <KindBadge kind={h.kind} />
            </p>
          </div>
        )}
      </SectionState>
    </StorySection>
  );
}
