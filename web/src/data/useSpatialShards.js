import { useEffect, useState } from "react";
import { fetchJson } from "./fetchJson.js";

/** Load year shards on demand; fetchJson deduplicates concurrent map and area requests. */
export function useSpatialShards(region, indexState, years, enabled) {
  const entries = indexState?.status === "ok" ? indexState.data.years.filter((entry) => entry.year >= years[0] && entry.year <= years[1]) : [];
  const key = enabled && entries.length ? `${region}/${entries.map((entry) => entry.year).join(",")}` : null;
  const [loaded, setLoaded] = useState({ key: null, state: null });
  useEffect(() => {
    if (!key) return;
    let alive = true;
    (async () => {
      const results = [];
      for (const entry of entries) {
        if (!alive) return;
        results.push(await fetchJson(`${region}/${entry.path}`, {schema: "spatial"}));
      }
      return results;
    })().then((results) => {
      if (!alive) return;
      const failure = results.find((result) => result.ok === false);
      setLoaded({key, state: failure ? {status: "invalid", detail: failure.detail} : {status: "ok", data: results.map((result) => result.data)}});
    });
    return () => { alive = false; };
  }, [key]);
  if (!key) return { status: "absent", detail: "Authoritative spatial contributions are not available." };
  return loaded.key === key ? loaded.state : { status: "loading" };
}
