import { useEffect, useState } from "react";
import { dataUrl } from "./fetchJson.js";

/**
 * "loading" | "yes" | "no" — whether a non-JSON file (e.g. numbers_audit.md) is present in data/.
 * When manifest.json has loaded, its file list decides and nothing is requested, so an absent file never causes a
 * 404 in the console. Only without a manifest does it probe the file itself.
 * @param {string} path
 * @param {import("./state.js").FileState} [manifest] manifest.json state from useJson("manifest.json")
 */
export function useFileExists(path, manifest) {
  const listed = manifest?.status === "ok" ? (manifest.data.files || []).some((f) => f.path === path) : null;
  const decided = manifest && manifest.status !== "loading";
  const [probe, setProbe] = useState("loading");

  useEffect(() => {
    if (!decided || listed !== null) return;
    let alive = true;
    fetch(dataUrl(path))
      .then((r) => {
        const html = (r.headers.get("content-type") || "").includes("text/html");
        if (alive) setProbe(r.ok && !html ? "yes" : "no");
      })
      .catch(() => alive && setProbe("no"));
    return () => {
      alive = false;
    };
  }, [path, decided, listed]);

  if (listed !== null) return listed ? "yes" : "no";
  return decided ? probe : "loading";
}
