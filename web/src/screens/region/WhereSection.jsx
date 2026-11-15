import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import SectionState from "@/components/SectionState.jsx";
import KindBadge from "@/components/KindBadge.jsx";
import { VizSlot } from "@/components/Viz.jsx";
import { sensorLabel } from "@/lib/labels.js";
import StorySection from "./StorySection.jsx";
import AoiPanel from "./AoiPanel.jsx";

/** Screen 7 · Where: HexMap with a critical-weeks / all-year toggle, and the draw-your-own-area lens (D1). */
export default function WhereSection({ region, files, url, setUrl }) {
  const { hex, outline } = files;
  const [metric, setMetric] = useState("critical");
  // The draw control exists only when cells_monthly.csv is listed for this region.
  const canDraw = files.cells_monthly?.status === "lazy" || files.cells_monthly?.status === "ok";
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
              selectedCells={url.aoi}
              drawEnabled={canDraw}
              onAoiChange={(cells) => setUrl({ aoi: cells })}
              placeholderClassName="h-80"
            />
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span>
                {h.unit}, mean of {h.years[0]}–{h.years[1]}, from {sensorLabel(h.source)}.
              </span>
              <KindBadge kind={h.kind} />
            </p>
            {canDraw && !url.aoi.length ? (
              <p className="text-muted-foreground text-sm">
                Draw a rectangle or click hexagons on the map to see the record for your own area.
              </p>
            ) : null}
          </div>
        )}
      </SectionState>
      {url.aoi.length ? <AoiPanel region={region} files={files} url={url} setUrl={setUrl} /> : null}
    </StorySection>
  );
}
