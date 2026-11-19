// Pure layouts for the drawn structures: positions in abstract units (one unit per node
// slot, one per level), so the views scale them. Deterministic: the same trace and step
// always give the same picture, and a node keeps its place as the run goes on.
import { isRef, type Model } from "../trace/model";
import type { Value } from "../trace/types";
import { keyOf } from "./detect";

// ---------------------------------------------------------------------------------------
// Recursion tree
// ---------------------------------------------------------------------------------------

export type CallState = "pending" | "active" | "current" | "returned" | "raised";

export interface CallNode {
  id: number;
  x: number;
  depth: number;
  parent: number | null;
  state: CallState;
  memo: boolean;
  /** Collapsed: this node stands for `hidden` descendants that aren't drawn. */
  hidden: number;
}

/** Calls drawn in the tree: the user's functions, not lambdas, comprehensions or __init__. */
export function treeCalls(model: Model): number[] {
  return model.fnCalls().filter((i) => {
    const fn = model.calls[i]!.fn;
    return !fn.startsWith("<") && fn !== "__init__";
  });
}

/**
 * A memo hit: a call that made no calls of its own and read a dict that some call of the
 * same function writes to (the memo). A base case makes no calls either, but reads no memo.
 */
export function memoHits(model: Model): Set<number> {
  const writtenBy = new Map<number, Set<string>>(); // dict id -> functions that write it
  const readsIn = new Map<number, Set<number>>(); // call id -> dict ids it read
  model.steps.forEach((step) => {
    const fn = model.calls[step.c]?.fn;
    if (!fn) return;
    for (const [id] of step.wr ?? []) {
      let s = writtenBy.get(id);
      if (!s) writtenBy.set(id, (s = new Set()));
      s.add(fn);
    }
    for (const [id] of step.rd ?? []) {
      let s = readsIn.get(step.c);
      if (!s) readsIn.set(step.c, (s = new Set()));
      s.add(id);
    }
  });
  const hits = new Set<number>();
  for (const i of treeCalls(model)) {
    if (model.children[i]!.some((c) => !model.calls[c]!.kind)) continue;
    const fn = model.calls[i]!.fn;
    if ([...(readsIn.get(i) ?? [])].some((id) => writtenBy.get(id)?.has(fn))) hits.add(i);
  }
  return hits;
}

/** Big trees: subtrees over `limit` nodes that don't hold the current call fold into one node. */
export function recursionLayout(model: Model, step: number, opts: { collapseOver?: number; expanded?: Set<number>; memo?: Set<number> } = {}) {
  const ids = new Set(treeCalls(model));
  const memo = opts.memo ?? memoHits(model);
  // Children of calls that aren't drawn (a helper called from a lambda) hang off the nearest drawn ancestor.
  const drawnParent = (i: number): number | null => {
    for (let p = model.calls[i]!.p; p !== null && p !== undefined && p >= 0; p = model.calls[p]!.p) {
      if (ids.has(p)) return p;
    }
    return null;
  };
  const childrenOf = new Map<number | null, number[]>();
  for (const i of ids) {
    const p = drawnParent(i);
    if (!childrenOf.has(p)) childrenOf.set(p, []);
    childrenOf.get(p)!.push(i);
  }
  const size = new Map<number, number>();
  const measure = (i: number): number => {
    const n = 1 + (childrenOf.get(i) ?? []).reduce((a, c) => a + measure(c), 0);
    size.set(i, n);
    return n;
  };
  const roots = childrenOf.get(null) ?? [];
  roots.forEach(measure);

  const current = model.steps[step]?.c ?? -1;
  const onPath = new Set<number>();
  for (let c: number | null | undefined = current; c !== null && c !== undefined && c >= 0; c = model.calls[c]?.p) onPath.add(c);
  const total = ids.size;
  const limit = opts.collapseOver ?? (total > 120 ? 20 : Infinity);

  const nodes: CallNode[] = [];
  let nextX = 0;
  const stateOf = (i: number): CallState => {
    const c = model.calls[i]!;
    if (c.s > step) return "pending";
    if (i === current) return "current";
    if (c.e !== undefined && c.e <= step) return c.raised ? "raised" : "returned";
    return "active";
  };
  const place = (i: number, depth: number, parent: number | null): number => {
    const children = childrenOf.get(i) ?? [];
    const fold = children.length > 0 && size.get(i)! > limit && !onPath.has(i) && !opts.expanded?.has(i);
    let x: number;
    if (fold || children.length === 0) x = nextX++;
    else {
      const xs = children.map((c) => place(c, depth + 1, i));
      x = (xs[0]! + xs[xs.length - 1]!) / 2;
    }
    nodes.push({ id: i, x, depth, parent, state: stateOf(i), memo: memo.has(i), hidden: fold ? size.get(i)! - 1 : 0 });
    return x;
  };
  for (const r of roots) place(r, 0, null);
  return { nodes, width: nextX, depth: Math.max(0, ...nodes.map((n) => n.depth)) + 1, total };
}

// ---------------------------------------------------------------------------------------
// Object structures: binary trees and linked lists
// ---------------------------------------------------------------------------------------

const VALUE_ATTRS = ["val", "value", "data", "key", "item"];

/** The attribute that holds a node's payload, for the label. */
export function payload(fields: Record<string, Value>): Value | undefined {
  for (const a of VALUE_ATTRS) if (a in fields) return fields[a];
  const other = Object.entries(fields).find(([k]) => !["next", "prev", "left", "right"].includes(k));
  return other?.[1];
}

/** Variables pointing at heap objects right now: object id -> names (current frame first). */
export function pointersTo(model: Model, step: number): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const add = (v: Value | undefined, name: string) => {
    if (!isRef(v)) return;
    const names = out.get(v.r) ?? [];
    if (!names.includes(name)) names.push(name);
    out.set(v.r, names);
  };
  const stack = model.stack(step);
  for (let i = stack.length - 1; i >= 0; i--) {
    for (const [name, v] of Object.entries(model.locals(stack[i]!, step) ?? {})) add(v, name);
  }
  for (const [name, v] of Object.entries(model.globals(step))) add(v, name);
  return out;
}

/** Every object reachable from the variables in scope, at this step. */
export function reachable(model: Model, step: number): Set<number> {
  const seen = new Set<number>();
  const queue = [...pointersTo(model, step).keys()];
  while (queue.length) {
    const id = queue.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const o = model.obj(id, step);
    if (!o) continue;
    const vals = o.t === "obj" ? Object.values(o.v) : o.t === "dict" ? o.v.flat() : "v" in o && Array.isArray(o.v) ? o.v : [];
    for (const v of vals as Value[]) if (isRef(v) && !seen.has(v.r)) queue.push(v.r);
  }
  return seen;
}

export interface TreeNodePos {
  id: number;
  x: number;
  depth: number;
  label: Value | undefined;
  left?: number;
  right?: number;
}

/** Binary trees: every reachable object with left/right, laid out in order (x) by depth (y). */
export function binaryTrees(model: Model, step: number) {
  const nodes = new Map<number, { left?: number; right?: number; label: Value | undefined }>();
  for (const id of reachable(model, step)) {
    const o = model.obj(id, step);
    if (o?.t !== "obj" || !("left" in o.v || "right" in o.v)) continue;
    const l = o.v.left;
    const r = o.v.right;
    nodes.set(id, { left: isRef(l) ? l.r : undefined, right: isRef(r) ? r.r : undefined, label: payload(o.v) });
  }
  const isChild = new Set<number>();
  for (const n of nodes.values()) {
    if (n.left !== undefined) isChild.add(n.left);
    if (n.right !== undefined) isChild.add(n.right);
  }
  const roots = [...nodes.keys()].filter((id) => !isChild.has(id)).sort((a, b) => a - b);
  const out: TreeNodePos[] = [];
  let nextX = 0;
  const seen = new Set<number>();
  const walk = (id: number | undefined, depth: number) => {
    if (id === undefined || !nodes.has(id) || seen.has(id) || depth > 64) return;
    seen.add(id);
    const n = nodes.get(id)!;
    walk(n.left, depth + 1);
    out.push({ id, x: nextX++, depth, label: n.label, left: nodes.has(n.left!) ? n.left : undefined, right: nodes.has(n.right!) ? n.right : undefined });
    walk(n.right, depth + 1);
  };
  for (const r of roots) {
    walk(r, 0);
    nextX += 0.5; // a gap between separate trees
  }
  return { nodes: out, width: Math.max(1, nextX), depth: Math.max(0, ...out.map((n) => n.depth)) + 1 };
}

/**
 * The order tree nodes were visited: the first time each node's payload was read
 * (`node.val`), which for a recursive in-order walk is in-order, for BFS level order.
 * Only reads by the function doing the latest reads count: building a search tree also
 * reads `root.val` (to compare), and that is not the walk being drawn.
 */
export function visitOrder(model: Model, upTo: number): number[] {
  const reads: { id: number; fn: string }[] = [];
  for (let i = 0; i <= upTo && i < model.length; i++) {
    const step = model.steps[i]!;
    for (const [id, attr] of step.ar ?? []) {
      if (!VALUE_ATTRS.includes(attr)) continue;
      const o = model.obj(id, i);
      if (o?.t === "obj" && ("left" in o.v || "right" in o.v)) reads.push({ id, fn: model.fn(step.c) });
    }
  }
  const walker = reads.at(-1)?.fn;
  const order: number[] = [];
  for (const r of reads) if (r.fn === walker && !order.includes(r.id)) order.push(r.id);
  return order;
}

export interface Chain {
  ids: number[];
  /** The node the last one points back to, when the chain has a cycle. */
  cycleTo?: number;
  /** The node the chain joins, when it runs into one already drawn. */
  joins?: number;
}

/** Linked lists: chains of reachable objects with `next`, from nodes nothing points to. */
export function linkedChains(model: Model, step: number): { chains: Chain[]; labels: Map<number, Value | undefined> } {
  const next = new Map<number, number | null>();
  const labels = new Map<number, Value | undefined>();
  for (const id of reachable(model, step)) {
    const o = model.obj(id, step);
    if (o?.t !== "obj" || !("next" in o.v)) continue;
    const n = o.v.next;
    next.set(id, isRef(n) ? n.r : null);
    labels.set(id, payload(o.v));
  }
  const pointedAt = new Set([...next.values()].filter((v): v is number => v !== null));
  const pointers = pointersTo(model, step);
  // Heads: nothing points at them; then any node a variable holds (a reversed half); then cycles.
  const starts = [
    ...[...next.keys()].filter((id) => !pointedAt.has(id)).sort((a, b) => a - b),
    ...[...next.keys()].filter((id) => pointers.has(id)).sort((a, b) => a - b),
    ...[...next.keys()].sort((a, b) => a - b),
  ];
  const drawn = new Set<number>();
  const chains: Chain[] = [];
  for (const start of starts) {
    if (drawn.has(start)) continue;
    const chain: Chain = { ids: [] };
    const local = new Set<number>();
    for (let id: number | null | undefined = start; id !== null && id !== undefined; id = next.get(id)) {
      if (local.has(id)) {
        chain.cycleTo = id;
        break;
      }
      if (drawn.has(id)) {
        chain.joins = id;
        break;
      }
      local.add(id);
      drawn.add(id);
      chain.ids.push(id);
      if (!next.has(id)) break;
    }
    chains.push(chain);
  }
  return { chains, labels };
}

// ---------------------------------------------------------------------------------------
// Graphs and heaps
// ---------------------------------------------------------------------------------------

export interface GraphLayout {
  nodes: { key: string; value: Value; x: number; y: number }[];
  edges: { from: string; to: string; weight?: Value }[];
  width: number;
  height: number;
}

/** Edges from an adjacency dict or list; layers by BFS distance from the first node. */
export function graphLayout(model: Model, adj: Value | undefined, step: number): GraphLayout | null {
  const o = model.deref(adj, step);
  if (!o || (o.t !== "dict" && o.t !== "list")) return null;
  const entries: [Value, Value][] = o.t === "dict" ? o.v : o.v.map((v, i) => [i, v]);
  const keys = entries.map(([k]) => k);
  const byKey = new Map(keys.map((k) => [keyOf(k), k]));
  const edges: GraphLayout["edges"] = [];
  const out = new Map<string, string[]>();
  for (const [k, v] of entries) {
    const list = model.deref(v, step);
    if (!list || !("v" in list) || !Array.isArray(list.v) || list.t === "dict") continue;
    for (const n of list.v as Value[]) {
      const pair = model.deref(n, step);
      const [to, weight] = pair && pair.t === "tuple" && pair.v.length === 2 ? [pair.v[0]!, pair.v[1]] : [n, undefined];
      const tk = keyOf(to);
      if (!byKey.has(tk)) byKey.set(tk, to);
      edges.push({ from: keyOf(k), to: tk, ...(weight !== undefined ? { weight } : {}) });
      out.set(keyOf(k), [...(out.get(keyOf(k)) ?? []), tk]);
    }
  }
  // Undirected graphs list each edge twice: draw it once.
  const seen = new Set<string>();
  const unique = edges.filter((e) => {
    const back = `${e.to}\u0000${e.from}`;
    if (seen.has(back) && edges.some((f) => f.from === e.to && f.to === e.from && keyOf(f.weight ?? null) === keyOf(e.weight ?? null))) return false;
    seen.add(`${e.from}\u0000${e.to}`);
    return true;
  });
  const layer = new Map<string, number>();
  for (const start of byKey.keys()) {
    if (layer.has(start)) continue;
    const base = Math.max(-1, ...layer.values()) + 1;
    layer.set(start, base);
    const queue = [start];
    while (queue.length) {
      const k = queue.shift()!;
      for (const n of out.get(k) ?? []) {
        if (!layer.has(n)) {
          layer.set(n, layer.get(k)! + 1);
          queue.push(n);
        }
      }
    }
  }
  const columns = new Map<number, string[]>();
  for (const [k, l] of layer) columns.set(l, [...(columns.get(l) ?? []), k]);
  const height = Math.max(1, ...[...columns.values()].map((c) => c.length));
  const nodes = [...layer].map(([key, l]) => {
    const col = columns.get(l)!;
    const i = col.indexOf(key);
    return { key, value: byKey.get(key)!, x: l, y: (height - col.length) / 2 + i };
  });
  return { nodes, edges: unique, width: Math.max(1, columns.size), height };
}

/** A heap array as a tree: index i's children are 2i + 1 and 2i + 2. */
export function heapLayout(n: number) {
  const depth = n === 0 ? 0 : Math.floor(Math.log2(n)) + 1;
  const width = 2 ** Math.max(0, depth - 1);
  return Array.from({ length: n }, (_, i) => {
    const d = Math.floor(Math.log2(i + 1));
    const pos = i + 1 - 2 ** d;
    const slots = 2 ** d;
    return { i, depth: d, x: ((pos + 0.5) / slots) * width - 0.5, parent: i === 0 ? null : Math.floor((i - 1) / 2) };
  });
}
