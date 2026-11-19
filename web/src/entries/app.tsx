import "@fontsource-variable/ibm-plex-sans";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/caveat";
import "../styles/tokens.css";
import "../styles/base.css";
import "../styles/app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../app/App";
import { registerServiceWorker } from "./sw";

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
registerServiceWorker();
