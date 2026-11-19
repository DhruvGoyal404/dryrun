/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

const pyodide = JSON.parse(readFileSync("node_modules/pyodide/package.json", "utf8")) as { version: string };
const PYODIDE_BYTES = ["pyodide.asm.wasm", "python_stdlib.zip"].reduce((n, f) => n + statSync(`node_modules/pyodide/${f}`).size, 0);

const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

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
          return `<li><a href="/app#ex=${f.replace(/\.py$/, "")}">${escape(meta("title"))}</a><span>${escape(meta("pattern"))}</span></li>`;
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
 * Emits sw.js: the built site precached at install (small: HTML, JS, CSS, fonts), and
 * Python cached the first time it loads, so later visits are instant and work offline.
 */
function serviceWorker(): Plugin {
  return {
    name: "dryrun-service-worker",
    apply: "build",
    generateBundle(_, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith(".map") && !f.endsWith(".html"));
      // Only the Latin and Latin-extended font files: other subsets download only if used.
      const assets = built.filter((f) => !f.endsWith(".woff2") || /-latin-(ext-)?wght/.test(f));
      const pages = ["/", "/app", "/404.html"];
      const fromPublic = ["/favicon.svg", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/theme.js"];
      const files = [...pages, ...fromPublic, ...assets.map((f) => `/${f}`)].sort();
      const version = createHash("sha256").update(files.join("\n") + pyodide.version).digest("hex").slice(0, 12);
      const source = readFileSync("scripts/sw-template.js", "utf8")
        .replace("__VERSION__", version)
        .replace("__PYODIDE__", `/pyodide/${pyodide.version}/`)
        .replace("__PRECACHE__", JSON.stringify(files, null, 2));
      this.emitFile({ type: "asset", fileName: "sw.js", source });
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
    rollupOptions: { input: { index: "index.html", app: "app.html", 404: "404.html" } },
  },
  test: {
    // Threads, not forked processes: forking timed out on a memory-starved dev machine.
    pool: "threads",
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
  },
});
