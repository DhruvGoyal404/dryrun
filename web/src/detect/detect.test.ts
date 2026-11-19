import { describe, expect, test } from "vitest";
import { detect, parseHints } from "./detect";
import { deque, dict, list, model, obj, ref, set, tuple } from "./fixtures";

const kinds = (views: ReturnType<typeof detect>) => views.map((v) => `${v.kind}:${v.name}`);

describe("array with pointers", () => {
  test("ints used as indices become arrows, and left/right shade a window", () => {
    const m = model([
      { g: { nums: ref(1), left: 0, right: 3 }, h: { 1: list(1, 2, 3, 4) }, px: [[1, "nums", "left"], [1, "nums", "right"]] },
      { g: { nums: ref(1), left: 1, right: 3 } },
    ]);
    const [view] = detect(m, "");
    expect(view).toMatchObject({ kind: "array", name: "nums", pointers: ["left", "right"], window: ["left", "right"] });
  });

  test("binary search: lo and hi join mid even though only mid indexes the list", () => {
    const m = model([
      { g: { a: ref(1), lo: 0, hi: 5, mid: 2 }, h: { 1: list(1, 2, 3, 4, 5) }, px: [[1, "a", "mid"]] },
    ]);
    const [view] = detect(m, "");
    expect(view!.pointers!.sort()).toEqual(["hi", "lo", "mid"]);
    expect(view!.window).toEqual(["lo", "hi"]);
  });

  test("a pointer that indexes another array is not drawn under this one", () => {
    const m = model([{ g: { a: "abc", b: "xyz", i: 1, j: 2 }, px: [[null, "a", "i"], [null, "b", "j"]] }]);
    const views = detect(m, "");
    expect(views.map((v) => [v.name, v.pointers])).toEqual([
      ["a", ["i"]],
      ["b", ["j"]],
    ]);
  });

  test("an offset index is its own pointer, and its variable is not guessed onto other arrays", () => {
    const m = model([{ g: { a: "ab", b: "xy", i: 1, j: 2 }, px: [[null, "a", "i-1"], [null, "b", "j-1"]] }]);
    expect(detect(m, "").map((v) => [v.name, v.pointers])).toEqual([
      ["a", ["i-1"]],
      ["b", ["j-1"]],
    ]);
  });

  test("a string indexed by pointers is drawn as an array", () => {
    const m = model([{ g: { s: "racecar", i: 0, j: 6 }, px: [[null, "s", "i"], [null, "s", "j"]] }]);
    expect(detect(m, "")).toMatchObject([{ kind: "array", name: "s", pointers: ["i", "j"] }]);
  });

  test("aliasing: two names for one list are one drawing, labelled with both", () => {
    const m = model([{ g: { a: ref(1), b: ref(1), i: 0 }, h: { 1: list(5, 6) }, px: [[1, "b", "i"]] }]);
    const views = detect(m, "");
    expect(kinds(views)).toEqual(["array:a"]);
    expect(views[0]).toMatchObject({ aliases: ["b"], pointers: ["i"] });
  });

  test("a closure's variable is drawn once, in the outer function", () => {
    const m = model(
      [
        { c: 1, v: { 1: { items: ref(1), i: 0 } }, h: { 1: list("a", "b") }, px: [[1, "items", "i"]] },
        { c: 2, v: { 2: { items: ref(1), i: 1 } }, px: [[1, "items", "i"]] },
      ],
      [{ fn: "choose" }, { fn: "go", p: 1, d: 2 }],
    );
    expect(detect(m, "").map((v) => `${v.scope}:${v.name}`)).toEqual(["choose:items"]);
  });

  test("an untouched helper list is left to the variables panel", () => {
    const m = model([{ g: { out: ref(1) }, h: { 1: list(1, 2) } }]);
    expect(detect(m, "")).toEqual([]);
  });
});

describe("stack, queue and the tricky middle", () => {
  test("a list that is pushed and popped is a stack", () => {
    const m = model([{ g: { st: ref(1) }, h: { 1: list(1) }, ops: [[1, "append"]] }, { ops: [[1, "pop"]] }]);
    expect(kinds(detect(m, ""))).toEqual(["stack:st"]);
  });

  test("a list that is both pushed/popped and indexed by a pointer is an array", () => {
    const m = model([
      { g: { st: ref(1), i: 0 }, h: { 1: list(1, 2) }, ops: [[1, "append"], [1, "pop"]], px: [[1, "st", "i"]] },
    ]);
    expect(detect(m, "")[0]).toMatchObject({ kind: "array", pointers: ["i"] });
  });

  test("a deque with popleft is a queue; with only pop it is a stack", () => {
    const q = model([{ g: { q: ref(1) }, h: { 1: deque(1, 2) }, ops: [[1, "popleft"]] }]);
    expect(kinds(detect(q, ""))).toEqual(["queue:q"]);
    const s = model([{ g: { s: ref(1) }, h: { 1: deque(1, 2) }, ops: [[1, "append"], [1, "pop"]] }]);
    expect(kinds(detect(s, ""))).toEqual(["stack:s"]);
  });

  test("a list passed to heapq is a heap", () => {
    const m = model([{ g: { h: ref(1) }, h: { 1: list(1, 3, 2) }, ops: [[1, "heappush"], [1, "append"], [1, "pop"]] }]);
    expect(kinds(detect(m, ""))).toEqual(["heap:h"]);
  });
});

describe("grids and nested lists", () => {
  const grid = { 1: list(ref(2), ref(3)), 2: list(0, 1, 2), 3: list(3, 4, 5) };

  test("a rectangular list of number lists is a grid", () => {
    expect(kinds(detect(model([{ g: { dp: ref(1) }, h: grid }]), ""))).toEqual(["grid:dp"]);
  });

  test("a ragged list of int lists that name each other is a graph, not a grid", () => {
    const h = { 1: list(ref(2), ref(3), ref(4)), 2: list(1, 2), 3: list(0), 4: list(0) };
    expect(kinds(detect(model([{ g: { adj: ref(1) }, h }]), ""))).toEqual(["graph:adj"]);
  });

  test("a ragged list of word lists is neither", () => {
    const h = { 1: list(ref(2), ref(3)), 2: list("stop", "pots"), 3: list("tea") };
    expect(detect(model([{ g: { groups: ref(1) }, h }]), "")).toEqual([]);
  });

  test("a list of lists whose rows hold lists is not a grid", () => {
    const h = { 1: list(ref(2), ref(3)), 2: list(ref(4)), 3: list(ref(4)), 4: list(1) };
    expect(detect(model([{ g: { nested: ref(1) }, h }]), "")).toEqual([]);
  });

  test("a hint forces a grid", () => {
    const h = { 1: list(ref(2)), 2: list(1, 2) };
    expect(detect(model([{ g: { t: ref(1) }, h }]), "# dryrun: grid t")[0]).toMatchObject({ kind: "grid", hinted: true });
  });
});

describe("maps, sets and graphs", () => {
  test("a dict is a hash map; a set is a set", () => {
    const m = model([{ g: { counts: ref(1), seen: ref(2) }, h: { 1: dict(["a", 2]), 2: set(1, 2) } }]);
    expect(kinds(detect(m, ""))).toEqual(["map:counts", "set:seen"]);
  });

  test("a dict of neighbour lists is a graph, with its visited set and frontier", () => {
    const m = model([
      {
        g: { graph: ref(1), seen: ref(5), queue: ref(6) },
        h: { 1: dict(["A", ref(2)], ["B", ref(3)], ["C", ref(4)]), 2: list("B", "C"), 3: list("C"), 4: list(), 5: set("A"), 6: deque("B") },
        ops: [[6, "popleft"]],
      },
    ]);
    const views = detect(m, "");
    expect(views[0]).toMatchObject({ kind: "graph", name: "graph", visited: "seen", frontier: "queue", weighted: false });
  });

  test("(node, weight) pairs make a weighted graph", () => {
    const m = model([
      { g: { roads: ref(1) }, h: { 1: dict(["P", ref(2)], ["Q", ref(3)]), 2: list(ref(4)), 3: list(), 4: tuple("Q", 4) } },
    ]);
    expect(detect(m, "")[0]).toMatchObject({ kind: "graph", weighted: true });
  });

  test("a memo dict of numbers stays a map, even in a recursion", () => {
    const m = model(
      [
        { c: 1, v: { 1: { n: 3, memo: ref(1) } }, h: { 1: dict() } },
        { c: 2, v: { 2: { n: 2, memo: ref(1) } }, h: { 1: dict([2, 1]) }, rd: [[1, 2]] },
      ],
      [{ fn: "fib" }, { fn: "fib", p: 1, d: 2 }],
    );
    expect(kinds(detect(m, ""))).toEqual(["map:memo", "recursion:calls"]);
  });
});

describe("linked structures", () => {
  test("objects with next are a linked list; with left/right a tree; one view each", () => {
    const m = model([
      {
        g: { head: ref(1), root: ref(3) },
        h: {
          1: obj("Node", { val: 1, next: ref(2) }),
          2: obj("Node", { val: 2, next: null }),
          3: obj("TreeNode", { val: 5, left: null, right: null }),
        },
      },
    ]);
    expect(kinds(detect(m, ""))).toEqual(["tree:TreeNode", "linked:Node"]);
  });
});

describe("hints", () => {
  test("parse kinds, names, hide, and report unknown kinds", () => {
    const { hints, problems } = parseHints("x = 1  # dryrun: array nums lo hi\n# dryrun: hide tmp\n# dryrun: wibble x");
    expect(hints).toEqual([
      { kind: "array", names: ["nums", "lo", "hi"], line: 1 },
      { kind: "hide", names: ["tmp"], line: 2 },
    ]);
    expect(problems).toEqual(['line 3: unknown view "wibble"']);
  });

  test("hide removes a view; a hinted view comes first", () => {
    const m = model([{ g: { a: ref(1), b: ref(2) }, h: { 1: dict(["k", 1]), 2: set(1) } }]);
    expect(kinds(detect(m, "# dryrun: hide a"))).toEqual(["set:b"]);
    expect(kinds(detect(m, "# dryrun: set b"))[0]).toBe("set:b");
  });

  test("array hint sets the pointers explicitly", () => {
    const m = model([{ g: { parent: ref(1), x: 1 }, h: { 1: list(0, 0, 1) } }]);
    expect(detect(m, "# dryrun: array parent x")[0]).toMatchObject({ kind: "array", pointers: ["x"] });
  });
});

describe("recursion", () => {
  test("shown only when a function calls itself", () => {
    const flat = model([{}], [{ fn: "helper" }, { fn: "other", p: 1, d: 2 }]);
    expect(detect(flat, "")).toEqual([]);
    const mutual = model([{}], [{ fn: "even" }, { fn: "odd", p: 1, d: 2 }, { fn: "even", p: 2, d: 3 }]);
    expect(kinds(detect(mutual, ""))).toEqual(["recursion:calls"]);
  });
});
