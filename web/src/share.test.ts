import { describe, expect, test } from "vitest";
import { decode, encode, MAX_FRAGMENT, ShareError } from "./share";
import { EXAMPLES, parseExample } from "./library";

describe("share links", () => {
  test("round trip, unicode and a comparison included", async () => {
    const data = { code: "print('héllo ✓')\n", mode: "call" as const, stdin: "", call: "f(1)", codeB: "x = 2\n" };
    const fragment = await encode(data);
    expect(fragment).toMatch(/^s=[A-Za-z0-9_-]+$/);
    expect(await decode(`#${fragment}`)).toEqual(data);
  });

  test("not a share link: null; damaged or foreign: a friendly error", async () => {
    expect(await decode("#ex=01-two-pointers")).toBeNull();
    expect(await decode("")).toBeNull();
    await expect(decode("#s=AAAA")).rejects.toThrow(ShareError);
    await expect(decode("#s=AAAA")).rejects.toThrow(/damaged/);
  });

  test("too long to share says so with the numbers", async () => {
    // Random-ish text does not compress.
    let code = "";
    let seed = 42;
    for (let i = 0; i < 40_000; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      code += String.fromCharCode(33 + (Math.floor(seed / 65536) % 90));
    }
    await expect(encode({ code, mode: "stdin", stdin: "", call: "" })).rejects.toThrow(/too long to share/);
    expect(MAX_FRAGMENT).toBe(16_000);
  });
});

describe("library", () => {
  test("twenty examples, each with a title, a pattern, an input and a view to show", () => {
    expect(EXAMPLES).toHaveLength(20);
    for (const e of EXAMPLES) {
      expect(e.title.length).toBeGreaterThan(5);
      expect(e.pattern.length).toBeGreaterThan(2);
      expect(e.mode === "call" ? e.call : e.stdin).not.toBe("");
    }
    const kinds = new Set(EXAMPLES.map((e) => e.expect));
    for (const k of ["array", "recursion", "grid", "map", "stack", "queue", "linked", "tree", "graph", "heap"]) {
      expect(kinds.has(k as never), k).toBe(true);
    }
  });

  test("stdin newlines are unescaped", () => {
    expect(parseExample("./x.py", "# stdin: 1\\n2\nprint()").stdin).toBe("1\n2");
  });
});
