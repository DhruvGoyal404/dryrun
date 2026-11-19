// Decides how to draw each variable, once per trace (so a view doesn't flicker between
// steps). Every rule looks at what the program *did* with a value, not only its shape:
// a list that is pushed and popped is a stack, one indexed by a moving integer is an array
// with pointers, one passed to heapq is a heap. A `# dryrun:` comment overrides any rule.
import { isRef, type Model } from "../trace/model";
import type { HeapObj, Value } from "../trace/types";

export type ViewKind =
  | "array"
  | "grid"
  | "map"
  | "set"
  | "stack"
  | "queue"
  | "heap"
  | "linked"
  | "tree"
  | "graph"
  | "recursion";

export interface View {
  kind: ViewKind;
  /** The function whose local this is, or "<module>". Empty for whole-heap views. */
  scope: string;
  /** The variable name; for linked lists and trees, the node class. */
  name: string;
  /** Index variables drawn as arrows under an array. */
  pointers?: string[];
  /** Two pointers whose span is shaded (a window, or a binary search's range). */
  window?: [string, string];
  /** For graphs: the variables holding visited nodes and the frontier. */
  visited?: string;
  frontier?: string;
  weighted?: boolean;
  /** Set when a `# dryrun:` comment chose this view. */
  hinted?: boolean;
}

export interface Hint {
  kind: ViewKind | "hide";
  names: string[];
  line: number;
}

const KINDS = new Set(["array", "grid", "map", "set", "stack", "queue", "heap", "linked", "tree", "graph", "recursion", "hide"]);

/** `# dryrun: grid dp`, `# dryrun: array nums lo hi`, `# dryrun: hide tmp`. Unknown kinds are reported. */
export function parseHints(code: string): { hints: Hint[]; problems: string[] } {
  const hints: Hint[] = [];
  const problems: string[] = [];
  code.split("\n").forEach((text, i) => {
    const m = /#\s*dryrun:\s*(\w+)\s*([\w\s,]*)$/.exec(text);
    if (!m) return;
    const kind = m[1]!.toLowerCase();
    const names = m[2]!.split(/[\s,]+/).filter(Boolean);
    if (!KINDS.has(kind)) problems.push(`line ${i + 1}: unknown view "${kind}"`);
    else hints.push({ kind: kind as Hint["kind"], names, line: i + 1 });
  });
  return { hints, problems };
}

const POINTER_NAMES = new Set(
  "i j k l r lo hi low high mid left right start end slow fast p q p1 p2 read write head tail".split(" "),
);
const WINDOW_PAIRS: [string, string][] = [
  ["left", "right"],
  ["l", "r"],
  ["lo", "hi"],
  ["low", "high"],
  ["start", "end"],
];
const GRAPH_NAMES = /^(graph|adj|adjacency|g|neighbou?rs|edges|roads|links)$/i;
const VISITED_NAMES = /visit|seen|done|settled|dist|best|cost/i;
const HEAPQ = new Set(["heappush", "heappop", "heapify", "heappushpop", "heapreplace"]);

const isScalar = (v: Value) =>
  v === null || typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= 3) || (typeof v === "object" && "f" in v);

/** A rectangular list of lists of scalars, at least 2 x 1. */
export function isGrid(model: Model, obj: HeapObj | undefined, step: number): boolean {
  if (!obj || obj.t !== "list" || obj.v.length < 2) return false;
  let width = -1;
  for (const row of obj.v) {
    const r = model.deref(row, step);
    if (!r || r.t !== "list" || r.v.length === 0 || !r.v.every(isScalar)) return false;
    if (width >= 0 && r.v.length !== width) return false;
    width = r.v.length;
  }
  return true;
}

/** Elements of a sequence-like object, or the keys of a dict. */
export function members(model: Model, obj: HeapObj | undefined, step: number): Value[] {
  if (!obj) return [];
  if (obj.t === "dict") return obj.v.map(([k]) => k);
  if ("v" in obj && Array.isArray(obj.v)) {
    // Dijkstra's heap holds (cost, node): the node is the last element of each tuple.
    return obj.v.map((v) => {
      const t = model.deref(v, step);
      return t && t.t === "tuple" && t.v.length > 0 ? t.v[t.v.length - 1]! : v;
    });
  }
  return [];
}

export const keyOf = (v: Value) => JSON.stringify(v);

/**
 * Adjacency: a dict (or list) whose values are lists/sets/tuples naming other nodes. Returns
 * the node keys, or null if it isn't one. Weighted when neighbours are (node, weight) pairs.
 */
export function adjacency(model: Model, obj: HeapObj | undefined, step: number, named: boolean) {
  if (!obj) return null;
  let entries: [Value, Value][];
  if (obj.t === "dict") entries = obj.v;
  else if (obj.t === "list") entries = obj.v.map((v, i) => [i, v]);
  else return null;
  if (entries.length < 2) return null;
  const keys = new Set(entries.map(([k]) => keyOf(k)));
  let hits = 0;
  let total = 0;
  let weighted = false;
  let ragged = false;
  let width = -1;
  for (const [, v] of entries) {
    const list = model.deref(v, step);
    if (!list || !("v" in list) || !Array.isArray(list.v) || list.t === "dict") return null;
    if (width >= 0 && list.v.length !== width) ragged = true;
    width = list.v.length;
    for (const n of list.v) {
      const pair = model.deref(n, step);
      let target: Value = n;
      if (pair && pair.t === "tuple" && pair.v.length === 2) {
        target = pair.v[0]!;
        weighted = true;
      }
      total++;
      if (keys.has(keyOf(target))) hits++;
    }
  }
  if (total === 0 || hits / total < 0.5) return null;
  // A rectangular list of int lists is far more often a grid, unless its name says graph.
  if (obj.t === "list" && !ragged && !named && !weighted) return null;
  return { keys: entries.map(([k]) => k), weighted };
}

interface Usage {
  ops: Map<number, Set<string>>;
  pointers: Map<number, Set<string>>;
  strPointers: Map<string, Set<string>>;
  touched: Set<number>;
}

function usage(model: Model): Usage {
  const ops = new Map<number, Set<string>>();
  const pointers = new Map<number, Set<string>>();
  const strPointers = new Map<string, Set<string>>();
  const touched = new Set<number>();
  const add = <K>(m: Map<K, Set<string>>, k: K, v: string) => {
    let s = m.get(k);
    if (!s) m.set(k, (s = new Set()));
    s.add(v);
  };
  for (const step of model.steps) {
    for (const [id, method] of step.ops ?? []) add(ops, id, method);
    for (const [id, base, index] of step.px ?? []) {
      if (id !== null) add(pointers, id, index);
      else if (base) add(strPointers, `${model.fn(step.c)}\u0000${base}`, index);
    }
    for (const [id] of step.rd ?? []) touched.add(id);
    for (const [id] of step.wr ?? []) touched.add(id);
  }
  return { ops, pointers, strPointers, touched };
}

const ORDER: ViewKind[] = ["grid", "graph", "tree", "linked", "heap", "array", "stack", "queue", "map", "set", "recursion"];

/** True when some function calls itself, directly or through another. */
export function hasRecursion(model: Model): boolean {
  return model.calls.some((c) => {
    if (c.kind) return false;
    for (let p = c.p; p !== null && p !== undefined && p >= 0; p = model.calls[p]?.p ?? null) {
      if (model.calls[p]?.fn === c.fn) return true;
    }
    return false;
  });
}

export function detect(model: Model, code: string): View[] {
  const { hints } = parseHints(code);
  const hinted = new Map<string, Hint>();
  const hidden = new Set<string>();
  for (const h of hints) {
    if (h.kind === "hide") h.names.forEach((n) => hidden.add(n));
    else if (h.names[0]) hinted.set(h.names[0], h);
  }
  const use = usage(model);
  const views: View[] = [];
  const objectKinds = new Set<"linked" | "tree">();
  const nodeClasses = new Map<string, string>();

  for (const { scope, name } of model.bindings()) {
    if (hidden.has(name)) continue;
    const history = model.history(scope, name);
    const refs = new Set<number>();
    let last: { obj?: HeapObj; str?: string; step: number } | undefined;
    for (const { step, value } of history) {
      if (isRef(value)) {
        refs.add(value.r);
        const obj = model.obj(value.r, step);
        if (obj && obj.t !== "more") last = { obj, step };
      } else if (typeof value === "string") last = { str: value, step };
    }
    if (!last) continue;
    const ops = new Set<string>();
    const pointers = new Set<string>();
    let touched = false;
    for (const r of refs) {
      use.ops.get(r)?.forEach((o) => ops.add(o));
      use.pointers.get(r)?.forEach((p) => pointers.add(p));
      if (use.touched.has(r)) touched = true;
    }
    use.strPointers.get(`${scope}\u0000${name}`)?.forEach((p) => pointers.add(p));

    const hint = hinted.get(name);
    const obj = last.obj;
    let kind: ViewKind | null = null;
    const extra: Partial<View> = {};

    if (obj?.t === "obj") {
      const attrs = Object.keys(obj.v);
      const shape = attrs.includes("left") || attrs.includes("right") ? "tree" : attrs.includes("next") ? "linked" : null;
      if (shape) {
        objectKinds.add(shape);
        nodeClasses.set(shape, obj.cls);
      }
    }

    if (hint && hint.kind !== "hide") {
      kind = hint.kind;
      if (hint.kind === "linked" || hint.kind === "tree") {
        objectKinds.add(hint.kind);
        continue;
      }
      if (hint.names.length > 1 && hint.kind === "array") extra.pointers = hint.names.slice(1);
      if (hint.names.length > 1 && hint.kind === "graph") extra.visited = hint.names[1];
    } else if (last.str !== undefined) {
      if (pointers.size > 0) kind = "array";
    } else if (obj) {
      const graph = adjacency(model, obj, last.step, GRAPH_NAMES.test(name));
      if ([...ops].some((o) => HEAPQ.has(o))) kind = "heap";
      else if (obj.t === "list" && isGrid(model, obj, last.step)) kind = "grid";
      else if (graph) {
        kind = "graph";
        extra.weighted = graph.weighted;
      } else if (obj.t === "deque") kind = ops.has("popleft") || ops.has("appendleft") || !ops.has("pop") ? "queue" : "stack";
      else if (obj.t === "list" && ops.has("append") && ops.has("pop") && pointers.size === 0) kind = "stack";
      else if ((obj.t === "list" || obj.t === "tuple") && (pointers.size > 0 || touched)) kind = "array";
      else if (obj.t === "dict") kind = "map";
      else if (obj.t === "set" || obj.t === "frozenset") kind = "set";
    }
    if (!kind) continue;
    const view: View = { kind, scope, name, ...extra, ...(hint ? { hinted: true } : {}) };
    if (kind === "array") {
      const ptrs = new Set(view.pointers ?? pointers);
      if (!view.pointers) {
        // Pointer-named ints in the same scope (binary search's lo and hi are never indexes).
        for (const b of model.bindings()) {
          if (b.scope !== scope || !POINTER_NAMES.has(b.name) || ptrs.size === 0) continue;
          if (model.history(b.scope, b.name).every(({ value }) => typeof value === "number")) ptrs.add(b.name);
        }
      }
      view.pointers = [...ptrs];
      view.window = WINDOW_PAIRS.find(([a, b]) => ptrs.has(a) && ptrs.has(b));
      if (!view.window && ptrs.has("left") && ptrs.has("right")) view.window = ["left", "right"];
    }
    views.push(view);
  }

  // Graphs: mark visited sets and frontiers that hold the graph's nodes.
  for (const g of views.filter((v) => v.kind === "graph")) {
    const candidates = views.filter((v) => v !== g && v.scope === g.scope);
    if (!g.visited) {
      const sets = candidates.filter((v) => v.kind === "set" || v.kind === "map");
      g.visited = (sets.find((v) => VISITED_NAMES.test(v.name) && v.kind === "set") ?? sets.find((v) => VISITED_NAMES.test(v.name)) ?? sets[0])?.name;
    }
    g.frontier = candidates.find((v) => v.kind === "queue" || v.kind === "stack" || v.kind === "heap")?.name;
  }

  for (const kind of objectKinds) {
    const hint = hints.find((h) => h.kind === kind);
    views.push({ kind, scope: "", name: nodeClasses.get(kind) ?? hint?.names[0] ?? kind, ...(hint ? { hinted: true } : {}) });
  }
  if (hasRecursion(model) || hints.some((h) => h.kind === "recursion")) views.push({ kind: "recursion", scope: "", name: "calls" });

  return views.sort((a, b) => Number(!!b.hinted) - Number(!!a.hinted) || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}
