/*
 * React entry point. Mounts <App /> into #root.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// Bundled rather than fetched: the workbench has to work offline, and the
// serif/mono split is load-bearing in the design, not a nicety. Source Serif 4
// and IBM Plex Mono are both SIL OFL 1.1.
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/400-italic.css";
import "@fontsource/source-serif-4/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";

import "./index.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root not found in index.html");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
