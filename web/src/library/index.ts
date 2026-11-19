// The pattern library: every *.py file in this folder, with the metadata in its header
// (`# title:`, `# pattern:`, `# call:` or `# stdin:`, `# expect:`). pytest and the Pyodide
// smoke test read the same headers.
import type { ViewKind } from "../detect/detect";

export interface Example {
  id: string;
  title: string;
  pattern: string;
  code: string;
  mode: "call" | "stdin";
  call: string;
  stdin: string;
  /** The visualizer this example is meant to show (the e2e suite checks it appears). */
  expect: ViewKind;
}

export function parseExample(file: string, code: string): Example {
  const meta: Record<string, string> = {};
  for (const line of code.split("\n")) {
    const m = /^# (title|pattern|call|stdin|expect): (.*)$/.exec(line);
    if (m) meta[m[1]!] = m[2]!.trim();
  }
  return {
    id: file.replace(/^.*\//, "").replace(/\.py$/, ""),
    title: meta.title ?? file,
    pattern: meta.pattern ?? "",
    code,
    mode: meta.call ? "call" : "stdin",
    call: meta.call ?? "",
    stdin: (meta.stdin ?? "").replaceAll("\\n", "\n"),
    expect: (meta.expect ?? "array") as ViewKind,
  };
}

const files = import.meta.glob<string>("./*.py", { query: "?raw", import: "default", eager: true });

export const EXAMPLES: Example[] = Object.entries(files)
  .map(([file, code]) => parseExample(file, code))
  .sort((a, b) => a.id.localeCompare(b.id));

export const exampleById = (id: string) => EXAMPLES.find((e) => e.id === id);
