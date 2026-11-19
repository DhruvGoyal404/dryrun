/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";

const pyodide = JSON.parse(readFileSync("node_modules/pyodide/package.json", "utf8")) as { version: string };
const PYODIDE_BYTES = ["pyodide.asm.wasm", "python_stdlib.zip"].reduce((n, f) => n + statSync(`node_modules/pyodide/${f}`).size, 0);

const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/**
 * One small pencil sketch per structure, beside each library entry: what that example draws.
 * Ink strokes, a blue pointer, a red "now" mark; decorative (the text says the same).
 */
const SKETCH: Record<string, string> = {
  array: '<path class="k" d="M2 8h44v14H2zM13 8v14M24 8v14M35 8v14"/><path class="b" d="M18 33v-7M15 29l3-3 3 3"/>',
  grid: '<path class="k" d="M6 4h36v30H6zM6 14h36M6 24h36M18 4v30M30 4v30"/><path class="m" d="M30 24h12v10H30z"/>',
  recursion: '<path class="k" d="M24 9L12 21M24 9l12 12M12 21L6 31M12 21l6 10"/><rect class="r" x="18" y="3" width="12" height="7" rx="1.5"/><rect class="k" x="6" y="17" width="12" height="7" rx="1.5"/><rect class="k" x="30" y="17" width="12" height="7" rx="1.5"/>',
  map: '<path class="k" d="M8 4h32v30H8zM8 14h32M8 24h32M20 4v30"/><path class="m" d="M20 14h20v10H20z"/>',
  stack: '<path class="k" d="M14 4v30h20V4M14 14h20M14 24h20"/><path class="r" d="M10 29h4"/>',
  queue: '<path class="k" d="M4 12h40v14H4zM16 12v14M28 12v14"/><path class="b" d="M2 6h6M44 32h-6"/>',
  linked: '<path class="k" d="M2 12h10v12H2zM20 12h10v12H20zM38 12h8v12h-8zM12 18h7M30 18h7"/><path class="b" d="M7 5v6"/>',
  tree: '<path class="k" d="M24 9L13 22M24 9l11 13"/><circle class="r" cx="24" cy="7" r="5"/><circle class="k" cx="12" cy="25" r="5"/><circle class="k" cx="36" cy="25" r="5"/>',
  graph: '<path class="k" d="M9 10l14 16M9 10l28-2M23 26l14-18M23 26l18 2"/><circle class="k" cx="8" cy="10" r="4"/><circle class="m" cx="23" cy="27" r="4"/><circle class="k" cx="38" cy="8" r="4"/><circle class="b" cx="42" cy="29" r="4"/>',
  heap: '<path class="k" d="M24 8L14 20M24 8l10 12M14 20l-6 10"/><circle class="k" cx="24" cy="7" r="4.5"/><circle class="k" cx="14" cy="21" r="4.5"/><circle class="k" cx="34" cy="21" r="4.5"/><circle class="k" cx="8" cy="31" r="4"/>',
};
const sketch = (kind: string) => `<svg class="sketch" viewBox="0 0 48 38" aria-hidden="true" focusable="false">${SKETCH[kind] ?? SKETCH.array}</svg>`;

/** The pattern library as plain links in the landing page's HTML, so crawlers see it. */
function libraryList(): Plugin {
  return {
    name: "dryrun-library-list",
    transformIndexHtml(html) {
      if (!html.includes("<!--library-->")) return html;
      const items = readdirSync("src/library")
        .filter((f) => f.endsWith(".py"))
        .sort()
        .map((f) => {
          const src = readFileSync(`src/library/${f}`, "utf8");
          const meta = (k: string) => new RegExp(`^# ${k}: (.*)$`, "m").exec(src)?.[1]?.trim() ?? "";
          return `<li>${sketch(meta("expect"))}<div><a href="/app#ex=${f.replace(/\.py$/, "")}">${escape(meta("title"))}</a><span>${escape(meta("pattern"))}</span></div></li>`;
        });
      return html.replace("<!--library-->", `<ul class="examples">\n${items.join("\n")}\n</ul>`);
    },
  };
}

/** Preloads the Latin face of IBM Plex Sans so text paints once, in the right face. */
function preloadFont(): Plugin {
  return {
    name: "dryrun-preload-font",
    apply: "build",
    transformIndexHtml(_html, ctx) {
      const font = Object.keys(ctx.bundle ?? {}).find((f) => /ibm-plex-sans-latin-wght-normal.*\.woff2$/.test(f));
      if (!font) throw new Error("preload-font: the IBM Plex Sans Latin file is missing from the bundle");
      return [{ tag: "link", attrs: { rel: "preload", href: `/${font}`, as: "font", type: "font/woff2", crossorigin: "" }, injectTo: "head" }];
    },
  };
}

/**
 * Writes sw.js after the build: the site precached at install (HTML, JS, CSS, Latin fonts:
 * small), and Python cached the first time it loads, so later visits are instant and work
 * offline. The list comes from the files actually written: a chunk the bundler reports but
 * never writes (an empty entry) would 404 and fail the whole install.
 */
function serviceWorker(): Plugin {
  return {
    name: "dryrun-service-worker",
    apply: "build",
    writeBundle(options) {
      const dir = options.dir ?? "dist";
      // Only the Latin and Latin-extended font files: other subsets download only if used.
      const assets = readdirSync(join(dir, "assets"))
        .filter((f) => !f.endsWith(".map") && (!f.endsWith(".woff2") || /-latin-(ext-)?wght/.test(f)))
        .map((f) => `/assets/${f}`);
      // Not /404.html: it is served with status 404, and one failed response fails the install.
      const pages = ["/", "/app"];
      const fromPublic = ["/favicon.svg", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/theme.js"].filter((f) => existsSync(join(dir, f)));
      const files = [...pages, ...fromPublic, ...assets].sort();
      const version = createHash("sha256").update(files.join("\n") + pyodide.version).digest("hex").slice(0, 12);
      const source = readFileSync("scripts/sw-template.js", "utf8")
        .replace("__VERSION__", version)
        .replace("__PYODIDE__", `/pyodide/${pyodide.version}/`)
        .replace("__PRECACHE__", JSON.stringify(files, null, 2));
      writeFileSync(join(dir, "sw.js"), source);
    },
  };
}

export default defineConfig({
  plugins: [react(), libraryList(), preloadFont(), serviceWorker()],
  define: {
    __PYODIDE_VERSION__: JSON.stringify(pyodide.version),
    __PYODIDE_BYTES__: String(PYODIDE_BYTES),
  },
  worker: { format: "es" },
  server: { fs: { allow: [".."] } },
  build: {
    target: "es2022",
    // Never inline fonts or images as data: URIs; the CSP allows fonts from 'self' only.
    assetsInlineLimit: 0,
    rollupOptions: { input: { index: "index.html", app: "app.html", 404: "404.html" } },
  },
  test: {
    // Threads, not forked processes: forking timed out on a memory-starved dev machine.
    pool: "threads",
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
  },
});
