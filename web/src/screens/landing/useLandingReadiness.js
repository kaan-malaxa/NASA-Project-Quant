import { useEffect, useState } from "react";
import { fetchJson } from "@/data/fetchJson.js";
import { regionFilePath } from "@/data/files.js";
import { vizReady } from "@/components/Viz.jsx";
import { createReadiness } from "./readiness.js";
import { liveRegion } from "./liveRegion.js";
import { webglAvailable } from "./motion.js";
import { EARTH_TEXTURE_URL } from "./earthTexture.js";

/**
 * Starts everything the landing page needs as soon as it mounts (under the loader) and tracks it:
 * data files (fetched, validated and cached by fetchJson, so the sections render from the cache), the lazy 3D globe
 * chunk, R6's viz chunk, fonts, and, through `rootRef`, the charts being drawn with no skeleton left on the page.
 * The scene reports "texture" and "scene" itself (GlobeScene), and the story layout reports "layout".
 *
 * @param {{ current: HTMLElement | null }} rootRef the landing page's root element
 * @returns {ReturnType<typeof createReadiness>}
 */
export function useLandingReadiness(rootRef) {
  const [tracker] = useState(() => createReadiness());

  useEffect(() => {
    let alive = true;
    const done = (id, ok = true) => alive && tracker.done(id, ok);
    const file = (id, path) =>
      fetchJson(path).then(
        (r) => done(id, r.ok),
        () => done(id, false),
      );

    // ---- data ----
    file("manifest", "manifest.json");
    file("methods", "methods.json");
    fetchJson("regions.json").then(
      (r) => {
        done("regions", r.ok);
        const regions = r.ok ? r.data.regions : [];
        const def = regions.find((x) => x.synthetic !== true) ?? null;
        const listed = (region, name) => Boolean(region && (region.files || []).includes(name));
        // Not listed = nothing to wait for (the section shows "not available"): done, as failed.
        for (const [id, name] of [
          ["ruler", "ruler"],
          ["calibration", "calibration"],
        ]) {
          if (listed(def, name)) file(id, regionFilePath(def.id, name));
          else done(id, false);
        }
        const live = liveRegion(regions);
        if (!live) {
          done("nowcast", false);
          done("latest", false);
          return;
        }
        fetchJson(regionFilePath(live.id, "nowcast")).then(
          (n) => {
            done("nowcast", n.ok);
            if (!n.ok || n.data.status !== "unavailable") return done("latest", true); // nothing more to load
            // No recent data: the card shows the latest year from trend.json and weekly.json.
            const wanted = ["trend", "weekly"].filter((name) => listed(live, name));
            if (wanted.length < 2) return done("latest", false);
            Promise.all(wanted.map((name) => fetchJson(regionFilePath(live.id, name)))).then(
              (rs) =>
                done(
                  "latest",
                  rs.every((x) => x.ok),
                ),
              () => done("latest", false),
            );
          },
          () => {
            done("nowcast", false);
            done("latest", false);
          },
        );
      },
      () => {
        for (const id of ["regions", "ruler", "calibration", "nowcast", "latest"]) done(id, false);
      },
    );

    // ---- code ----
    if (webglAvailable()) {
      import("./GlobeScene.jsx").then(
        () => done("globeChunk"),
        () => done("globeChunk", false),
      );
    } else {
      // No WebGL: no 3D chunk to wait for, and the "texture" is the static picture, decoded.
      done("globeChunk", false);
      done("scene", false);
      const img = new Image();
      img.src = EARTH_TEXTURE_URL;
      (img.decode ? img.decode() : Promise.resolve()).then(
        () => done("texture"),
        () => done("texture", false),
      );
    }
    vizReady.then(
      (m) => done("vizChunk", Object.keys(m || {}).length > 0),
      () => done("vizChunk", false),
    );

    // ---- fonts ----
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(
        () => done("fonts"),
        () => done("fonts", false),
      );
    } else done("fonts");

    return () => {
      alive = false;
    };
  }, [tracker]);

  // ---- charts: drawn, and no skeleton or loading state left on the page ----
  useEffect(() => {
    const dataTasks = ["regions", "ruler", "methods", "calibration", "nowcast", "latest", "vizChunk"];
    const id = setInterval(() => {
      const root = rootRef.current;
      if (!root || tracker.isDone("charts") || !dataTasks.every((t) => tracker.isDone(t))) return;
      if (landingSettled(root)) {
        tracker.done("charts");
        clearInterval(id);
      }
    }, 100);
    return () => clearInterval(id);
  }, [tracker, rootRef]);

  return tracker;
}

/** No skeleton or loading state anywhere on the page, and the broken-ruler chart (when shown) has drawn. */
export function landingSettled(root) {
  if (root.querySelector('[data-state="loading"], [role="status"][aria-label^="Loading"]')) return false;
  const ruler = root.querySelector('[aria-label="The broken ruler"]');
  const figure = ruler?.querySelector("figure");
  if (figure) {
    const svg = figure.querySelector("svg");
    if (!svg || svg.childElementCount === 0) return false;
  }
  return true;
}
