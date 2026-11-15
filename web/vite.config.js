import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// VITE_BASE is set by CI to "/<repo-name>/" for GitHub Pages; "./" works for local preview and any static host.
export default defineConfig({
  base: process.env.VITE_BASE || "./",
  // Local development only: VITE_PUBLIC_DIR points the dev server at another folder of data files. Unset in CI.
  publicDir: process.env.VITE_PUBLIC_DIR || "public",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    globals: false,
    include: ["src/**/*.test.{js,jsx}"],
  },
});
