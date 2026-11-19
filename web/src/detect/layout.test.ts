import { describe, expect, test } from "vitest";
import { binaryTrees, graphLayout, heapLayout, linkedChains, memoHits, recursionLayout, visitOrder } from "./layout";
import { dict, list, model, obj, ref, tuple } from "./fixtures";

describe("recursion tree", () => {
  // fib(3) -> fib(2) -> fib(1), fib(0); fib(3) -> fib(1) answered from the memo.
  const calls = [
    { fn: "fib", p: 0, d: 1, s: 0, e: 9 },
    { fn: "fib", p: 1, d: 2, s: 1, e: 6 },
    { fn: "fib", p: 2, d: 3, s: 2, e: 3 },
    { fn: "fib", p: 2, d: 3, s: 4, e: 5 },
    { fn: "fib", p: 1, d: 2, s: 7, e: 8 },
  ];
  const steps = [
    { c: 1, h: { 9: dict() } },
    { c: 2 },
    { c: 3 },
    { c: 3, e: "r" as const },
    { c: 4 },
    { c: 4, e: "r" as const },
    { c: 2, wr: [[9, 2]] as [number, number][] },
    { c: 5, rd: [[9, 1]] as [number, number][] },
    { c: 5, e: "r" as const },
    { c: 1, e: "r" as const },
  ];

  test("a leaf that reads the memo its function writes is a memo hit; base cases are not", () => {
    // fib(1) at call 5 reads dict 9, which fib writes at step 6.
    expect([...memoHits(model(steps, calls))]).toEqual([5]);
  });

  test("states follow the step, and parents sit over their children", () => {
    const m = model(steps, calls);
    const { nodes } = recursionLayout(m, 4);
    const at = (id: number) => nodes.find((n) => n.id === id)!;
    expect(at(1).state).toBe("active");
    expect(at(3).state).toBe("returned");
    expect(at(4).state).toBe("current");
    expect(at(5).state).toBe("pending");
    expect(at(2).x).toBe((at(3).x + at(4).x) / 2);
    expect(at(5).memo).toBe(true);
  });

  test("big subtrees off the current path fold into one node with a count", () => {
    const m = model(steps, calls);
    const { nodes } = recursionLayout(m, 8, { collapseOver: 2 });
    const fold = nodes.find((n) => n.id === 2)!;
    expect(fold.hidden).toBe(2);
    expect(nodes.some((n) => n.id === 3)).toBe(false);
    // Expanding it brings the children back.
    expect(recursionLayout(m, 8, { collapseOver: 2, expanded: new Set([2]) }).nodes.some((n) => n.id === 3)).toBe(true);
  });

  test("lambdas, comprehensions and __init__ are not drawn", () => {
    const m = model([{}], [{ fn: "<lambda>" }, { fn: "__init__" }, { fn: "go" }]);
    expect(recursionLayout(m, 0).nodes.map((n) => n.id)).toEqual([3]);
  });
});

describe("binary trees", () => {
  const h = {
    1: obj("T", { val: 2, left: ref(2), right: ref(3) }),
    2: obj("T", { val: 1, left: null, right: null }),
    3: obj("T", { val: 3, left: null, right: null }),
  };

  test("in-order x, depth y, from the root a variable holds", () => {
    const { nodes } = binaryTrees(model([{ g: { root: ref(1) }, h }]), 0);
    expect(nodes.map((n) => [n.label, n.x, n.depth])).toEqual([
      [1, 0, 1],
      [2, 1, 0],
      [3, 2, 1],
    ]);
  });

  test("visit order is the order node values were first read", () => {
    const m = model([{ g: { root: ref(1) }, h, ar: [[2, "val"]] }, { ar: [[2, "val"], [1, "val"], [1, "left"]] }, { ar: [[3, "val"]] }]);
    expect(visitOrder(m, 1)).toEqual([2, 1]);
    expect(visitOrder(m, 2)).toEqual([2, 1, 3]);
  });
});

describe("linked lists", () => {
  test("one chain from the head; a reversed part is its own chain", () => {
    const m = model([
      {
        g: { prev: ref(2), curr: ref(3) },
        h: { 1: obj("N", { val: 1, next: null }), 2: obj("N", { val: 2, next: ref(1) }), 3: obj("N", { val: 3, next: ref(4) }), 4: obj("N", { val: 4, next: null }) },
      },
    ]);
    const { chains, labels } = linkedChains(m, 0);
    expect(chains.map((c) => c.ids.map((id) => labels.get(id)))).toEqual([
      [2, 1],
      [3, 4],
    ]);
  });

  test("a cycle is drawn once and marked", () => {
    const m = model([{ g: { head: ref(1) }, h: { 1: obj("N", { val: 1, next: ref(2) }), 2: obj("N", { val: 2, next: ref(1) }) } }]);
    const { chains } = linkedChains(m, 0);
    expect(chains).toEqual([{ ids: [1, 2], cycleTo: 1 }]);
  });
});

describe("graphs and heaps", () => {
  test("BFS layers from the first node; weights kept; undirected edges drawn once", () => {
    const m = model([
      { g: { g: ref(1) }, h: { 1: dict(["A", ref(2)], ["B", ref(3)], ["C", ref(4)]), 2: list(ref(5)), 3: list("A"), 4: list(), 5: tuple("B", 7) } },
    ]);
    const layout = graphLayout(m, ref(1), 0)!;
    expect(layout.nodes.map((n) => [n.value, n.x])).toEqual([
      ["A", 0],
      ["B", 1],
      ["C", 2],
    ]);
    expect(layout.edges).toEqual([
      { from: '"A"', to: '"B"', weight: 7 },
      { from: '"B"', to: '"A"' },
    ]);
  });

  test("an adjacency list uses indices as nodes", () => {
    const m = model([{ g: { adj: ref(1) }, h: { 1: list(ref(2), ref(3)), 2: list(1), 3: list(0) } }]);
    const layout = graphLayout(m, ref(1), 0)!;
    expect(layout.nodes.map((n) => n.value)).toEqual([0, 1]);
    expect(layout.edges).toEqual([{ from: "0", to: "1" }]);
  });

  test("heap positions: children of i are 2i + 1 and 2i + 2, centred under it", () => {
    const pos = heapLayout(3);
    expect(pos.map((p) => [p.depth, p.parent])).toEqual([
      [0, null],
      [1, 0],
      [1, 0],
    ]);
    expect(pos[0]!.x).toBe((pos[1]!.x + pos[2]!.x) / 2);
  });
});
