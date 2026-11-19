// Messages between the page and the Pyodide worker.

export interface RunRequest {
  code: string;
  stdin: string;
  /** "solve([1, 2], 3)" in call mode, "" in stdin mode. */
  call: string;
  limits?: Record<string, number>;
  /** false: count steps and calls only (compare mode's size sweep). */
  record?: boolean;
}

export type ToWorker = { type: "boot" } | ({ type: "run"; id: number } & RunRequest);

export type FromWorker =
  | { type: "progress"; loaded: number; total: number }
  | { type: "ready"; version: string; ms: number }
  | { type: "boot-failed"; message: string }
  | { type: "tick"; id: number; step: number; line: number }
  | { type: "result"; id: number; json: string; ms: number }
  | { type: "failed"; id: number; message: string };
