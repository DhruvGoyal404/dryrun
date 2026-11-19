#!/usr/bin/env bash
# The local gate (CLAUDE.md, "How we work"). Light on purpose: the owner's laptop is low on
# RAM. Production builds, Playwright e2e, the Pyodide smoke test and Lighthouse run on CI.
set -euo pipefail
cd "$(dirname "$0")/.."

python -m pytest tracer -q
node --test scripts/*.test.mjs
node scripts/check-workflows.mjs
node scripts/contrast.mjs
if [ -d web/node_modules ]; then
  (cd web && npm run typecheck && npm run lint && npm test)
fi
node scripts/check-deps.mjs --audit tracer $( [ -f web/package-lock.json ] && echo web ) $( [ -f deploy/package-lock.json ] && echo deploy )
echo "gate: all green"
