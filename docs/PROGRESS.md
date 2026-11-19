# Progress

A short running log: what's done, numbers, what failed, what's next. Newest first.

## 2026-11-20: live

- Live at https://dryrun.dhruvgoyal.tech, fallback https://dryrun-4io.pages.dev (Cloudflare's
  subdomain for the project; `dryrun.pages.dev` was taken, so the docs now name the real
  one). CI deploys every push to `main` once every other job is green; nothing bills while
  idle, so no up/down scripts.
- Live-site job green: CSP and security headers served, no injected analytics script,
  live e2e subset 12/12, Lighthouse on the live landing page 100/100/100/100 on mobile
  (LCP 0.9 s) and desktop (LCP 0.2 s), TBT 0 ms. The owner's own test passed on desktop
  and phone.
- The two open review items are done: an overwritten value stays visible, crossed out in
  pencil, in arrays, tables and hash maps; each library entry on the landing page has a
  small sketch of the structure it draws.

## 2026-11-19 (evening)

- e2e green on CI: 62 passed, 1 skipped (the keyboard-only test is desktop only), across
  desktop 1440 px and a 390 px phone: every library example draws its view, caps, errors, stdin, compare + growth chart,
  share round trip, damaged links, offline reload, keyboard-only use, axe in both themes,
  no console errors, all under the production CSP.
- Unit: 49 vitest (detectors, layouts, share, navigation, format), 26 pytest on CPython
  3.14 and the same 26 inside Pyodide, 31 policy-script tests.
- Lighthouse on the tested build, served with the production headers (CI, median of 3):
  landing page 100/100/100/100 on mobile (LCP 1.0 s) and desktop (LCP 0.3 s), TBT 0 ms,
  CLS 0. The app page could not be measured (Lighthouse NO_NAVSTART while Python boots in
  a worker); it is report-only.
- What failed and was fixed: CodeMirror's injected <style> and inlined data: fonts broke
  the CSP (editor moved into a shadow root, assetsInlineLimit 0); the service worker
  precached a 404 and two never-written chunks (list now built from written files); dialog
  state lagged native close (shortcuts read the DOM); visit order counted insert's
  comparisons; pointers guessed onto the wrong array; offset reads drawn one cell off.
- Fresh-eyes review (separate reviewer, screenshots + source): 10 material fixes, 8 done.
  Not done: a small drawing per library entry on the landing page, and struck-through
  overwritten values ("crossed out and rewritten") in cells.
- Waiting on the owner: Cloudflare secrets and the custom domain. The deploy job skips
  until the secrets exist; the live-site job (analytics-script check, live e2e subset,
  Lighthouse on the live URL) runs after the first deploy.

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
