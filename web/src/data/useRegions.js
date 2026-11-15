import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useJson } from "./useJson.js";
import { isDebug } from "./debug.js";

/** Regions visible to this viewer: synthetic regions hidden unless ?debug=1. */
export function visibleRegions(regions, debug) {
  return (regions || []).filter((r) => debug || r.synthetic !== true);
}

/**
 * @returns {{ state: import("./state.js").FileState, regions: import("./types.gen").RegionsJson["regions"], defaultRegion: import("./types.gen").RegionsJson["regions"][number] | null, debug: boolean }}
 */
export function useRegions() {
  const { search } = useLocation();
  const debug = isDebug(search);
  const state = useJson("regions.json");
  const regions = useMemo(
    () => (state.status === "ok" ? visibleRegions(state.data.regions, debug) : []),
    [state, debug],
  );
  // Default region = first non-synthetic region (R5 prompt B1).
  const defaultRegion = state.status === "ok" ? state.data.regions.find((r) => r.synthetic !== true) || null : null;
  return { state, regions, defaultRegion, debug };
}
