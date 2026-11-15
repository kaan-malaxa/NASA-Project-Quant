import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "./fetchJson.js";
import { LAZY_FILES, REGION_FILES, regionFilePath } from "./files.js";
import { LOADING, toFileState } from "./state.js";
import { useRegions } from "./useRegions.js";

/**
 * Initial state of every per-region file, from the region's `files` + `optional_files`.
 * Not listed -> absent; CSV -> lazy; JSON -> loading.
 */
export function initialFileStates(region) {
  const listed = new Set([...(region?.files || []), ...(region?.optional_files || [])]);
  const out = {};
  for (const name of Object.keys(REGION_FILES)) {
    if (!listed.has(name)) out[name] = { status: "absent", detail: "not listed in regions.json" };
    else out[name] = LAZY_FILES.has(name) ? { status: "lazy" } : LOADING;
  }
  return out;
}

/**
 * Loads every JSON file listed for one region. Each file has its own state, so one absent or invalid file
 * never blocks the others.
 * @param {string} regionId
 * @returns {{ status: "loading" | "ok" | "unknown_region" | "regions_failed", region: import("./types.gen").RegionsJson["regions"][number] | null,
 *             files: Record<string, import("./state.js").FileState>, regionsState: import("./state.js").FileState }}
 */
export function useRegionData(regionId) {
  const { state: regionsState, regions } = useRegions();
  const region = useMemo(() => regions.find((r) => r.id === regionId) || null, [regions, regionId]);
  // Loaded states, tagged with the region they belong to so a stale set is never shown for a new region.
  const [loaded, setLoaded] = useState({ regionId: null, files: {} });

  useEffect(() => {
    if (!region) return;
    let alive = true;
    const init = initialFileStates(region);
    setLoaded({ regionId: region.id, files: init });
    for (const [name, st] of Object.entries(init)) {
      if (st.status !== "loading") continue;
      fetchJson(regionFilePath(region.id, name)).then((r) => {
        if (alive) setLoaded((prev) => ({ regionId: region.id, files: { ...prev.files, [name]: toFileState(r) } }));
      });
    }
    return () => {
      alive = false;
    };
  }, [region]);

  // Every file always has a state: before the effect runs, the initial (loading / absent / lazy) states.
  const files = useMemo(() => {
    if (!region) return {};
    return loaded.regionId === region.id ? loaded.files : initialFileStates(region);
  }, [region, loaded]);

  /** @type {"loading" | "ok" | "unknown_region" | "regions_failed"} */
  let status = "loading";
  if (regionsState.status === "ok") status = region ? "ok" : "unknown_region";
  else if (regionsState.status !== "loading") status = "regions_failed";

  return { status, region, files, regionsState };
}
