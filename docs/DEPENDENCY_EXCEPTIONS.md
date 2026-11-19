# Dependency exceptions

Releases younger than 14 days, allowed only because they fix a published security
advisory (CLAUDE.md, "Dependencies"). `scripts/check-deps.mjs` reads the table below.

An entry past its expiry date fails CI, even if the release is now old enough, so a
stale exception can't linger. A row the script can't read fails too. A daily scheduled
run catches a lapse when nothing was pushed.

| Ecosystem | Package | Version | Published | Advisory | Recorded | Expires |
|---|---|---|---|---|---|---|

`Ecosystem` is `npm`, `pypi`, `crates` or `rust-toolchain`. Adding an ecosystem means adding
a reader to `scripts/check-deps.mjs`. Pyodide is pinned as the npm package `pyodide`, so
the npm rows cover it.

## Accepted advisories

Advisories with no fixed release to adopt, accepted for a stated reason and a short time.
`node scripts/check-deps.mjs --audit <dir>` runs `npm audit` there and fails on any finding
not listed here for that directory, on any entry past its expiry, and on any entry whose
advisory no longer appears, so the entry goes as soon as the fix is in.

| Where | Package | Advisory | Recorded | Expires |
|---|---|---|---|---|

## Overrides

npm `overrides` that force a transitive package to a fixed release because a direct
dependency still declares a vulnerable range. `scripts/check-deps.mjs` fails on any
override in a `package.json` that is missing here or recorded at another version, on any
row whose override is gone, and on any row past its expiry. Every forced version also
passes the 14-day rule.

| Where | Package | Version | Advisory | Recorded | Expires |
|---|---|---|---|---|---|
| web | minimatch | 11.0.3 | GHSA-g3hv-75wg-m249 (via eslint, typescript-eslint; dev only) | 2026-11-19 | 2026-12-31 |
| deploy | minimatch | 11.0.3 | GHSA-g3hv-75wg-m249 (via lighthouse's error reporter; CI only) | 2026-11-19 | 2026-12-31 |
| deploy | glob | 14.0.3 | GHSA-3g3m-2fjr-6pw4 (via lighthouse's error reporter; CI only) | 2026-11-19 | 2026-12-31 |
