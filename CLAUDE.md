# DryRun

A visual dry run for your own Python: paste a DSA-style solution and an input, and DryRun
runs it step by step in the browser and draws the data structures the way you'd draw them on
paper (arrays with moving pointers, the recursion tree, the DP table filling up, linked
lists, trees, graphs, heaps). Python runs in Pyodide inside a Web Worker; a React +
TypeScript + Vite front end with CodeMirror 6; a static site on Cloudflare Pages at
dryrun.dhruvgoyal.tech. No backend.

This file is the project's constitution. It binds every change, human or AI. To weaken a
rule, change this file in its own commit and say why.

| Milestone | Scope | State |
|---|---|---|
| M1 | Tracer: events, identity-preserving snapshots, accesses, caps, pytest + Pyodide smoke | done |
| M2 | Detectors and visualizers for every structure, with hints and unit tests | in progress |
| M3 | The app: DESIGN.md first, editor, canvas, timeline, counters, responsive, a11y, offline | |
| M4 | Compare mode, pattern library, share links | |
| M5 | e2e, CSP, SEO, Lighthouse, review, README, deploy | |

Docs: [README.md](README.md) (for interviewers), [docs/DECISIONS.md](docs/DECISIONS.md)
(every decision and why), [docs/PROGRESS.md](docs/PROGRESS.md) (running log),
[docs/DEPENDENCY_EXCEPTIONS.md](docs/DEPENDENCY_EXCEPTIONS.md).

## How we work

- **Verify, never guess.** Every version, API and claim is checked against an official
  doc, a registry or a run. A number in a doc comes from a command someone can rerun.
- **Direct to main, one commit per logical piece.** No branches, no pull requests.
  `bash scripts/gate.sh` passes before every commit. Then push. If CI goes red, the next
  commit fixes it. Never force-push main.
- **The owner's laptop is low on RAM.** Locally: edits, type-check, lint, light unit tests
  (`bash scripts/gate.sh`). Heavy work (Playwright e2e, Lighthouse, production builds, the
  Pyodide smoke test) runs on GitHub Actions, and a green CI run is the gate for those.
- **Identity.** Every commit is authored and committed by the owner only, set in the
  repo's local git config. No co-author trailer, no generated-by line, and no mention of
  any AI tool in a commit message, tag, release or other GitHub-visible metadata.
  Attribution is off in the git-ignored `.claude/settings.local.json`. After each commit,
  `git log -1 --format='%an <%ae> | %cn <%ce>%n%B'` must show only the owner.
- **A red gate stops the line.** No `--no-verify`, no disabling a test to get green.
- **Say what's unfinished.** Open risks stay visible in the doc that owns them.

## Dependencies

- **14-day rule.** Adopt only a release published at least 14 days ago (npm, PyPI,
  Pyodide, GitHub Actions). If the newest is younger, take the newest that is older.
  `.npmrc` sets `min-release-age=14`; `scripts/check-deps.mjs` enforces it for every
  lockfile and `requirements.txt`.
- **Exact pins.** npm without `^` or `~`, PyPI with `==` and every transitive package
  listed (`pip install --no-deps`). Lockfiles committed. `npm ci` in CI.
- **Clean audits.** `npm audit` through check-deps `--audit`.
- **Security exception:** a fix for a published advisory may be younger than 14 days.
  Record it in docs/DEPENDENCY_EXCEPTIONS.md with the advisory, the date and an expiry.
- **The tracer has no dependencies** beyond the Python standard library. Keep it that way.
- Actions pinned by commit SHA, images by digest (`scripts/check-workflows.mjs`).

## Tracer invariants (never weaken without explicit approval)

- The tracer never runs user code of its own accord: no `repr`, `__getitem__`,
  `__getattr__`, property or `__eq__` of a user object is called while serialising or
  analysing. Instances are read through `object.__getattribute__(x, "__dict__")` and
  slots; containers through the base type's methods.
- Every limit in `DEFAULT_LIMITS` is enforced and reported in `capped` with the reason,
  step and line. The browser never receives an unbounded trace, and the worker's watchdog
  terminates a run that ignores the cap (an `except BaseException` in user code can swallow
  it).
- Identity is preserved: one heap id per live object for the whole run.
- A step is the state *before* its line runs. Reads/writes are evaluated at that moment.
- Tracebacks show only the user's frames.
- User code runs only in the user's browser, in a Worker, never on a server.

## Testing and CI

- Tracer: pytest on CPython 3.14 (`tracer/tests`), plus a Node + Pyodide smoke test of the
  real runtime.
- Policy: `node --test scripts/*.test.mjs`, check-workflows, contrast, check-deps --audit.
- Piped CI steps use `set -o pipefail`.
- `exceptions.yml` runs the dependency check daily. GitHub disables scheduled workflows
  after 60 days without activity: check `gh workflow list` after a quiet spell.

## Environment

Windows 11, Git Bash. Node through nvm-windows (`.nvmrc` is CI's version; the laptop may
run an older Node for light checks). Python 3.13 locally for the tracer tests.
