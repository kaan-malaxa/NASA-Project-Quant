import { useCallback, useState } from "react";
import { loadCellsMonthly, loadHotspotsRecent } from "./csv.js";
import { LOADING, toFileState } from "./state.js";

const LOADERS = { cells_monthly: loadCellsMonthly, hotspots_recent: loadHotspotsRecent };

/**
 * Lazy CSV: nothing is fetched until `load()` is called.
 * @param {string} regionId
 * @param {"cells_monthly" | "hotspots_recent"} name
 * @param {import("./state.js").FileState} listed  the file's state from useRegionData ("lazy" or "absent")
 */
export function useCsv(regionId, name, listed) {
  const [state, setState] = useState(listed);
  const load = useCallback(() => {
    if (listed?.status !== "lazy") return;
    setState(LOADING);
    LOADERS[name](regionId).then((r) => setState(toFileState(r)));
  }, [regionId, name, listed]);
  return { state: state?.status === "lazy" || !state ? listed : state, load };
}
