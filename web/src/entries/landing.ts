// The landing and 404 pages: styles, two faces, and the service worker. No other script.
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource-variable/caveat";
import "../styles/tokens.css";
import "../styles/base.css";
import "../styles/landing.css";
import { registerServiceWorker } from "./sw";

registerServiceWorker();
