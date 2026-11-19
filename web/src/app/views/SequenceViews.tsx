// Arrays (with pointers and a shaded window), tables, stacks, queues, hash maps, sets and
// heaps: the structures drawn as rows and columns of cells.
import type { CSSProperties } from "react";
import type { View } from "../../detect/detect";
import { heapLayout } from "../../detect/layout";
import { cell, show } from "../../trace/format";
import { isRef } from "../../trace/model";
import type { Value } from "../../trace/types";
import { changedIndices, items, justRan, type Scene, valueAt, ViewFrame } from "./common";

const vars = (o: Record<string, number | string>) => o as CSSProperties;

/** Cell width for the widest value, so (4, 'Q') fits; one width per array keeps pointers aligned. */
export const cellWidth = (labels: string[]) => `${Math.max(40, Math.round(Math.max(0, ...labels.map((l) => l.length)) * 8.6 + 14))}px`;

function Cells({
  values,
  scene,
  id,
  window,
  label,
}: {
  values: Value[];
  scene: Scene;
  id: number | undefined;
  window?: [number, number] | null;
  label: string;
}) {
  const { read, wrote } = justRan(scene.model, scene.step, id);
  const changed = changedIndices(scene.model, scene.step, id);
  return (
    <ol className="cells" aria-label={label}>
      {values.map((v, i) => {
        const key = JSON.stringify(i);
        const cls = [
          "cell",
          wrote.has(key) || changed.has(i) ? "is-written" : read.has(key) ? "is-read" : "",
          window && i >= window[0] && i <= window[1] ? "in-window" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <li key={i} className={cls}>
            <span className="cell-value">{cell(v, scene.model, scene.step)}</span>
            <span className="cell-index">{i}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function ArrayView({ view, scene }: { view: View; scene: Scene }) {
  const { value, stale } = valueAt(scene.model, view, scene.step);
  const obj = scene.model.deref(value, scene.step);
  const values: Value[] = typeof value === "string" ? [...value] : items(obj);
  const id = isRef(value) ? value.r : undefined;
  const pointers: { name: string; at: number }[] = [];
  for (const p of view.pointers ?? []) {
    const v = scene.model.resolve(p, scene.step, view.scope) ?? scene.model.resolve(p, scene.step);
    if (typeof v === "number" && Number.isInteger(v) && v >= -1 && v <= values.length) pointers.push({ name: p, at: v });
  }
  let window: [number, number] | null = null;
  if (view.window) {
    const [a, b] = view.window.map((n) => pointers.find((p) => p.name === n)?.at);
    if (a !== undefined && b !== undefined && a <= b) window = [Math.max(0, a), Math.min(values.length - 1, b)];
  }
  const stacked = new Map<number, number>();
  const placed = pointers.map((p) => {
    const row = stacked.get(p.at) ?? 0;
    stacked.set(p.at, row + 1);
    return { ...p, row };
  });
  const rows = Math.max(1, ...[...stacked.values()]);
  const more = obj && "n" in obj && obj.n ? obj.n - values.length : 0;
  const description = `${view.name}: ${values.length} items${placed.length ? `; ${placed.map((p) => `${p.name} at ${p.at}`).join(", ")}` : ""}.`;
  return (
    <ViewFrame view={view} scene={scene} stale={stale} description={description} detail={pointers.length ? `${pointers.length} pointer${pointers.length > 1 ? "s" : ""}` : undefined}>
      <div className="scroll-x" tabIndex={0} role="region" aria-label={`${view.name}, scrollable`}>
        <div className="array" style={vars({ "--rows": rows, "--cell": cellWidth(values.map((v) => cell(v, scene.model, scene.step))) })}>
          <Cells values={values} scene={scene} id={id} window={window} label={view.name} />
          <div className="pointers" aria-hidden="true">
            {placed.map((p) => (
              <span key={p.name} className="pointer" style={vars({ "--at": p.at, "--row": p.row })}>
                <svg viewBox="0 0 12 14" className="pointer-arrow">
                  <path d="M6 13V2M2 6l4-4 4 4" />
                </svg>
                <span className="hand">{p.name}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      {more > 0 && <p className="view-note">and {more} more items not drawn</p>}
    </ViewFrame>
  );
}

export function GridView({ view, scene }: { view: View; scene: Scene }) {
  const { value, stale } = valueAt(scene.model, view, scene.step);
  const grid = scene.model.deref(value, scene.step);
  const rows = items(grid).map((r) => ({ id: isRef(r) ? r.r : undefined, values: items(scene.model.deref(r, scene.step)) }));
  const width = Math.max(0, ...rows.map((r) => r.values.length));
  const description = `${view.name}: a table of ${rows.length} rows and ${width} columns.`;
  return (
    <ViewFrame view={view} scene={scene} stale={stale} description={description} detail={`${rows.length} × ${width}`}>
      <div className="scroll-x" tabIndex={0} role="region" aria-label={`${view.name}, scrollable`}>
        <table className="grid">
          <thead>
            <tr>
              <td />
              {Array.from({ length: width }, (_, c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              const { read, wrote } = justRan(scene.model, scene.step, row.id);
              const changed = changedIndices(scene.model, scene.step, row.id);
              return (
                <tr key={r}>
                  <th scope="row">{r}</th>
                  {row.values.map((v, c) => {
                    const k = JSON.stringify(c);
                    const cls = wrote.has(k) || changed.has(c) ? "is-written" : read.has(k) ? "is-read" : "";
                    return (
                      <td key={c} className={cls}>
                        {cell(v, scene.model, scene.step)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ViewFrame>
  );
}

export function StackQueueView({ view, scene }: { view: View; scene: Scene }) {
  const { value, stale } = valueAt(scene.model, view, scene.step);
  const obj = scene.model.deref(value, scene.step);
  const id = isRef(value) ? value.r : undefined;
  const values = items(obj);
  const changed = changedIndices(scene.model, scene.step, id);
  const { ops } = justRan(scene.model, scene.step, id);
  const stack = view.kind === "stack";
  const ordered = stack ? values.map((v, i) => ({ v, i })).reverse() : values.map((v, i) => ({ v, i }));
  const description = `${view.name}: ${values.length} items${values.length ? `, ${stack ? "top" : "front"} is ${show(stack ? values.at(-1) : values[0], scene.model, scene.step, 0)}` : ""}.`;
  return (
    <ViewFrame view={view} scene={scene} stale={stale} description={description} detail={ops.length ? `last line: ${ops.join(", ")}` : undefined}>
      <div className={stack ? "stack" : "queue scroll-x"} tabIndex={stack ? undefined : 0} role={stack ? undefined : "region"} aria-label={stack ? undefined : `${view.name}, scrollable`}>
        {values.length === 0 && <p className="empty">empty</p>}
        {values.length > 0 && <span className="end-label">{stack ? "top" : "front"}</span>}
        <ol className="slots" aria-label={view.name}>
          {ordered.map(({ v, i }) => (
            <li key={i} className={changed.has(i) ? "slot is-written" : "slot"}>
              {cell(v, scene.model, scene.step)}
            </li>
          ))}
        </ol>
        {values.length > 1 && <span className="end-label">{stack ? "bottom" : "back"}</span>}
      </div>
    </ViewFrame>
  );
}

export function MapView({ view, scene }: { view: View; scene: Scene }) {
  const { value, stale } = valueAt(scene.model, view, scene.step);
  const obj = scene.model.deref(value, scene.step);
  const id = isRef(value) ? value.r : undefined;
  const before = id !== undefined && scene.step > 0 ? scene.model.obj(id, scene.step - 1) : undefined;
  const prev = new Map(before?.t === "dict" ? before.v.map(([k, v]) => [JSON.stringify(k), JSON.stringify(v)] as const) : []);
  const { read } = justRan(scene.model, scene.step, id);
  const entries = obj?.t === "dict" ? obj.v : [];
  // Nested lists inside the values change without the dict changing: compare their text too.
  const prevText = new Map(
    before?.t === "dict" ? before.v.map(([k, v]) => [JSON.stringify(k), show(v, scene.model, scene.step - 1, 1)] as const) : [],
  );
  return (
    <ViewFrame view={view} scene={scene} stale={stale} description={`${view.name}: ${entries.length} keys.`} detail={`${entries.length} key${entries.length === 1 ? "" : "s"}`}>
      {entries.length === 0 ? (
        <p className="empty">empty</p>
      ) : (
        <table className="map">
          <thead>
            <tr>
              <th scope="col">key</th>
              <th scope="col">value</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([k, v]) => {
              const key = JSON.stringify(k);
              const text = show(v, scene.model, scene.step, 1);
              const isNew = !prev.has(key) && scene.step > 0;
              const changed = prev.has(key) && (prev.get(key) !== JSON.stringify(v) || prevText.get(key) !== text);
              const cls = isNew || changed ? "is-written" : read.has(key) ? "is-read" : "";
              return (
                <tr key={key} className={cls}>
                  <th scope="row">{show(k, scene.model, scene.step, 0)}</th>
                  <td>{text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </ViewFrame>
  );
}

export function SetView({ view, scene }: { view: View; scene: Scene }) {
  const { value, stale } = valueAt(scene.model, view, scene.step);
  const obj = scene.model.deref(value, scene.step);
  const id = isRef(value) ? value.r : undefined;
  const before = new Set(items(id !== undefined && scene.step > 0 ? scene.model.obj(id, scene.step - 1) : undefined).map((v) => JSON.stringify(v)));
  const values = items(obj);
  return (
    <ViewFrame view={view} scene={scene} stale={stale} description={`${view.name}: ${values.length} members.`} detail={`${values.length} member${values.length === 1 ? "" : "s"}`}>
      {values.length === 0 ? (
        <p className="empty">empty</p>
      ) : (
        <ul className="chips" aria-label={view.name}>
          {values.map((v) => (
            <li key={JSON.stringify(v)} className={!before.has(JSON.stringify(v)) && scene.step > 0 ? "chip is-written" : "chip"}>
              {cell(v, scene.model, scene.step)}
            </li>
          ))}
        </ul>
      )}
    </ViewFrame>
  );
}

const LEVEL_GAP = 56;

export function HeapView({ view, scene }: { view: View; scene: Scene }) {
  const { value, stale } = valueAt(scene.model, view, scene.step);
  const obj = scene.model.deref(value, scene.step);
  const id = isRef(value) ? value.r : undefined;
  const values = items(obj);
  const changed = changedIndices(scene.model, scene.step, id);
  const pos = heapLayout(values.length);
  const labels = values.map((v) => cell(v, scene.model, scene.step));
  const nodeW = Math.max(36, Math.max(0, ...labels.map((l) => l.length)) * 7.6 + 14);
  const NODE_GAP = Math.max(56, nodeW + 12);
  const width = Math.max(1, 2 ** Math.max(0, Math.floor(Math.log2(Math.max(1, values.length)))));
  const depth = Math.max(1, ...pos.map((p) => p.depth + 1));
  const W = width * NODE_GAP + 24;
  const H = depth * LEVEL_GAP;
  const x = (i: number) => 12 + (pos[i]!.x + 0.5) * NODE_GAP;
  const y = (i: number) => 24 + pos[i]!.depth * LEVEL_GAP;
  return (
    <ViewFrame view={view} scene={scene} stale={stale} description={`${view.name}: a heap of ${values.length}; the smallest, ${show(values[0], scene.model, scene.step, 0)}, is on top.`} detail={`${values.length} items, smallest on top`}>
      {values.length === 0 ? (
        <p className="empty">empty</p>
      ) : (
        <div className="heap">
          <div className="scroll-x" tabIndex={0} role="region" aria-label={`${view.name} as a tree, scrollable`}>
            <svg className="drawing" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
              {pos.map((p) => p.parent !== null && <line key={`e${p.i}`} className="edge" x1={x(p.parent)} y1={y(p.parent)} x2={x(p.i)} y2={y(p.i)} />)}
              {pos.map((p) => (
                <g key={p.i} className={changed.has(p.i) ? "node is-written" : "node"} transform={`translate(${x(p.i)} ${y(p.i)})`}>
                  <rect x={-nodeW / 2} y="-16" width={nodeW} height="32" rx="16" />
                  <text dy="0.35em">{labels[p.i]}</text>
                </g>
              ))}
            </svg>
          </div>
          <div style={vars({ "--cell": cellWidth(labels) })}>
            <Cells values={values} scene={scene} id={id} label={`${view.name} as an array`} />
          </div>
        </div>
      )}
    </ViewFrame>
  );
}
