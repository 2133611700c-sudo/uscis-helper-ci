#!/usr/bin/env bash
# ============================================================
# ship-controlled-beta.command — One-click ship to prod
#
# Runs full Mac gates → pushes if green → opens Vercel deployment page.
# Double-click in Finder.
#
# Safe by design:
#   - Pushes ONLY if every gate passes
#   - Never force-pushes
#   - Keeps Terminal window open at end so you can read output
# ============================================================

set -u

# Resolve repo root from this script's location
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

LOG="$SCRIPT_DIR/.ship.log"
exec > >(tee "$LOG") 2>&1

# Color helpers
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Messenginfo TPS — Ship Controlled Beta                    ║"
echo "║  Started: $(date '+%Y-%m-%d %H:%M:%S')                       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

HEAD_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
BRANCH="$(git branch --show-current 2>/dev/null || echo unknown)"
COMMITS_AHEAD="$(git rev-list --count origin/main..HEAD 2>/dev/null || echo unknown)"

echo "  Repo:    $(pwd)"
echo "  Branch:  $BRANCH"
echo "  HEAD:    $HEAD_SHA"
echo "  Commits ahead of origin/main: $COMMITS_AHEAD"
echo ""

if [ "$COMMITS_AHEAD" = "0" ]; then
  echo -e "${YELLOW}  ⚠ Nothing to push — origin/main is already at HEAD.${RESET}"
  echo "    Proceeding with gates anyway in case you want fresh validation."
  echo ""
fi

# ── STAGE 1: full Mac gates ────────────────────────────────────────
echo -e "${BOLD}▶ Stage 1/3 — Running all gates (typecheck / vitest / lint / guard / build)...${RESET}"
echo ""

if ! ./scripts/run-all-gates.sh; then
  echo ""
  echo -e "${RED}${BOLD}✗ Gates FAILED. NOT pushing.${RESET}"
  echo "  Read $LOG for full output."
  echo "  Press any key to close..."
  read -r -n 1 -s
  exit 1
fi

echo ""
echo -e "${GREEN}✓ All gates passed.${RESET}"
echo ""

# ── STAGE 2: push ─────────────────────────────────────────────────
echo -e "${BOLD}▶ Stage 2/3 — Pushing to origin/main...${RESET}"
echo ""

if ! git push origin "$BRANCH"; then
  echo ""
  echo -e "${RED}${BOLD}✗ Push FAILED.${RESET}"
  echo "  Read $LOG for full output."
  echo "  Press any key to close..."
  read -r -n 1 -s
  exit 1
fi

NEW_HEAD="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo ""
echo -e "${GREEN}✓ Pushed commit $NEW_HEAD to origin/main.${RESET}"
echo ""

# ── STAGE 3: open Vercel + production for verification ─────────────
echo -e "${BOLD}▶ Stage 3/3 — Opening Vercel deployment page + production URL...${RESET}"
echo ""

open "https://vercel.com/messenginfo/uscis-helper" 2>/dev/null || \
  open "https://vercel.com/dashboard" 2>/dev/null || true

# Wait a few seconds so Vercel has time to register the new push
sleep 5

# Also open prod health probe (will eventually show new SHA when deploy READY)
open "https://messenginfo.com/api/tps/health" 2>/dev/null || true

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo -e "║  ${GREEN}${BOLD}✓ SHIP COMPLETE${RESET}                                              ║"
echo "║                                                            ║"
echo "║  Pushed: $NEW_HEAD                                          ║"
echo "║  Watch Vercel dashboard for READY state.                   ║"
echo "║                                                            ║"
echo "║  After Vercel READY:                                       ║"
echo "║    curl -s https://messenginfo.com/api/tps/health | jq .sha║"
echo "║    Should match: $NEW_HEAD                                  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "  Press any key to close..."
read -r -n 1 -s
