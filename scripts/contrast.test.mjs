import assert from "node:assert/strict";
import { test } from "node:test";
import { check, ratio, tokens } from "./contrast.mjs";

test("ratio matches WCAG's reference values", () => {
  assert.equal(ratio("#000000", "#FFFFFF").toFixed(1), "21.0");
  assert.equal(ratio("#777777", "#FFFFFF").toFixed(2), "4.48");
});

test("reads both themes from a token table and flags a weak pair", () => {
  const md = [
    "| `--ink` | `#777777` | `#000000` | text |",
    "| `--paper` | `#FFFFFF` | `#FFFFFF` | bg |",
  ].join("\n");
  const t = tokens(md);
  assert.deepEqual(t["--ink"], { dark: "#777777", light: "#000000" });
  const failures = check(t);
  assert.ok(failures.some((f) => /dark: --ink on --paper is 4.48:1/.test(f)));
  assert.ok(failures.some((f) => /missing token --sheet/.test(f)));
});
