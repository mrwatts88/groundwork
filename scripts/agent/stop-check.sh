#!/usr/bin/env bash
# Stop hook: block the session from stopping while the plan is invalid or code it
# changed does not pass the fast checks. Exit 2 blocks the stop and shows stderr
# to the agent. Fast on purpose: only checks what is changed in the tree.
set -u
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0

fail() { printf 'stop-check: %s\n' "$*" >&2; exit 2; }

python3 scripts/agent/plan.py lint >/dev/null 2>&2 || fail "plan/features.json is invalid (see above)"

git rev-parse --git-dir >/dev/null 2>&1 || exit 0
changed="$( { git diff --name-only HEAD 2>/dev/null || true; git ls-files --others --exclude-standard; } | sort -u)"
[[ -n "$changed" ]] || exit 0

while IFS= read -r f; do
  [[ -f "$f" ]] || continue
  case "$f" in
    *.sh)
      bash -n "$f" >&2 2>&1 || fail "$f has a bash syntax error"
      if command -v shellcheck >/dev/null 2>&1; then
        shellcheck -S warning "$f" >&2 || fail "$f has shellcheck warnings"
      fi
      ;;
    *.py)
      python3 -m py_compile "$f" >&2 2>&1 || fail "$f does not compile"
      ;;
  esac
done <<< "$changed"

# TypeScript: typecheck and unit tests once the workspace exists (R0-03).
if grep -qE '\.(ts|tsx|json)$' <<< "$changed" && [[ -f pnpm-workspace.yaml ]]; then
  command -v pnpm >/dev/null 2>&1 || fail "TypeScript changed but pnpm is not installed"
  pnpm -s typecheck >&2 || fail "typecheck failed"
  pnpm -s test >&2 || fail "unit tests failed"
fi

exit 0
