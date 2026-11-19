# Progress

A short running log: what's done, numbers, what failed, what's next. Newest first.

## 2026-11-19

- Repo set up: MIT, local git identity, attribution off, gridrace's policy scripts
  (check-deps with a new PyPI reader, check-workflows, contrast), CI skeleton.
- M1 tracer (`tracer/dryrun_tracer.py`): line/call/return/exception events, per-frame
  locals and heap deltas with identity, reads/writes/pointers/operations from the AST,
  stdout per step, user-only tracebacks, caps on steps, depth, calls, objects, items,
  string length, bytes and time. 24 pytest tests pass locally (CPython 3.13).
- Next: Node + Pyodide smoke test, web app scaffold, detectors (M2).
