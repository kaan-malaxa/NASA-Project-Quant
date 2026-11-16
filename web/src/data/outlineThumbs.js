import { useEffect, useState } from "react";
import { fetchJson } from "./fetchJson.js";
import { regionFilePath } from "./files.js";
import { outlineThumb } from "@/lib/outlineThumb.js";

/*
 * Region thumbnails for the place picker. The fast path is outline-thumbs.json, written at build time from every
 * region's outline (a few kB in all). A region missing from it (e.g. data added after the build, or test data) falls
 * back to its own outline.geojson, fetched only when its card is near the viewport, reduced once with the same code,
 * and cached in memory and sessionStorage.
 */
const SESSION_KEY = "pt-outline-thumbs-v1";
const memory = new Map();
let fileThumbs = null; // Promise<Record<string, {d, width, height}>>

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "{}");
  } catch {
    return {};
  }
}
function writeSession(id, thumb) {
  try {
    const all = readSession();
    all[id] = thumb;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(all));
  } catch {
    /* storage full or blocked: memory cache only */
  }
}

/** The build-time thumbnails (one small request, shared by every card). */
export function loadThumbFile() {
  if (!fileThumbs) {
    const url = `${import.meta.env.BASE_URL}outline-thumbs.json`;
    fileThumbs = fetch(url)
      .then((r) => (r.ok && /json/.test(r.headers.get("content-type") || "") ? r.json() : { regions: {} }))
      .then((j) => (j && typeof j.regions === "object" ? j.regions : {}))
      .catch(() => ({}));
  }
  return fileThumbs;
}

/** For tests. */
export function clearThumbCache() {
  memory.clear();
  fileThumbs = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * @param {any} region a regions.json entry
 * @param {boolean} near the card is near the viewport (only then may the full outline be fetched)
 * @returns {{ status: string, thumb?: { d: string, width: number, height: number } }} status: "loading" | "ok" | "absent"
 */
export function useOutlineThumb(region, near) {
  const id = region?.id;
  const listed = Boolean(region && (region.files || []).includes("outline"));
  const cached = id ? (memory.get(id) ?? readSession()[id]) : undefined;
  const [state, setState] = useState(() =>
    !listed ? { status: "absent" } : cached ? { status: "ok", thumb: cached } : { status: "loading" },
  );

  useEffect(() => {
    if (!listed || state.status !== "loading") return;
    let alive = true;
    const done = (thumb) => {
      if (!alive) return;
      if (thumb) {
        memory.set(id, thumb);
        writeSession(id, thumb);
        setState({ status: "ok", thumb });
      } else setState({ status: "absent" });
    };
    loadThumbFile().then((all) => {
      if (!alive) return;
      if (all[id]) return done(all[id]);
      if (!near) return; // wait until the card is near the viewport
      fetchJson(regionFilePath(id, "outline")).then((r) => done(r.ok ? outlineThumb(r.data) : null));
    });
    return () => {
      alive = false;
    };
  }, [id, listed, near, state.status]);

  return state;
}
