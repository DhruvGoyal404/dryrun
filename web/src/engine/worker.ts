/// <reference lib="webworker" />
// The Pyodide worker: boots Python once, then traces each run with tracer/dryrun_tracer.py.
// Python runs here so the page never freezes; an endless run is ended by the page
// terminating this worker (engine/client.ts), never by anything in here.
import type { PyodideInterface } from "pyodide";
import tracerSource from "../../../tracer/dryrun_tracer.py?raw";
import type { FromWorker, ToWorker } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;
const BASE = `/pyodide/${__PYODIDE_VERSION__}/`;
// The two big downloads, fetched first so the page can show real progress. Pyodide's own
// fetches of the same URLs are then answered from the HTTP cache or the service worker.
const BIG = ["pyodide.asm.wasm", "python_stdlib.zip"];

const post = (message: FromWorker) => self.postMessage(message);
let python: Promise<PyodideInterface> | null = null;

async function prefetch() {
  // Uncompressed sizes from the build: a compressed response's content-length would undercount.
  const total = __PYODIDE_BYTES__;
  let loaded = 0;
  await Promise.all(
    BIG.map(async (f) => {
      const response = await fetch(BASE + f);
      if (!response.ok || !response.body) throw new Error(`${f}: HTTP ${response.status}`);
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        loaded += value.byteLength;
        post({ type: "progress", loaded, total: Math.max(total, loaded) });
      }
    }),
  );
}

async function boot(): Promise<PyodideInterface> {
  const started = performance.now();
  await prefetch();
  const { loadPyodide } = (await import(/* @vite-ignore */ `${BASE}pyodide.mjs`)) as typeof import("pyodide");
  const py = await loadPyodide({ indexURL: BASE, stdout: () => {}, stderr: () => {} });
  py.FS.writeFile("/home/pyodide/dryrun_tracer.py", tracerSource);
  py.runPython("import sys\nsys.path.insert(0, '/home/pyodide')\nimport dryrun_tracer");
  post({ type: "ready", version: py.version, ms: Math.round(performance.now() - started) });
  return py;
}

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  python ??= boot().catch((error: unknown) => {
    post({ type: "boot-failed", message: error instanceof Error ? error.message : String(error) });
    python = null;
    throw error;
  });
  if (msg.type === "boot") return;
  let py: PyodideInterface;
  try {
    py = await python;
  } catch {
    post({ type: "failed", id: msg.id, message: "Python could not start in this browser." });
    return;
  }
  const started = performance.now();
  try {
    const tracer = py.pyimport("dryrun_tracer");
    const tick = (step: number, line: number) => post({ type: "tick", id: msg.id, step, line });
    const json: string = tracer.run_json(msg.code, msg.stdin, msg.call, JSON.stringify(msg.limits ?? {}), msg.record ?? true, tick);
    tracer.destroy();
    post({ type: "result", id: msg.id, json, ms: Math.round(performance.now() - started) });
  } catch (error) {
    post({ type: "failed", id: msg.id, message: error instanceof Error ? error.message : String(error) });
  }
};
