import { useEffect } from "react";

export const SITE_NAME = "Prometheus Torch";
export const DEFAULT_DESCRIPTION =
  "Satellite-detected burning activity on one consistent scale, from MODIS to VIIRS, with the sensor change corrected.";

function setMeta(selector, attr, value) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    const [, key, name] = selector.match(/\[(name|property)="([^"]+)"\]/);
    el.setAttribute(key, name);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

/** Per-route <title> and meta description (fixed copy; no results in them). */
export function useDocumentMeta(title, description = DEFAULT_DESCRIPTION) {
  useEffect(() => {
    const full = title ? `${title} · ${SITE_NAME}` : SITE_NAME;
    document.title = full;
    setMeta('meta[name="description"]', "content", description);
    setMeta('meta[property="og:title"]', "content", full);
    setMeta('meta[property="og:description"]', "content", description);
  }, [title, description]);
}
