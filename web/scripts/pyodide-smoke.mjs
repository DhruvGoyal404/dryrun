#!/usr/bin/env node
// Runs the tracer inside the pinned Pyodide, in Node: every test function in
// tracer/tests/test_tracer.py (they use plain asserts, so no pytest is needed), then every
// pattern-library example through run_json, the browser's entry point. CI runs this; it
// proves the tracer works on the real runtime, not only on CPython.
//
//   node scripts/pyodide-smoke.mjs
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadPyodide } from "pyodide";

const root = fileURLToPath(new URL("../..", import.meta.url));
const started = Date.now();
const py = await loadPyodide();
console.log(`Pyodide ${py.version}, Python ${py.runPython("import sys; sys.version.split()[0]")}, loaded in ${Date.now() - started} ms`);

py.FS.mkdirTree("/home/pyodide/tests");
py.FS.writeFile("/home/pyodide/dryrun_tracer.py", readFileSync(`${root}tracer/dryrun_tracer.py`, "utf8"));
py.FS.writeFile("/home/pyodide/tests/test_tracer.py", readFileSync(`${root}tracer/tests/test_tracer.py`, "utf8"));

const failures = py.runPython(`
import sys, traceback
sys.path.insert(0, "/home/pyodide")
sys.path.insert(0, "/home/pyodide/tests")
import test_tracer
failures = []
names = [n for n in dir(test_tracer) if n.startswith("test_")]
for name in names:
    try:
        getattr(test_tracer, name)()
    except BaseException:
        failures.append(name + "\\n" + traceback.format_exc())
print(f"tracer tests in Pyodide: {len(names) - len(failures)}/{len(names)} passed")
"\\n\\n".join(failures)
`);
if (failures) {
  console.error(failures);
  process.exit(1);
}

const run = py.globals.get("test_tracer").t.run_json;
const library = `${root}web/src/library/`;
let examples = 0;
for (const file of readdirSync(library).filter((f) => f.endsWith(".py")).sort()) {
  const source = readFileSync(`${library}${file}`, "utf8");
  const meta = Object.fromEntries(
    source
      .split("\n")
      .map((line) => /^# (\w+): (.*)$/.exec(line))
      .filter(Boolean)
      .map((m) => [m[1], m[2].trim()]),
  );
  const t0 = Date.now();
  const trace = JSON.parse(run(source, (meta.stdin ?? "").replaceAll("\\n", "\n"), meta.call ?? "", "{}"));
  if (trace.error || trace.capped) {
    console.error(`${file}: ${JSON.stringify(trace.error ?? trace.capped)}`);
    process.exit(1);
  }
  console.log(`${file}: ${trace.counts.steps} steps, ${trace.counts.calls} calls, ${Date.now() - t0} ms`);
  examples += 1;
}
console.log(`library: ${examples} examples traced cleanly in Pyodide`);
