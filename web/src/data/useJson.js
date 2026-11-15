import { useEffect, useState } from "react";
import { fetchJson } from "./fetchJson.js";
import { LOADING, toFileState } from "./state.js";

/** Load one data file. Pass null to skip. @returns {import("./state.js").FileState} */
export function useJson(path) {
  const [state, setState] = useState(/** @type {import("./state.js").FileState} */ (path ? LOADING : { status: "absent" }));
  useEffect(() => {
    if (!path) {
      setState({ status: "absent" });
      return;
    }
    let alive = true;
    setState(LOADING);
    fetchJson(path).then((r) => alive && setState(toFileState(r)));
    return () => {
      alive = false;
    };
  }, [path]);
  return state;
}
