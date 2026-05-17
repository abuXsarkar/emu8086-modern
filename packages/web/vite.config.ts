import { defineConfig } from "vite";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Public path the bundle will be served from. Defaults to "/" for the
// dev server and self-host setups; the GitHub Pages workflow sets it
// to "/modern8086/" so the wasm fetch + PWA scope land at the
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
  // Multi-page build: the IDE lives at `/`, the landing/about page
  // at `/about/`, and the docs hub at `/docs/`. Vite emits separate
  // JS bundles per entry so neither the landing nor the docs pulls
  // in Monaco (~250 KB) for what's essentially static reading.
  //
  // The entry HTMLs live in their own folders (`about/index.html`,
  // `docs/index.html`) — not flat `about.html` / `docs.html` — so
  // the static host serves `/about/` and `/docs/` as directory
  // indexes. Flat HTMLs would require either explicit `.html`
  // suffixes in links or a host-side rewrite, neither of which
  // GitHub Pages does for us. The PWA service worker's navigation
  // fallback would otherwise send `/about/` to `/index.html` and
  // the user lands back on the IDE.
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        about: resolve(__dirname, "about/index.html"),
        docs: resolve(__dirname, "docs/index.html"),
        // The 8085 sibling IDE lives at /8085/. It imports its wasm
        // from ../../wasm-api-8085/pkg, built by wasm-pack before the
        // Vite build (see the build:wasm-8085 script in package.json).
        eight5: resolve(__dirname, "8085/index.html"),
        // /labs/ is the family-of-tools catalogue — lists 8086, 8085,
        // and the planned siblings (8051, RISC-V, K-map, etc.). A
        // static React app with no wasm dependencies.
        labs: resolve(__dirname, "labs/index.html"),
        // /8085/docs/ is the long-form reference: quick-start,
        // dialect notes, full mnemonic table, CLI. Pulls the docs
        // content from src/8085/asm8085_docs.ts so it stays in sync.
        eight5Docs: resolve(__dirname, "8085/docs/index.html"),
        // /8085/about/ landing — marketing surface, 8-slide pitch.
        // Mirrors the 8086 /about/ shape so visitors searching for
        // "modern 8085 IDE" land on something more substantial than
        // the bare IDE.
        eight5About: resolve(__dirname, "8085/about/index.html"),
      },
    },
  },
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
        name: "modern8086",
        short_name: "modern8086",
        description:
          "Modern, open-source 8086 emulator and assembly IDE for students.",
        // Ink-blue brand accent — matches the IDE's --accent token so
        // the OS chrome (Android nav bar, iOS standalone status bar,
        // Chrome OS title bar) ties into the in-app palette.
        theme_color: "#1E3A8A",
        background_color: "#F8F4EE",
        display: "standalone",
        start_url: BASE,
        scope: BASE,
        icons: [
          // SVG first — picked by browsers that support it for crisp
          // rendering at every density.
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          // Raster fallbacks. Two PNG sizes + a maskable variant cover
          // every install target Lighthouse cares about.
          {
            src: "pwa-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
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
