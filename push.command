#!/bin/bash
# Git push origin main — Manual Review Queue v1 (Path B).
# Double-click in Finder.
# Pre-conditions:
#   1. run-mr-checks.command must have shown ALL CHECKS PASSED.
#   2. apply-migration.command must have shown MIGRATION APPLIED.

set -u
cd "$(dirname "$0")" || exit 1
LOG="$(pwd)/.push.log"
exec > >(tee "$LOG") 2>&1

echo "================================================================"
echo "Push Manual Review Queue v1"
echo "Date:    $(date)"
echo "PWD:     $(pwd)"
echo "HEAD:    $(git rev-parse HEAD 2>&1 | head -1)"
echo "Branch:  $(git branch --show-current 2>&1 | head -1)"
echo "================================================================"
echo

echo ">>> commits ahead of origin/main"
git log --oneline origin/main..HEAD 2>&1 | head -5
echo

echo ">>> diff summary"
git diff --stat origin/main..HEAD 2>&1 | tail -5
echo

echo "================================================================"
echo "Pushing to origin/main."
echo "================================================================"
echo
echo ">>> git push --force-with-lease origin main"
if git push --force-with-lease origin main 2>&1; then
  PUSHED_HEAD=$(git rev-parse HEAD 2>&1 | head -1)
  echo
  echo "================================================================"
  echo "PUSHED. Commit: $PUSHED_HEAD"
  echo
  echo "Vercel will build and deploy. Tell the agent: 'pushed'."
  echo "================================================================"
else
  echo
  echo "================================================================"
  echo "PUSH FAILED. See output above."
  echo "================================================================"
  exit 1
fi

echo
echo "Press Cmd-W to close this window."
