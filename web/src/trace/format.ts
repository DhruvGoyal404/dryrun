// Values as short Python-looking text: [1, 2, 3], {'a': 1}, Node(val=3, next=…).
import { isRef, type Model } from "./model";
import type { Value } from "./types";

const pyStr = (s: string) => `'${s.replaceAll("\\", "\\\\").replaceAll("'", "\\'").replaceAll("\n", "\\n")}'`;

export function show(v: Value | undefined, model: Model | null, step: number, depth = 2, seen = new Set<number>()): string {
  if (v === undefined) return "";
  if (v === null) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return pyStr(v);
  if ("f" in v) return v.f;
  if ("int" in v) return v.int.length > 24 ? `${v.int.slice(0, 10)}…${v.int.slice(-6)} (${v.int.length} digits)` : v.int;
  if ("str" in v) return `${pyStr(v.str)}… (${v.len} chars)`;
  if ("repr" in v) return v.repr;
  if (!isRef(v) || !model) return "…";
  const o = model.obj(v.r, step);
  if (!o || o.t === "more") return "…";
  if (seen.has(v.r)) return "↻";
  if (depth < 0) return o.t === "obj" ? `${o.cls}(…)` : "…";
  const inner = new Set(seen).add(v.r);
  const sub = (x: Value) => show(x, model, step, depth - 1, inner);
  const more = (n: number | undefined, shown: number) => (n && n > shown ? `, … ${n - shown} more` : "");
  switch (o.t) {
    case "list":
      return `[${o.v.map(sub).join(", ")}${more(o.n, o.v.length)}]`;
    case "tuple":
      if (o.fields) return `${o.cls}(${o.v.map((x, i) => `${o.fields![i]}=${sub(x)}`).join(", ")})`;
      return `(${o.v.map(sub).join(", ")}${o.v.length === 1 ? "," : ""}${more(o.n, o.v.length)})`;
    case "deque":
      return `deque([${o.v.map(sub).join(", ")}${more(o.n, o.v.length)}])`;
    case "set":
    case "frozenset":
      if (o.v.length === 0) return o.t === "set" ? "set()" : "frozenset()";
      return `{${o.v.map(sub).join(", ")}${more(o.n, o.v.length)}}`;
    case "dict": {
      const body = o.v.map(([k, x]) => `${sub(k)}: ${sub(x)}`).join(", ") + more(o.n, o.v.length);
      return o.cls ? `${o.cls}({${body}})` : `{${body}}`;
    }
    case "obj":
      return `${o.cls}(${Object.entries(o.v)
        .map(([k, x]) => `${k}=${sub(x)}`)
        .join(", ")})`;
    case "fn":
      return `<function ${o.name}>`;
    case "class":
      return `<class ${o.name}>`;
    case "other":
      return o.repr;
  }
}

/** A cell's short label: the value itself for scalars, a type hint for containers. */
export function cell(v: Value | undefined, model: Model | null, step: number): string {
  if (isRef(v) && model) {
    const o = model.obj(v.r, step);
    if (o?.t === "tuple") return show(v, model, step, 0);
    if (o?.t === "obj") return show(v, model, step, 0).length <= 10 ? show(v, model, step, 0) : `${o.cls}`;
    if (o && "v" in o && Array.isArray(o.v)) return `${o.t}[${o.n ?? o.v.length}]`;
    return "…";
  }
  if (typeof v === "string") return v.length <= 6 ? (v.length === 1 ? v : pyStr(v)) : pyStr(`${v.slice(0, 5)}…`);
  return show(v, model, step, 0);
}
