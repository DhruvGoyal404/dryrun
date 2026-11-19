import { expect, test } from "vitest";
import { model } from "../detect/fixtures";
import { depthAt, nextCall, prevCall, runToLine } from "./navigate";
import { show } from "./format";

const m = model(
  [
    { e: "c", c: 0, ln: 1 },
    { ln: 5 },
    { e: "c", c: 1, ln: 1 },
    { ln: 2, c: 1 },
    { e: "r", ln: 2, c: 1 },
    { ln: 5 },
    { e: "c", c: 2, ln: 1 },
    { ln: 2, c: 2 },
  ],
  [{ fn: "f", s: 2, e: 4 }, { fn: "f", s: 6 }],
);

test("next and previous call skip the module", () => {
  expect(nextCall(m, 0)).toBe(2);
  expect(nextCall(m, 2)).toBe(6);
  expect(nextCall(m, 6)).toBeNull();
  expect(prevCall(m, 6)).toBe(2);
  expect(prevCall(m, 2)).toBeNull();
});

test("run to line finds the next hit, then wraps", () => {
  expect(runToLine(m, 1, 5)).toBe(5);
  expect(runToLine(m, 5, 5)).toBe(1);
  expect(runToLine(m, 0, 99)).toBeNull();
});

test("depth counts function frames only", () => {
  expect(depthAt(m, 3)).toBe(1);
  expect(depthAt(m, 5)).toBe(0);
});

test("values print as Python would", () => {
  const v = model([
    { g: { a: { r: 1 } }, h: { 1: { t: "list", v: [1, { f: "2.5" }, "x", null, true, { r: 2 }] }, 2: { t: "dict", v: [["k", { r: 1 }]] } } },
  ]);
  expect(show({ r: 1 }, v, 0)).toBe("[1, 2.5, 'x', None, True, {'k': ↻}]");
  expect(show({ str: "abc", len: 900 }, null, 0)).toBe("'abc'… (900 chars)");
  expect(show({ r: 3 }, v, 0)).toBe("…");
});
