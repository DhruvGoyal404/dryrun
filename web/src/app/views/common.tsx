// What every view shares: finding its variable's value at a step, the line that just ran
// (whose reads and writes the view highlights), and the frame around the drawing.
import type { ReactNode } from "react";
import type { View } from "../../detect/detect";
import { isRef, type Model } from "../../trace/model";
import type { HeapObj, Value } from "../../trace/types";

export interface Scene {
  model: Model;
  step: number;
}

/**
 * The variable's value now, or, once its function has returned, its last value (stale):
 * after a call-mode run ends, the drawings keep showing what the function left behind.
 */
export function valueAt(model: Model, view: View, step: number): { value: Value | undefined; stale: boolean } {
  const live = model.resolve(view.name, step, view.scope);
  if (live !== undefined) return { value: live, stale: false };
  let last: Value | undefined;
  for (const h of model.history(view.scope, view.name)) {
    if (h.step > step) break;
    last = h.value;
  }
  return { value: last, stale: last !== undefined };
}

/** Keys of `id` the line that just ran read and wrote, and the operations it called. */
export function justRan(model: Model, step: number, id: number | undefined) {
  const prev = model.steps[step - 1];
  const read = new Set<string>();
  const wrote = new Set<string>();
  const ops: string[] = [];
  if (prev && id !== undefined) {
    for (const [r, k] of prev.rd ?? []) if (r === id) read.add(JSON.stringify(k));
    for (const [r, k] of prev.wr ?? []) if (r === id) wrote.add(JSON.stringify(k));
    for (const [r, m] of prev.ops ?? []) if (r === id) ops.push(m);
  }
  return { read, wrote, ops };
}

/** Indices whose value differs from the previous step (a write, a push, a pop). */
export function changedIndices(model: Model, step: number, id: number | undefined): Set<number> {
  const out = new Set<number>();
  if (id === undefined || step === 0) return out;
  const now = model.obj(id, step);
  const before = model.obj(id, step - 1);
  if (!now || !("v" in now) || !Array.isArray(now.v)) return out;
  if (!before || !("v" in before) || !Array.isArray(before.v)) {
    now.v.forEach((_, i) => out.add(i));
    return out;
  }
  const old = before.v as unknown[];
  now.v.forEach((v, i) => {
    if (JSON.stringify(v) !== JSON.stringify(old[i])) out.add(i);
  });
  return out;
}

/** Reads, writes and operations on the structure so far: the per-structure counters. */
export function opCounts(model: Model, view: View, step: number) {
  const refs = new Set<number>();
  for (const h of model.history(view.scope, view.name)) if (isRef(h.value)) refs.add(h.value.r);
  let reads = 0;
  let writes = 0;
  let calls = 0;
  for (let i = 0; i < step && i < model.length; i++) {
    const s = model.steps[i]!;
    for (const [r] of s.rd ?? []) if (refs.has(r)) reads++;
    for (const [r] of s.wr ?? []) if (refs.has(r)) writes++;
    for (const [r, m] of s.ops ?? []) if (refs.has(r) && m !== "in" && m !== "get") calls++;
    for (const [r, m] of s.ops ?? []) if (refs.has(r) && (m === "in" || m === "get")) reads++;
  }
  return { reads, writes, calls };
}

export const items = (o: HeapObj | undefined): Value[] => (o && "v" in o && Array.isArray(o.v) ? (o.v as Value[]) : []);

const KIND_LABEL: Record<View["kind"], string> = {
  array: "array",
  grid: "table",
  map: "hash map",
  set: "set",
  stack: "stack",
  queue: "queue",
  heap: "heap",
  linked: "linked list",
  tree: "binary tree",
  graph: "graph",
  recursion: "recursion tree",
};

export function ViewFrame({
  view,
  scene,
  detail,
  stale,
  children,
  description,
}: {
  view: View;
  scene: Scene;
  detail?: string;
  stale?: boolean;
  children: ReactNode;
  description: string;
}) {
  const id = `view-${view.kind}-${view.scope}-${view.name}`.replace(/[^\w-]/g, "_");
  const counts = view.scope !== "" ? opCounts(scene.model, view, scene.step) : null;
  const scope = view.scope && view.scope !== "<module>" ? `in ${view.scope}` : "";
  return (
    <section className={`view view-${view.kind}${stale ? " is-stale" : ""}`} aria-labelledby={id} data-kind={view.kind} data-name={view.name}>
      <header className="view-head">
        <h3 id={id}>
          <span className="view-name hand">{view.name}</span>
          <span className="view-kind">
            {KIND_LABEL[view.kind]}
            {scope && ` ${scope}`}
            {view.hinted && ", from your hint"}
            {detail && `, ${detail}`}
          </span>
        </h3>
        {counts && (counts.reads > 0 || counts.writes > 0 || counts.calls > 0) && (
          <p className="view-counts">
            <span>reads {counts.reads}</span>
            <span>writes {counts.writes}</span>
            {counts.calls > 0 && <span>calls {counts.calls}</span>}
          </p>
        )}
      </header>
      <p className="sr-only">{description}</p>
      {stale && <p className="view-note">Its function has returned; this is what it left behind.</p>}
      <div className="view-body">{children}</div>
    </section>
  );
}
