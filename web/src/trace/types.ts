// The trace format written by tracer/dryrun_tracer.py. Field names are short because a
// trace can hold thousands of steps; this file is their glossary.

/** A value: primitives inline, everything mutable or compound as a heap reference. */
export type Value =
  | number
  | boolean
  | null
  | string
  | { r: number } // heap reference
  | { f: string } // float, as Python's repr
  | { int: string } // int beyond 2^53
  | { str: string; len: number } // a string cut to the size cap
  | { repr: string }; // a module or builtin function

export type HeapObj =
  | { t: "list" | "tuple" | "deque" | "set" | "frozenset"; v: Value[]; n?: number; cls?: string; fields?: string[] }
  | { t: "dict"; v: [Value, Value][]; n?: number; cls?: string }
  | { t: "obj"; cls: string; v: Record<string, Value> }
  | { t: "fn" | "class"; name: string }
  | { t: "other"; cls: string; repr: string }
  | { t: "more" }; // beyond the per-snapshot object cap

export type Locals = Record<string, Value>;

export interface Step {
  /** l: line about to run, c: call, r: return, x: exception raised, end: program finished. */
  e: "l" | "c" | "r" | "x" | "end";
  ln: number;
  /** The call id of the frame. */
  c: number;
  /** Locals that changed, by call id. */
  v?: Record<string, Locals>;
  /** Globals, when they changed. */
  g?: Locals;
  /** Heap objects that changed, by id. */
  h?: Record<string, HeapObj>;
  /** Length of stdout so far. */
  o: number;
  /** [heap id, key] read / written by the line about to run. */
  rd?: [number, Value][];
  wr?: [number, Value][];
  /** [heap id or null for a str, the container's name, the index variable]. */
  px?: [number | null, string | null, string][];
  /** [heap id, attribute] read / written. */
  ar?: [number, string][];
  aw?: [number, string][];
  /** [heap id, method]: append, pop, popleft, heappush, in, ... */
  ops?: [number, string][];
  /** Return value (on "r"), exception text (on "x"). */
  r?: Value;
  raised?: boolean;
  x?: string;
}

export interface Call {
  fn: string;
  /** Parent call id; null for the module. */
  p: number | null;
  d: number;
  /** First and last step. */
  s: number;
  e?: number;
  args?: Locals;
  r?: Value;
  raised?: boolean;
  kind?: "module" | "class";
}

export interface TraceError {
  type: string;
  msg: string;
  line: number | null;
  tb: string;
  where?: "code" | "call";
}

export interface Capped {
  reason: "steps" | "time" | "size" | "depth" | "calls" | "watchdog";
  step: number;
  line: number | null;
}

export interface Trace {
  version: number;
  steps: Step[];
  calls: Call[];
  stdout: string;
  stdoutCapped?: boolean;
  counts: { steps: number; calls: number; maxDepth: number; lines: Record<string, number> };
  limits: Record<string, number>;
  error?: TraceError;
  capped?: Capped;
  result?: Value;
  final?: { v?: Record<string, Locals>; g?: Locals; h?: Record<string, HeapObj> };
}
