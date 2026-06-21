#!/bin/bash
# Manual Review Queue v1 — verification runner
# Double-click in Finder. Output goes to ~/work/uscis-helper/.mr-checks.log
# (the agent reads this log via the Cowork mount).

set -u  # unset vars are errors; we don't set -e because we want to keep going past failures

cd "$(dirname "$0")" || exit 1

LOG="$(pwd)/.mr-checks.log"
exec > >(tee "$LOG") 2>&1

echo "================================================================"
echo "Manual Review Queue v1 — local verification"
echo "Date:      $(date)"
echo "PWD:       $(pwd)"
echo "Node:      $(node -v 2>&1 || echo 'not found')"
echo "pnpm:      $(pnpm -v 2>&1 || echo 'not found')"
echo "git HEAD:  $(git rev-parse HEAD 2>&1 | head -1)"
echo "git branch:$(git branch --show-current 2>&1 | head -1)"
echo "================================================================"
echo

step() {
  echo
  echo "----------------------------------------------------------------"
  echo ">>> $1"
  echo "----------------------------------------------------------------"
}

FAIL=0
declare -a SUMMARY

run_check() {
  local label="$1"; shift
  step "$label"
  echo "$ $*"
  if "$@"; then
    SUMMARY+=("PASS  $label")
  else
    SUMMARY+=("FAIL  $label  (exit $?)")
    FAIL=$((FAIL+1))
  fi
}

# ── 1. pnpm install (repair node_modules) ───────────────────────────────
run_check "pnpm install (repair node_modules)" pnpm install

# ── 2. typecheck ────────────────────────────────────────────────────────
run_check "pnpm --filter web typecheck"        pnpm --filter web typecheck

# ── 3. content guard ────────────────────────────────────────────────────
run_check "pnpm --filter web run guard:content" pnpm --filter web run guard:content

# ── 4. tests ────────────────────────────────────────────────────────────
run_check "pnpm --filter web test"             pnpm --filter web test

# ── 5. build ────────────────────────────────────────────────────────────
run_check "pnpm build"                         pnpm build

# ── Summary ─────────────────────────────────────────────────────────────
echo
echo "================================================================"
echo "SUMMARY"
echo "================================================================"
for line in "${SUMMARY[@]}"; do
  echo "  $line"
done
echo
echo "Total failures: $FAIL"
echo "Log file: $LOG"
if [ "$FAIL" -eq 0 ]; then
  echo
  echo "ALL CHECKS PASSED."
  echo "Next manual step: apply migration + git push origin main"
else
  echo
  echo "FAILURES — do NOT push. Share .mr-checks.log with the agent."
fi
echo "================================================================"

# Keep the Terminal window open so the user can read the result.
echo
echo "Press Cmd-W to close this window."
