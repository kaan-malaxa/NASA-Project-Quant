import { useEffect, useRef, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import SectionState from "@/components/SectionState.jsx";
import KindBadge from "@/components/KindBadge.jsx";
import { VizSlot } from "@/components/Viz.jsx";
import { sensorLabel } from "@/lib/labels.js";
import StorySection from "./StorySection.jsx";
import AoiPanel from "./AoiPanel.jsx";
import { useSpatialShards } from "@/data/useSpatialShards.js";
import { spatialMap } from "@/lib/spatial.js";

/** Screen 7 · Where: HexMap with a critical-weeks / all-year toggle, and the draw-your-own-area lens (D1). */
export default function WhereSection({ region, files, url, setUrl }) {
  const { hex: canonicalHex, outline } = files;
  const marker = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setVisible(true); });
    if (marker.current) observer.observe(marker.current);
    return () => observer.disconnect();
  }, []);
  const rows = files.monthly?.data?.rows ?? [];
  const years = rows.length ? [Math.min(...rows.map((row) => row.year)), Math.max(...rows.map((row) => row.year))] : [];
  const shards = useSpatialShards(region.id, files.spatial_index, years, visible);
  const hex = files.spatial_index?.status === "absent" ? canonicalHex : shards.status === "ok" ?
    {status: "ok", data: spatialMap(shards.data, url.lens, files.season?.data?.critical_weeks ?? [], canonicalHex?.data)} :
    visible ? shards : {status: "loading"};
  const [metric, setMetric] = useState("critical");
  // The draw control exists only when cells_monthly.csv is listed for this region.
  const canDraw = files.spatial_index?.status === "ok";
  return (
    <StorySection id="where" title="Where it burns">
      <span ref={marker} />
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
            <p className="text-muted-foreground text-sm">{h.coverage_note}</p>
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
