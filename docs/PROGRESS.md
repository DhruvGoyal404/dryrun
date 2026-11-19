# Progress

A short running log: what's done, numbers, what failed, what's next. Newest first.

## 2026-11-19 (afternoon)

- Repo protections match gridrace: fork-PR approval for all outside contributors, private
  vulnerability reporting, Dependabot alerts, secret scanning with push protection, the
  "protect main" ruleset (no deletion, no force-push), read-only workflow token.
- CI green on the engine: tracer 25/25 on CPython 3.14 and 25/25 inside Pyodide 314.0.7
  (Python 3.14.2, boots in 1.35 s on the runner); all 20 library examples trace in
  1 to 23 ms each inside Pyodide.
- M2: detectors and layouts with 36 unit tests (aliasing, stack-vs-array, memo dict in a
  recursion, nested lists that are not a table). M3/M4: app, landing page, compare mode,
  library, share links, offline; 45 unit tests. First e2e run on CI in progress.
- DESIGN.md: every colour pair passes WCAG AA in both themes (scripts/contrast.mjs).

## 2026-11-19

- Repo set up: MIT, local git identity, attribution off, gridrace's policy scripts
  (check-deps with a new PyPI reader, check-workflows, contrast), CI skeleton.
- M1 tracer (`tracer/dryrun_tracer.py`): line/call/return/exception events, per-frame
  locals and heap deltas with identity, reads/writes/pointers/operations from the AST,
  stdout per step, user-only tracebacks, caps on steps, depth, calls, objects, items,
  string length, bytes and time. 24 pytest tests pass locally (CPython 3.13).
- Next: Node + Pyodide smoke test, web app scaffold, detectors (M2).
