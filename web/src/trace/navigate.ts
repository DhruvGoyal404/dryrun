// Jumps along a trace: to the next or previous call, and to the next time a line runs.
import type { Model } from "./model";

/** The next step after `step` that enters a function, or null. */
export function nextCall(model: Model, step: number): number | null {
  for (let i = step + 1; i < model.length; i++) {
    const s = model.steps[i]!;
    if (s.e === "c" && !model.calls[s.c]?.kind) return i;
  }
  return null;
}

/** The nearest step before `step` that entered a function, or null. */
export function prevCall(model: Model, step: number): number | null {
  for (let i = step - 1; i >= 0; i--) {
    const s = model.steps[i]!;
    if (s.e === "c" && !model.calls[s.c]?.kind) return i;
  }
  return null;
}

/** The next step after `step` about to run `line`; wraps to the first if there is none after. */
export function runToLine(model: Model, step: number, line: number): number | null {
  const hit = (i: number) => model.steps[i]!.e === "l" && model.steps[i]!.ln === line;
  for (let i = step + 1; i < model.length; i++) if (hit(i)) return i;
  for (let i = 0; i <= step && i < model.length; i++) if (hit(i)) return i;
  return null;
}

/** Where to land after a run: the step with the error, the cap, or the start. */
export function landing(model: Model): number {
  if (model.trace.error) return Math.max(0, model.length - 1);
  return 0;
}

/** Depth of user function frames at a step. */
export function depthAt(model: Model, step: number): number {
  return model.stack(step).filter((c) => !model.calls[c]?.kind).length;
}
