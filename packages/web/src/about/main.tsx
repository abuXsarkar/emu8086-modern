// Entry for the standalone /about/ landing page. Separate Vite
// entry from the IDE so the landing bundle doesn't drag Monaco
// (~250 KB) along for a page that's all marketing copy + SVG.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist/index.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource/instrument-serif/400.css";
import "./landing.css";
import { Landing } from "./Landing";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
createRoot(root).render(
  <StrictMode>
    <Landing />
  </StrictMode>,
);
