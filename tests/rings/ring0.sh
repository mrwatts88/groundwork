#!/usr/bin/env bash
# Ring 0 end-to-end check (DESIGN.md 23.2), run by the Ring 0 review from the
# Mac. It runs make check, the cross-process determinism check, a health check
# against the world server on the Fedora box and one live mind smoke there.
# The smoke spends one real claude -p call of budget.
#
# GROUNDWORK_HOST picks the ssh alias (default laptop, laptop-ts away from home).
set -euo pipefail
cd "$(dirname "$0")/../.."

host="${GROUNDWORK_HOST:-laptop}"
health_url="${GROUNDWORK_HEALTH_URL:-http://laptop.local:7400/health}"

step() { echo; echo "=== ring0: $1 ==="; }

step "make check"
make check

step "determinism"
bash scripts/check-determinism.sh

step "health $health_url"
body=$(curl -fsS --max-time 10 "$health_url")
echo "$body"

step "live mind smoke on $host"
ssh -o BatchMode=yes "$host" \
  'cd ~/code/groundwork && ~/.local/bin/pnpm --filter @groundwork/minds smoke'

echo
echo "ring0: ok"
