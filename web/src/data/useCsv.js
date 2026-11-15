import { useCallback, useEffect, useRef, useState } from "react";
import { loadCellsMonthly, loadHotspotsRecent } from "./csv.js";
import { LOADING, toFileState } from "./state.js";

const LOADERS = { cells_monthly: loadCellsMonthly, hotspots_recent: loadHotspotsRecent };

/**
 * Lazy CSV: nothing is fetched until `load()` is called (or `auto` is true).
 * @param {string} regionId
 * @param {"cells_monthly" | "hotspots_recent"} name
 * @param {import("./state.js").FileState} listed  the file's state from useRegionData ("lazy" or "absent")
 * @param {{ auto?: boolean }} [opts] auto: start loading as soon as the file is listed
 * @returns {{ state: import("./state.js").FileState, progress: {loaded: number, total: number | null} | null, load: () => void }}
 */
export function useCsv(regionId, name, listed, opts = {}) {
  const [state, setState] = useState(null);
  const [progress, setProgress] = useState(null);
  const started = useRef(false);

  const load = useCallback(() => {
    if (listed?.status !== "lazy" || started.current) return;
    started.current = true;
    setState(LOADING);
    LOADERS[name](regionId, setProgress).then((r) => setState(toFileState(r)));
  }, [regionId, name, listed]);

  useEffect(() => {
    if (opts.auto) load();
  }, [opts.auto, load]);

  return { state: state ?? listed, progress: state?.status === "loading" ? progress : null, load };
}
