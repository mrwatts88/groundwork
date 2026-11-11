#!/usr/bin/env bash
# SessionStart hook: print the current state into the new session's context.
# Whatever this prints on stdout is added to the session (PROCESS.md section 5).
set -u
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0

echo "=== Groundwork session context (from the SessionStart hook) ==="
echo
if [[ -f plan/STATE.md ]]; then
  cat plan/STATE.md
  echo
fi
echo "--- plan.py next ---"
python3 scripts/agent/plan.py next 2>&1 || true
echo
echo "--- plan.py human ---"
python3 scripts/agent/plan.py human 2>&1 | head -30 || true
echo
if git rev-parse --git-dir >/dev/null 2>&1; then
  echo "--- git log --oneline -8 ---"
  git log --oneline -8 2>/dev/null || true
  changes="$(git status --porcelain 2>/dev/null)"
  if [[ -n "$changes" ]]; then
    echo
    echo "WARNING: the working tree has uncommitted changes from an earlier session:"
    printf '%s\n' "$changes" | head -20
    echo "Resolve these first: finish and commit them, or revert them, before claiming a new item."
  fi
fi
echo
echo "Start with /next, or follow PROCESS.md section 3."
exit 0
