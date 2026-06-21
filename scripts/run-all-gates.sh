#!/usr/bin/env bash
# ============================================================
# run-all-gates.sh — single Mac command to validate TPS pipeline
#
# Runs every gate in order, prints a clean summary, exits 0 only if
# every step passes. Saves a YAML report at test-fixtures/proof/
# so you have audit trail without grep'ing through scrollback.
#
# Usage:
#   ./scripts/run-all-gates.sh
#
# Or double-click in Finder if Terminal is set as the default opener.
#
# Exit codes:
#   0  all gates green — safe to push
#   1  one or more gates failed — see report YAML for details
# ============================================================

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

REPORT_DIR="$REPO_ROOT/test-fixtures/proof"
mkdir -p "$REPORT_DIR"
REPORT="$REPORT_DIR/RUN_ALL_GATES.report.yaml"

# Color helpers
if [ -t 1 ]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  YELLOW='\033[1;33m'
  BOLD='\033[1m'
  RESET='\033[0m'
else
  GREEN=''
  RED=''
  YELLOW=''
  BOLD=''
  RESET=''
fi

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   Messenginfo TPS — run-all-gates.sh                 ║"
echo "║   Mac-side validation before push                    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

HEAD_SHA="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
HEAD_SHORT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
BRANCH="$(git branch --show-current 2>/dev/null || echo unknown)"
COMMITS_AHEAD="$(git rev-list --count origin/main..HEAD 2>/dev/null || echo unknown)"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "Repo head:       $HEAD_SHORT"
echo "Branch:          $BRANCH"
echo "Commits ahead:   $COMMITS_AHEAD"
echo "Started at:      $STARTED_AT"
echo ""

PASS_COUNT=0
FAIL_COUNT=0
declare -a RESULTS

run_step() {
  local name="$1"
  shift
  local cmd="$*"
  echo "▶ $name"
  if eval "$cmd" > /tmp/tps-gate.log 2>&1; then
    echo -e "  ${GREEN}✅ PASS${RESET}  $name"
    PASS_COUNT=$((PASS_COUNT + 1))
    RESULTS+=("- name: \"$name\"\n  status: PASS")
    return 0
  else
    echo -e "  ${RED}❌ FAIL${RESET}  $name"
    echo "    ─ last 20 lines:"
    tail -n 20 /tmp/tps-gate.log | sed 's/^/      /'
    FAIL_COUNT=$((FAIL_COUNT + 1))
    RESULTS+=("- name: \"$name\"\n  status: FAIL\n  log_tail: |\n$(tail -n 10 /tmp/tps-gate.log | sed 's/^/    /')")
    return 1
  fi
}

# ── Gate 1: typecheck ───────────────────────────────────────
run_step "typecheck (apps/web)" "pnpm --filter web run typecheck"

# ── Gate 2: vitest (the one sandbox couldn't run) ───────────
run_step "vitest (apps/web)" "pnpm --filter web test"

# ── Gate 3: lint ────────────────────────────────────────────
run_step "lint (apps/web)" "pnpm --filter web run lint"

# ── Gate 4: content + i18n + reparole guards ────────────────
run_step "content/i18n/reparole guards" "pnpm --filter web run guard"

# ── Gate 5: build ───────────────────────────────────────────
run_step "build (apps/web)" "pnpm --filter web run build"

# ── Summary + YAML report ───────────────────────────────────
FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TOTAL=$((PASS_COUNT + FAIL_COUNT))

{
  echo "report: RUN_ALL_GATES"
  echo "head_sha: $HEAD_SHA"
  echo "head_short: $HEAD_SHORT"
  echo "branch: $BRANCH"
  echo "commits_ahead_of_origin: $COMMITS_AHEAD"
  echo "started_at: \"$STARTED_AT\""
  echo "finished_at: \"$FINISHED_AT\""
  echo "summary:"
  echo "  total: $TOTAL"
  echo "  pass: $PASS_COUNT"
  echo "  fail: $FAIL_COUNT"
  echo "  ready_to_push: $([ "$FAIL_COUNT" -eq 0 ] && echo "true" || echo "false")"
  echo "results:"
  for r in "${RESULTS[@]}"; do
    echo -e "  $r"
  done
} > "$REPORT"

echo ""
echo "══════════════════════════════════════════════════════"
if [ "$FAIL_COUNT" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}  ✅  ALL GATES PASSED — safe to push${RESET}"
  echo "      Next: git push origin $BRANCH"
  echo "      Report: $REPORT"
  echo "══════════════════════════════════════════════════════"
  echo ""
  exit 0
else
  echo -e "${RED}${BOLD}  ❌  $FAIL_COUNT gate(s) FAILED — do NOT push${RESET}"
  echo "      Fix the failures above before pushing."
  echo "      Report: $REPORT"
  echo "══════════════════════════════════════════════════════"
  echo ""
  exit 1
fi
