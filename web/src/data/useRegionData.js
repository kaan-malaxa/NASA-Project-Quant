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
 * @returns {{ status: "loading" | "ok" | "unknown_region" | "regions_failed", region: object | null,
 *             files: Record<string, import("./state.js").FileState>, regionsState: import("./state.js").FileState }}
 */
export function useRegionData(regionId) {
  const { state: regionsState, regions } = useRegions();
  const region = useMemo(() => regions.find((r) => r.id === regionId) || null, [regions, regionId]);
  const [files, setFiles] = useState({});

  useEffect(() => {
    if (!region) {
      setFiles({});
      return;
    }
    let alive = true;
    const init = initialFileStates(region);
    setFiles(init);
    for (const [name, st] of Object.entries(init)) {
      if (st.status !== "loading") continue;
      fetchJson(regionFilePath(region.id, name)).then((r) => {
        if (alive) setFiles((prev) => ({ ...prev, [name]: toFileState(r) }));
      });
    }
    return () => {
      alive = false;
    };
  }, [region]);

  let status = "loading";
  if (regionsState.status === "ok") status = region ? "ok" : "unknown_region";
  else if (regionsState.status !== "loading") status = "regions_failed";

  return { status, region, files, regionsState };
}
