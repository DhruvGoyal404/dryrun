// Builders for hand-written traces in unit tests: each step lists only what the test is
// about; the builder fills in the event, line, frame and stdout fields.
import { Model } from "../trace/model";
import type { Call, HeapObj, Step, Trace, Value } from "../trace/types";

export const ref = (r: number) => ({ r });
export const list = (...v: Value[]): HeapObj => ({ t: "list", v });
export const deque = (...v: Value[]): HeapObj => ({ t: "deque", v });
export const tuple = (...v: Value[]): HeapObj => ({ t: "tuple", v });
export const set = (...v: Value[]): HeapObj => ({ t: "set", v });
export const dict = (...v: [Value, Value][]): HeapObj => ({ t: "dict", v });
export const obj = (cls: string, v: Record<string, Value>): HeapObj => ({ t: "obj", cls, v });

const MODULE: Call = { fn: "<module>", p: null, d: 0, s: 0, kind: "module" };

export function trace(steps: Partial<Step>[], calls: Partial<Call>[] = []): Trace {
  return {
    version: 1,
    steps: steps.map((s, i) => ({ e: "l", ln: i + 1, c: 0, o: 0, ...s })),
    calls: [MODULE, ...calls.map((c) => ({ fn: "f", p: 0, d: 1, s: 0, ...c }))],
    stdout: "",
    counts: { steps: steps.length, calls: calls.length, maxDepth: 1, lines: {} },
    limits: {},
  };
}

export const model = (steps: Partial<Step>[], calls: Partial<Call>[] = []) => new Model(trace(steps, calls));
