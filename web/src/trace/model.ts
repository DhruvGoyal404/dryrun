// Replays a trace: the heap, every frame's locals and the globals at any step, from the
// deltas the tracer sends. Each object keeps its versions in step order, so a lookup is a
// binary search, and scrubbing to any step costs nothing up front.
import type { Call, HeapObj, Locals, Step, Trace, Value } from "./types";

class Versions<T> {
  readonly at: number[] = [];
  readonly values: T[] = [];
  push(step: number, value: T) {
    this.at.push(step);
    this.values.push(value);
  }
  /** The latest value at or before the step. */
  get(step: number): T | undefined {
    let lo = 0;
    let hi = this.at.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.at[mid]! <= step) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found < 0 ? undefined : this.values[found];
  }
  /** The step this value was set at, for "changed just now" highlights. */
  since(step: number): number | undefined {
    let found: number | undefined;
    for (const s of this.at) {
      if (s > step) break;
      found = s;
    }
    return found;
  }
}

export const isRef = (v: Value | undefined): v is { r: number } => typeof v === "object" && v !== null && "r" in v;

export class Model {
  readonly trace: Trace;
  readonly steps: Step[];
  readonly calls: Call[];
  private heap = new Map<number, Versions<HeapObj>>();
  private frames = new Map<number, Versions<Locals>>();
  private globalsV = new Versions<Locals>();
  /** For each call, its child call ids in order. */
  readonly children: number[][];

  constructor(trace: Trace) {
    this.trace = trace;
    this.calls = trace.calls;
    const steps = [...trace.steps];
    // Call mode: the returned value and its objects arrive after the last step.
    if (trace.final || trace.result !== undefined) {
      const last = steps.at(-1);
      steps.push({ e: "end", ln: last?.ln ?? 0, c: -1, o: trace.stdout.length, ...trace.final, r: trace.result });
    }
    this.steps = steps;
    steps.forEach((step, i) => {
      for (const [id, obj] of Object.entries(step.h ?? {})) {
        const key = Number(id);
        let v = this.heap.get(key);
        if (!v) this.heap.set(key, (v = new Versions()));
        v.push(i, obj);
      }
      for (const [cid, locals] of Object.entries(step.v ?? {})) {
        const key = Number(cid);
        let v = this.frames.get(key);
        if (!v) this.frames.set(key, (v = new Versions()));
        v.push(i, locals);
      }
      if (step.g) this.globalsV.push(i, step.g);
    });
    this.children = this.calls.map(() => []);
    this.calls.forEach((c, i) => {
      if (c.p !== null && c.p >= 0) this.children[c.p]?.push(i);
    });
  }

  get length() {
    return this.steps.length;
  }

  obj(id: number, step: number): HeapObj | undefined {
    return this.heap.get(id)?.get(step);
  }

  /** The step at which object `id` last changed, at or before `step`. */
  objChangedAt(id: number, step: number): number | undefined {
    return this.heap.get(id)?.since(step);
  }

  deref(v: Value | undefined, step: number): HeapObj | undefined {
    return isRef(v) ? this.obj(v.r, step) : undefined;
  }

  locals(cid: number, step: number): Locals | undefined {
    return this.frames.get(cid)?.get(step);
  }

  globals(step: number): Locals {
    return this.globalsV.get(step) ?? {};
  }

  /** Call ids from the outermost frame to the current one. */
  stack(step: number): number[] {
    const out: number[] = [];
    let c: number | null | undefined = this.steps[step]?.c;
    while (c !== null && c !== undefined && c >= 0) {
      out.unshift(c);
      c = this.calls[c]?.p;
    }
    return out;
  }

  /** A function frame's name, "<module>" for module level. */
  fn(cid: number): string {
    return this.calls[cid]?.fn ?? "<module>";
  }

  /**
   * Looks a name up the way Python would see it from the current frame: the nearest frame
   * of function `scope` on the stack (or the current frame), then the globals.
   */
  resolve(name: string, step: number, scope?: string): Value | undefined {
    const stack = this.stack(step);
    for (let i = stack.length - 1; i >= 0; i--) {
      const cid = stack[i]!;
      if (scope && scope !== "<module>" && this.fn(cid) !== scope) continue;
      const v = this.locals(cid, step)?.[name];
      if (v !== undefined) return v;
    }
    return this.globals(step)[name];
  }

  /** Every (scope, name) binding the trace ever had: function locals and globals. */
  bindings(): { scope: string; name: string }[] {
    const seen = new Map<string, { scope: string; name: string }>();
    for (const step of this.steps) {
      for (const [cid, locals] of Object.entries(step.v ?? {})) {
        const scope = this.fn(Number(cid));
        for (const name of Object.keys(locals)) seen.set(`${scope}\u0000${name}`, { scope, name });
      }
      for (const name of Object.keys(step.g ?? {})) seen.set(`<module>\u0000${name}`, { scope: "<module>", name });
    }
    return [...seen.values()];
  }

  /** Every value one binding took over the run, with the step it was seen at. */
  history(scope: string, name: string): { step: number; value: Value }[] {
    const out: { step: number; value: Value }[] = [];
    this.steps.forEach((step, i) => {
      if (scope === "<module>") {
        const v = step.g?.[name];
        if (v !== undefined) out.push({ step: i, value: v });
        return;
      }
      for (const [cid, locals] of Object.entries(step.v ?? {})) {
        if (this.fn(Number(cid)) === scope && locals[name] !== undefined) out.push({ step: i, value: locals[name]! });
      }
    });
    return out;
  }

  /** The user's own function calls (not the module or class bodies). */
  fnCalls(): number[] {
    return this.calls.flatMap((c, i) => (c.kind ? [] : [i]));
  }
}
