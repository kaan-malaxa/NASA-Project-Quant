import { fileURLToPath, URL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { outlineThumb } from "./src/lib/outlineThumb.js";

/**
 * Open Graph needs absolute URLs. CI sets VITE_SITE_URL (https://prometheus-torch.design/); locally the tags fall
 * back to relative paths. The image is web/public/og-image.png (a static PNG from R6).
 */
function openGraph() {
  const site = (process.env.VITE_SITE_URL || "").replace(/\/?$/, "/");
  const abs = (p) => (process.env.VITE_SITE_URL ? site + p : p);
  return {
    name: "prometheus-torch-open-graph",
    transformIndexHtml() {
      return [
        { tag: "meta", attrs: { property: "og:image", content: abs("og-image.png") }, injectTo: "head" },
        {
          tag: "meta",
          attrs: {
            property: "og:image:alt",
            content: "Prometheus Torch: satellite fire records on one scale",
          },
          injectTo: "head",
        },
        { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" }, injectTo: "head" },
        ...(process.env.VITE_SITE_URL
          ? [{ tag: "meta", attrs: { property: "og:url", content: site }, injectTo: "head" }]
          : []),
      ];
    },
  };
}

/**
 * Place-picker thumbnails: every region's outline.geojson (some are several MB) reduced once to a short SVG path and
 * written as outline-thumbs.json at the site root, so the picker downloads a few kB instead of the full outlines.
 * Built from the same data files that are published; web/public/data itself is not touched. The dev server serves
 * the same file. Regions without a thumbnail fall back to their outline in the browser (src/screens/Picker.jsx).
 */
function outlineThumbnails() {
  let publicDir = "public";
  const build = () => {
    const dataDir = path.join(publicDir, "data");
    const thumbs = {};
    let regions;
    try {
      regions = JSON.parse(fs.readFileSync(path.join(dataDir, "regions.json"), "utf8")).regions || [];
    } catch {
      return { regions: thumbs };
    }
    for (const r of regions) {
      if (!(r.files || []).includes("outline")) continue;
      try {
        const geo = JSON.parse(fs.readFileSync(path.join(dataDir, r.id, "outline.geojson"), "utf8"));
        const t = outlineThumb(geo);
        if (t) thumbs[r.id] = t;
      } catch {
        /* no thumbnail: the picker falls back to the outline file */
      }
    }
    return { regions: thumbs };
  };
  return {
    name: "prometheus-torch-outline-thumbnails",
    configResolved(config) {
      publicDir = config.publicDir;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.split("?")[0].endsWith("/outline-thumbs.json")) return next();
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(build()));
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "outline-thumbs.json", source: JSON.stringify(build()) });
    },
  };
}

// VITE_BASE is the path the site is served from: "/" on the custom domain https://prometheus-torch.design/ (and
// unset in local dev, tests and preview); "/NASA-Project-Quant/" if it is ever served from plain GitHub Pages again.
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  // Local development only: VITE_PUBLIC_DIR points the dev server at another folder of data files. Unset in CI.
  publicDir: process.env.VITE_PUBLIC_DIR || "public",
  plugins: [react(), tailwindcss(), openGraph(), outlineThumbnails()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // src/data/schemas.js bundles ../contracts/*.schema.json (R1's schemas, one level above web/).
  server: { fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] } },
  test: {
    environment: "jsdom",
    globals: false,
    include: ["src/**/*.test.{js,jsx}"],
  },
});
