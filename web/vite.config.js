import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

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
        { tag: "meta", attrs: { property: "og:image:alt", content: "Prometheus Torch: satellite fire records on one scale" }, injectTo: "head" },
        { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" }, injectTo: "head" },
        ...(process.env.VITE_SITE_URL ? [{ tag: "meta", attrs: { property: "og:url", content: site }, injectTo: "head" }] : []),
      ];
    },
  };
}

// VITE_BASE is set by CI to "/" (the site is served from the root of prometheus-torch.design); "./" works for local preview and any static host.
export default defineConfig({
  base: process.env.VITE_BASE || "./",
  // Local development only: VITE_PUBLIC_DIR points the dev server at another folder of data files. Unset in CI.
  publicDir: process.env.VITE_PUBLIC_DIR || "public",
  plugins: [react(), tailwindcss(), openGraph()],
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
