#!/usr/bin/env bash
# Cross-process determinism (DESIGN.md 17): run the scripted 128x128, 10000
# tick scenario in two separate node processes and require the same hash.
set -euo pipefail
cd "$(dirname "$0")/.."

cli=packages/sim/scripts/scenario-hash.ts
first=$(node --experimental-strip-types --no-warnings "$cli")
second=$(node --experimental-strip-types --no-warnings "$cli")
echo "process 1: $first"
echo "process 2: $second"
if [[ "$first" != "$second" ]]; then
  echo "determinism: FAIL, the two processes disagree" >&2
  exit 1
fi
echo "determinism: ok"
