import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { registerSW } from "virtual:pwa-register";
import "@fontsource-variable/geist/index.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "@fontsource/geist-mono/600.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource/instrument-serif/400.css";
import "./theme.css";
import "./components.css";
import "./responsive.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register the service worker for offline support. With
// `registerType: "autoUpdate"` in vite.config.ts the helper silently
// fetches and activates new SW versions across visits — no toast or
// confirm prompt, which is the right default for a single-user
// pedagogical tool. Dev builds skip registration unless explicitly
// enabled, so HMR still works.
registerSW({ immediate: true });
