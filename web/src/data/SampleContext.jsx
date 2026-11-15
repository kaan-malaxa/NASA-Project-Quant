import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import { fetchJson } from "./fetchJson.js";
import { getSampleState, markSample, subscribeSample } from "./sample.js";

const SampleContext = createContext(false);

/** Loads manifest.json once and exposes whether the site is showing sample data. */
export function SampleProvider({ children }) {
  const isSample = useSyncExternalStore(subscribeSample, getSampleState, getSampleState);

  useEffect(() => {
    let alive = true;
    fetchJson("manifest.json").then((r) => {
      if (alive && r.ok && r.data.contains_sample === true) markSample("manifest");
    });
    return () => {
      alive = false;
    };
  }, []);

  return <SampleContext.Provider value={isSample}>{children}</SampleContext.Provider>;
}

export function useIsSample() {
  return useContext(SampleContext);
}
