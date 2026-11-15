import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "./fetchJson.js";
import { toFileState } from "./state.js";
import { analysisYears } from "../lib/analysis.js";

/** Load Python's science document for the selected complete calendar years. */
export function useAnalysisPeriod(region, files, url, configuration) {
  files ??= {};
  const index = files.period_index?.status === "ok" ? files.period_index.data : null;
  const years = index?.default_years;
  const [from, to] = analysisYears(index, url.analysis_from, url.analysis_to);
  const entry = index?.periods.find((period) => period.years[0] === from && period.years[1] === to);
  const path = entry && region ? `${region.id}/${entry.path}` : null;
  const [loaded, setLoaded] = useState({ path: null, state: null });
  useEffect(() => {
    if (!path) return;
    let alive = true;
    fetchJson(path, { schema: "period" }).then((result) => { if (alive) setLoaded({path, state: toFileState(result)}); });
    return () => { alive = false; };
  }, [path]);
  const state = path ? (loaded.path === path ? loaded.state : { status: "loading" }) : null;
  const selectedFiles = useMemo(() => {
    const selected = { ...files };
    const doc = state?.status === "ok" ? state.data : null;
    if (path) for (const key of ["trend", "season", "ruler"]) selected[key] = doc ? { status: "ok", data: doc[key] } : state;
    for (const key of ["weekly", "monthly"]) {
      if (files[key]?.status !== "ok") continue;
      const data = files[key].data;
      selected[key] = { status: "ok", data: { ...data, configuration,
        calibration: files.calibration?.data,
        baseline_rows: data.rows,
        rows: years ? data.rows.filter((row) => row.year >= from && row.year <= to) : data.rows } };
    }
    if (doc) selected.climatology = { status: "ok", data: {
      ...doc.climatology, analysis_years: doc.analysis_years,
      baseline_years: doc.anomaly_baseline_years } };
    return selected;
  }, [files, configuration, state, path, from, to, years]);
  return { files: selectedFiles, index, from, to, state };
}
