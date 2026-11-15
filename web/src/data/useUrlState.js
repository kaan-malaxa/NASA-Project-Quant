import { useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { parseUrlState, writeUrlState } from "@/lib/urlState.js";

/**
 * The region page's shareable state (from, to, lens, view, mode, aoi) in the hash-route query.
 * Read on load; every change replaces the history entry, so Back leaves the page instead of undoing toggles.
 * Several changes before the next render stack (each builds on the last one written, not on a stale render).
 * @param {string | null} lastDataDay
 * @returns {[ReturnType<typeof parseUrlState>, (patch: object) => void]}
 */
export function useUrlState(lastDataDay) {
  const [params, setParams] = useSearchParams();
  const latest = useRef(params);
  latest.current = params;

  const state = useMemo(() => parseUrlState(params, lastDataDay), [params, lastDataDay]);
  const update = useCallback(
    (patch) => {
      const base = latest.current;
      const next = writeUrlState(base, { ...parseUrlState(base, lastDataDay), ...patch }, lastDataDay);
      latest.current = next;
      setParams(next, { replace: true });
    },
    [setParams, lastDataDay],
  );
  return [state, update];
}
