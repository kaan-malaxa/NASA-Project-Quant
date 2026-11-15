import { useEffect, useState } from "react";
import { dataUrl } from "./fetchJson.js";

/** "loading" | "yes" | "no" — whether a non-JSON file (e.g. numbers_audit.md) is present in data/. */
export function useFileExists(path) {
  const [state, setState] = useState("loading");
  useEffect(() => {
    let alive = true;
    fetch(dataUrl(path), { method: "GET" })
      .then((r) => {
        const html = (r.headers.get("content-type") || "").includes("text/html");
        if (alive) setState(r.ok && !html ? "yes" : "no");
      })
      .catch(() => alive && setState("no"));
    return () => {
      alive = false;
    };
  }, [path]);
  return state;
}
