import { useJson } from "./useJson.js";

/** methods.json and manifest.json, each with its own state. */
export function useMethods() {
  const methods = useJson("methods.json");
  const manifest = useJson("manifest.json");
  return { methods, manifest };
}
