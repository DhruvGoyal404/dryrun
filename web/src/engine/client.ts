// The page's side of the worker: boots it, runs traces one at a time, and enforces the
// wall-clock watchdog. A run that outlives the watchdog (an endless loop in one builtin
// call, or user code that swallowed the tracer's cap) is ended by terminating the worker;
// a fresh one boots from cache and the result says where the run had got to.
import type { Trace } from "../trace/types";
import type { FromWorker, RunRequest, ToWorker } from "./protocol";

export const WATCHDOG_MS = 15_000;

export type EngineStatus =
  | { state: "idle" }
  | { state: "loading"; loaded: number; total: number }
  | { state: "ready"; version: string }
  | { state: "failed"; message: string };

type Listener = (status: EngineStatus) => void;

export class Engine {
  private worker: Worker | null = null;
  private nextId = 1;
  private status: EngineStatus = { state: "idle" };
  private listeners = new Set<Listener>();
  private pending = new Map<number, (msg: FromWorker) => void>();
  private queue: Promise<unknown> = Promise.resolve();

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private set(status: EngineStatus) {
    this.status = status;
    for (const l of this.listeners) l(status);
  }

  /** Starts Python in the background; safe to call any number of times. */
  boot() {
    if (this.worker) return;
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<FromWorker>) => {
      const msg = event.data;
      if (msg.type === "progress") this.set({ state: "loading", loaded: msg.loaded, total: msg.total });
      else if (msg.type === "ready") this.set({ state: "ready", version: msg.version });
      else if (msg.type === "boot-failed") this.set({ state: "failed", message: msg.message });
      else this.pending.get(msg.id)?.(msg);
    };
    worker.onerror = (event) => this.set({ state: "failed", message: event.message || "The Python worker failed to load." });
    this.worker = worker;
    this.set({ state: "loading", loaded: 0, total: 1 });
    worker.postMessage({ type: "boot" } satisfies ToWorker);
  }

  private restart() {
    this.worker?.terminate();
    this.worker = null;
    this.boot();
  }

  /** Traces one program. Runs are queued, so compare mode's two traces never overlap. */
  run(request: RunRequest, watchdogMs = WATCHDOG_MS): Promise<Trace> {
    const job = this.queue.then(() => this.runNow(request, watchdogMs));
    this.queue = job.catch(() => undefined);
    return job;
  }

  private runNow(request: RunRequest, watchdogMs: number): Promise<Trace> {
    this.boot();
    const id = this.nextId++;
    return new Promise<Trace>((resolve, reject) => {
      let last = { step: 0, line: null as number | null };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          this.pending.delete(id);
          unsubscribe();
          this.restart();
          resolve(watchdogTrace(last.step, last.line, watchdogMs));
        }, watchdogMs);
      };
      // The watchdog starts once Python is ready: a slow first download is not a runaway.
      const unsubscribe = this.subscribe((s) => {
        if (s.state === "ready" && timer === undefined) arm();
        if (s.state === "failed") {
          this.pending.delete(id);
          reject(new Error(s.message));
        }
      });
      this.pending.set(id, (msg) => {
        if (msg.type === "tick") {
          last = { step: msg.step, line: msg.line };
          return;
        }
        clearTimeout(timer);
        unsubscribe();
        this.pending.delete(id);
        if (msg.type === "result") resolve(JSON.parse(msg.json) as Trace);
        else if (msg.type === "failed") reject(new Error(msg.message));
      });
      this.worker!.postMessage({ type: "run", id, ...request } satisfies ToWorker);
    });
  }
}

/** The result of a run the watchdog ended: no steps, and where it had got to. */
export function watchdogTrace(step: number, line: number | null, ms: number): Trace {
  return {
    version: 1,
    steps: [],
    calls: [],
    stdout: "",
    counts: { steps: step, calls: 0, maxDepth: 0, lines: {} },
    limits: { watchdog_ms: ms },
    capped: { reason: "watchdog", step, line },
  };
}
