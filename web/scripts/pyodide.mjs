#!/usr/bin/env node
// Copies the pinned Pyodide runtime (the npm package `pyodide`, see package.json) into
// public/pyodide/<version>/, so the site serves it from its own origin: no CDN. The version
// is in the path, so a new Pyodide never mixes with a cached old one.
//
//   node scripts/pyodide.mjs
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL("..", import.meta.url));
const src = `${web}node_modules/pyodide/`;
const { version } = JSON.parse(readFileSync(`${src}package.json`, "utf8"));
const dest = `${web}public/pyodide/${version}/`;
// Only what the tracer needs: the loader, the runtime, the standard library and the lockfile.
export const FILES = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];

mkdirSync(dest, { recursive: true });
for (const file of FILES) {
  if (!existsSync(`${dest}${file}`)) copyFileSync(`${src}${file}`, `${dest}${file}`);
}
console.log(`pyodide ${version}: ${FILES.length} files in public/pyodide/${version}/`);
