import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Public path the bundle will be served from. Defaults to "/" for the
// dev server and self-host setups; the GitHub Pages workflow sets it
// to "/emu8086-modern/" so the wasm fetch + PWA scope land at the
// right URL when the site is served from a sub-path. Custom-domain
// deployments leave it at "/".
const BASE = process.env.VITE_BASE ?? "/";

// PWA configuration: installs a service worker that pre-caches the app
// shell + the wasm core so the IDE works offline (e.g. for Chromebook
// labs in airplane mode). `registerType: "autoUpdate"` keeps the SW
// fresh across visits without prompting the user, which is the right
// default for a single-user pedagogical tool.
export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [],
      workbox: {
        // Vite's default precache covers JS/CSS/HTML/icons; we add the
        // .wasm extension explicitly so the offline payload is
        // self-contained.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,wasm}"],
        // 200 KB wasm is well under the default 2 MiB cap, but raise
        // it anyway so future growth (richer ISA, more peripherals)
        // doesn't silently fall out of the precache.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
      manifest: {
        name: "emu8086-modern",
        short_name: "emu8086",
        description:
          "Modern, open-source 8086 emulator and assembly IDE for students.",
        theme_color: "#0a7",
        background_color: "#ffffff",
        display: "standalone",
        start_url: BASE,
        scope: BASE,
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "icon-maskable.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
