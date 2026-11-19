// Drawings of object graphs: linked lists, binary trees, graphs and the recursion tree. All
// SVG, laid out by detect/layout.ts in abstract units and scaled here.
import { useMemo, useState } from "react";
import type { View } from "../../detect/detect";
import { keyOf } from "../../detect/detect";
import { binaryTrees, graphLayout, linkedChains, memoHits, payload as payloadOf, pointersTo, recursionLayout, visitOrder } from "../../detect/layout";
import { cell, show } from "../../trace/format";
import { isRef } from "../../trace/model";
import type { Value } from "../../trace/types";
import { items, type Scene, valueAt, ViewFrame } from "./common";

const BOX_W = 52;
const BOX_H = 36;
const ARROW = 34;

function Tags({ names, x, y }: { names: string[]; x: number; y: number }) {
  if (!names.length) return null;
  return (
    <g className="tag" transform={`translate(${x} ${y})`}>
      <path d="M0 -2V-12" className="tag-line" />
      <text y="-16" className="hand">
        {names.join(", ")}
      </text>
    </g>
  );
}

export function LinkedView({ view, scene }: { view: View; scene: Scene }) {
  const { chains, labels } = linkedChains(scene.model, scene.step);
  const ptrs = pointersTo(scene.model, scene.step);
  const rowH = BOX_H + 56;
  const width = Math.max(1, ...chains.map((c) => c.ids.length)) * (BOX_W + ARROW) + 70;
  const height = Math.max(1, chains.length) * rowH;
  const prevStep = scene.model.steps[scene.step - 1];
  const rewired = new Set((prevStep?.aw ?? []).filter(([, a]) => a === "next").map(([id]) => id));
  const description = chains.length
    ? chains.map((c) => c.ids.map((id) => show(labels.get(id), scene.model, scene.step, 0)).join(" → ") + (c.cycleTo ? " → back (cycle)" : c.joins ? " → joins another list" : " → None")).join("; ")
    : "No list nodes in scope.";
  return (
    <ViewFrame view={view} scene={scene} description={description} detail={`${labels.size} node${labels.size === 1 ? "" : "s"}`}>
      {chains.length === 0 ? (
        <p className="empty">no nodes in scope</p>
      ) : (
        <div className="scroll-x" tabIndex={0} role="region" aria-label="linked list, scrollable">
          <svg className="drawing" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
            <defs>
              <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10z" className="arrowhead" />
              </marker>
            </defs>
            {chains.map((chain, r) => {
              const y = 36 + r * rowH;
              const end = chain.ids.length * (BOX_W + ARROW);
              return (
                <g key={r}>
                  {chain.ids.map((id, i) => {
                    const x = 8 + i * (BOX_W + ARROW);
                    return (
                      <g key={id} className={rewired.has(id) ? "lnode is-written" : "lnode"}>
                        <rect x={x} y={y} width={BOX_W} height={BOX_H} rx="4" />
                        <text x={x + BOX_W / 2} y={y + BOX_H / 2} dy="0.35em">
                          {cell(labels.get(id), scene.model, scene.step)}
                        </text>
                        <line className="edge" x1={x + BOX_W} y1={y + BOX_H / 2} x2={x + BOX_W + ARROW - 4} y2={y + BOX_H / 2} markerEnd="url(#arrowhead)" />
                        <Tags names={ptrs.get(id) ?? []} x={x + BOX_W / 2} y={y} />
                      </g>
                    );
                  })}
                  <text className="none-label" x={end + 12} y={y + BOX_H / 2} dy="0.35em">
                    {chain.cycleTo !== undefined ? `↺ ${show(labels.get(chain.cycleTo), scene.model, scene.step, 0)}` : chain.joins !== undefined ? `→ ${show(labels.get(chain.joins), scene.model, scene.step, 0)}` : "None"}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </ViewFrame>
  );
}

export function TreeView({ view, scene }: { view: View; scene: Scene }) {
  const { nodes, width, depth } = binaryTrees(scene.model, scene.step);
  const ptrs = pointersTo(scene.model, scene.step);
  const order = visitOrder(scene.model, scene.step);
  const visited = new Map(order.map((id, i) => [id, i + 1]));
  const GAP = 48;
  const LEVEL = 64;
  const W = width * GAP + 40;
  const H = depth * LEVEL + 24;
  const pos = new Map(nodes.map((n) => [n.id, { x: 20 + n.x * GAP + GAP / 2, y: 40 + n.depth * LEVEL }]));
  const stack = scene.model.stack(scene.step);
  const currentLocals = stack.length ? scene.model.locals(stack.at(-1)!, scene.step) ?? {} : {};
  const here = new Set(Object.values(currentLocals).filter(isRef).map((v) => v.r));
  const description = nodes.length
    ? `A binary tree of ${nodes.length} nodes. Visited so far, in order: ${order.map((id) => show(nodes.find((n) => n.id === id)?.label, scene.model, scene.step, 0)).join(", ") || "none"}.`
    : "No tree nodes in scope.";
  return (
    <ViewFrame view={view} scene={scene} description={description} detail={`${nodes.length} node${nodes.length === 1 ? "" : "s"}${order.length ? `, ${order.length} visited` : ""}`}>
      {nodes.length === 0 ? (
        <p className="empty">no nodes in scope</p>
      ) : (
        <div className="scroll-x" tabIndex={0} role="region" aria-label="binary tree, scrollable">
          <svg className="drawing" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
            {nodes.map((n) =>
              [n.left, n.right].map(
                (c) => c !== undefined && pos.has(c) && <line key={`${n.id}-${c}`} className="edge" x1={pos.get(n.id)!.x} y1={pos.get(n.id)!.y} x2={pos.get(c)!.x} y2={pos.get(c)!.y} />,
              ),
            )}
            {nodes.map((n) => {
              const p = pos.get(n.id)!;
              const cls = ["node", here.has(n.id) ? "is-current" : "", visited.has(n.id) ? "is-visited" : ""].join(" ");
              return (
                <g key={n.id} className={cls} transform={`translate(${p.x} ${p.y})`}>
                  <circle r="18" />
                  <text dy="0.35em">{cell(n.label, scene.model, scene.step)}</text>
                  {visited.has(n.id) && (
                    <text className="order hand" x="16" y="-14">
                      {visited.get(n.id)}
                    </text>
                  )}
                  <Tags names={ptrs.get(n.id)?.filter((name) => currentLocals[name] !== undefined) ?? []} x={-24} y={-8} />
                </g>
              );
            })}
          </svg>
        </div>
      )}
      {order.length > 0 && (
        <p className="view-note">
          visit order: <span className="mono">{order.map((id) => cell(nodes.find((n) => n.id === id)?.label, scene.model, scene.step)).join(", ")}</span>
        </p>
      )}
    </ViewFrame>
  );
}

export function GraphView({ view, scene }: { view: View; scene: Scene }) {
  const { value, stale } = valueAt(scene.model, view, scene.step);
  const layout = graphLayout(scene.model, value, scene.step);
  const set = (name?: string) => {
    if (!name) return new Set<string>();
    const v = scene.model.resolve(name, scene.step, view.scope);
    const o = scene.model.deref(v, scene.step);
    if (!o) return new Set<string>();
    const vals = o.t === "dict" ? o.v.map(([k]) => k) : items(o).map((x) => {
      const t = scene.model.deref(x, scene.step);
      return t && t.t === "tuple" && t.v.length ? t.v[t.v.length - 1]! : x;
    });
    return new Set(vals.map(keyOf));
  };
  const visited = set(view.visited);
  const frontier = set(view.frontier);
  // The node being expanded: a local of the current frame holding a node key.
  const stack = scene.model.stack(scene.step);
  const locals = stack.length ? scene.model.locals(stack.at(-1)!, scene.step) ?? {} : {};
  const nodeKeys = new Set(layout?.nodes.map((n) => n.key));
  const current = new Map<string, string[]>();
  for (const [name, v] of Object.entries(locals)) {
    if (["start", "goal", "target", "end", "source", "src", "dst"].includes(name)) continue;
    const k = keyOf(v);
    if (nodeKeys.has(k) && typeof v !== "number") current.set(k, [...(current.get(k) ?? []), name]);
    else if (nodeKeys.has(k) && ["node", "u", "v", "cur", "curr", "town", "nxt", "neighbor", "neighbour"].includes(name)) current.set(k, [...(current.get(k) ?? []), name]);
  }
  if (!layout) {
    return (
      <ViewFrame view={view} scene={scene} stale={stale} description={`${view.name}: not drawable at this step.`}>
        <p className="empty">not a graph at this step</p>
      </ViewFrame>
    );
  }
  const GX = 110;
  const GY = 70;
  const W = layout.width * GX + 40;
  const H = layout.height * GY + 52;
  const at = new Map(layout.nodes.map((n) => [n.key, { x: 40 + n.x * GX, y: 58 + n.y * GY }]));
  const description = `${view.name}: ${layout.nodes.length} nodes, ${layout.edges.length} edges. ${view.visited ? `${visited.size} in ${view.visited}. ` : ""}${view.frontier ? `${frontier.size} in ${view.frontier}.` : ""}`;
  return (
    <ViewFrame
      view={view}
      scene={scene}
      stale={stale}
      description={description}
      detail={[view.weighted ? "weighted" : "", view.visited ? `${view.visited} shaded` : "", view.frontier ? `${view.frontier} outlined` : ""].filter(Boolean).join(", ")}
    >
      <ul className="legend" aria-label="legend">
        <li className="lg-current">being expanded</li>
        {view.visited && <li className="lg-visited">in {view.visited}</li>}
        {view.frontier && <li className="lg-frontier">in {view.frontier}</li>}
      </ul>
      <div className="scroll-x" tabIndex={0} role="region" aria-label={`${view.name}, scrollable`}>
        <svg className="drawing" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <defs>
            <marker id="garrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0L10 5L0 10z" className="arrowhead" />
            </marker>
          </defs>
          {layout.edges.map((e, i) => {
            const a = at.get(e.from)!;
            const b = at.get(e.to)!;
            const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            const ux = (b.x - a.x) / len;
            const uy = (b.y - a.y) / len;
            const mid = { x: (a.x + b.x) / 2 - uy * 10, y: (a.y + b.y) / 2 + ux * 10 };
            return (
              <g key={i}>
                <line className="edge" x1={a.x + ux * 19} y1={a.y + uy * 19} x2={b.x - ux * 21} y2={b.y - uy * 21} markerEnd="url(#garrow)" />
                {e.weight !== undefined && (
                  <text className="weight" x={mid.x} y={mid.y} dy="0.35em">
                    {cell(e.weight, scene.model, scene.step)}
                  </text>
                )}
              </g>
            );
          })}
          {layout.nodes.map((n) => {
            const p = at.get(n.key)!;
            const cls = ["node", visited.has(n.key) ? "is-visited" : "", frontier.has(n.key) ? "is-frontier" : "", current.has(n.key) ? "is-current" : ""].join(" ");
            return (
              <g key={n.key} className={cls} transform={`translate(${p.x} ${p.y})`}>
                <circle r="18" />
                <text dy="0.35em">{cell(n.value, scene.model, scene.step)}</text>
                {current.has(n.key) && <Tags names={current.get(n.key)!} x={0} y={-18} />}
              </g>
            );
          })}
        </svg>
      </div>
    </ViewFrame>
  );
}

export function RecursionView({ view, scene }: { view: View; scene: Scene }) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const memo = useMemo(() => memoHits(scene.model), [scene.model]);
  const { nodes, width, depth, total } = recursionLayout(scene.model, scene.step, { expanded, memo });
  const started = nodes.filter((n) => n.state !== "pending");
  // Containers passed along (the memo, the grid) would crowd every node: they show as […] or {…}.
  const arg = (a: Value, at: number) => {
    const o = scene.model.deref(a, at);
    if (!o) return cell(a, scene.model, at);
    if (o.t === "list" || o.t === "deque") return "[…]";
    if (o.t === "dict" || o.t === "set" || o.t === "frozenset") return "{…}";
    if (o.t === "obj") return cell(payloadOf(o.v), scene.model, at) || o.cls;
    return cell(a, scene.model, at);
  };
  const label = (id: number) => {
    const c = scene.model.calls[id]!;
    const args = Object.values(c.args ?? {})
      .map((a) => arg(a, c.s))
      .join(", ");
    return `${c.fn}(${args.length > 22 ? `${args.slice(0, 21)}…` : args})`;
  };
  // The return value sits inside the box, after the call: edges join box to box.
  const retText = (id: number, state: string) => {
    const c = scene.model.calls[id]!;
    return state === "returned" ? ` → ${cell(c.r, scene.model, c.e ?? scene.step)}` : state === "raised" ? " raised" : "";
  };
  const fullText = (id: number) => {
    const c = scene.model.calls[id]!;
    return label(id) + (c.e !== undefined ? retText(id, c.raised ? "raised" : "returned") : "");
  };
  const longest = Math.max(8, ...nodes.map((n) => fullText(n.id).length));
  const BOX = Math.round(longest * 7.4 + 16);
  const GX = BOX + 40;
  const GY = 64;
  const W = Math.max(1, width) * GX + 20;
  const H = depth * GY + 36;
  const pos = new Map(nodes.map((n) => [n.id, { x: 10 + n.x * GX + GX / 2, y: 30 + n.depth * GY }]));
  const memoCount = started.filter((n) => n.memo && n.state !== "active" && n.state !== "current").length;
  const toggle = (id: number) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const description = `${started.length} of ${total} calls made so far${memoCount ? `, ${memoCount} answered from the memo` : ""}.`;
  return (
    <ViewFrame view={view} scene={scene} description={description} detail={`${started.length} of ${total} calls${memoCount ? `, ${memoCount} memo hits` : ""}`}>
      <ul className="legend" aria-label="legend">
        <li className="lg-current">running now</li>
        <li className="lg-active">waiting on a call</li>
        <li className="lg-returned">returned</li>
        {memo.size > 0 && <li className="lg-memo">memo hit</li>}
      </ul>
      <div className="scroll-x" tabIndex={0} role="region" aria-label="recursion tree, scrollable">
        <svg className="drawing recursion" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          {nodes.map((n) => {
            if (n.parent === null || !pos.has(n.parent) || n.state === "pending") return null;
            const a = pos.get(n.parent)!;
            const b = pos.get(n.id)!;
            return <line key={`e${n.id}`} className={`edge ${n.state === "active" || n.state === "current" ? "is-path" : ""}`} x1={a.x} y1={a.y + 14} x2={b.x} y2={b.y - 14} />;
          })}
          {nodes.map((n) => {
            if (n.state === "pending") return null;
            const p = pos.get(n.id)!;
            const ret = retText(n.id, n.state).trim();
            const cls = ["call", `is-${n.state}`, n.memo ? "is-memo" : ""].join(" ");
            const text = label(n.id);
            return (
              <g key={n.id} className={cls} transform={`translate(${p.x} ${p.y})`}>
                <title>{`${text}${ret ? ` ${ret}` : ""}${n.memo ? ", from the memo" : ""}`}</title>
                <rect x={-BOX / 2} y="-14" width={BOX} height="28" rx="4" />
                <text dy="0.35em">
                  {text}
                  {ret && <tspan className="ret"> {ret}</tspan>}
                </text>
                {n.hidden > 0 && (
                  <g className="fold" role="button" tabIndex={0} aria-label={`Show ${n.hidden} hidden calls under ${text}`} onClick={() => toggle(n.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle(n.id)}>
                    <rect x={BOX / 2 + 4} y="-10" width="34" height="20" rx="10" />
                    <text x={BOX / 2 + 21} y="0" dy="0.35em">
                      +{n.hidden}
                    </text>
                  </g>
                )}
                {expanded.has(n.id) && n.hidden === 0 && scene.model.children[n.id]!.length > 0 && (
                  <g className="fold" role="button" tabIndex={0} aria-label={`Fold the calls under ${text}`} onClick={() => toggle(n.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle(n.id)}>
                    <rect x={BOX / 2 + 2} y="-9" width="18" height="18" rx="9" />
                    <text x={BOX / 2 + 11} y="0" dy="0.35em">
                      −
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {total > started.length && <p className="view-note">The tree grows as you step; {total - started.length} calls are still to come.</p>}
    </ViewFrame>
  );
}
