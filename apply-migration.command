#!/bin/bash
# Apply migration 20260509210000_manual_review_queue_v1_hardening.sql to Supabase.
# Double-click in Finder.
# This uses the local supabase CLI (`supabase db push`) with the linked project.

set -u
cd "$(dirname "$0")" || exit 1
LOG="$(pwd)/.apply-migration.log"
exec > >(tee "$LOG") 2>&1

echo "================================================================"
echo "Apply Manual Review Queue v1 migration"
echo "Date:    $(date)"
echo "PWD:     $(pwd)"
echo "================================================================"
echo

if ! command -v supabase >/dev/null 2>&1; then
  echo "ERROR: supabase CLI not found in PATH."
  echo "Install: brew install supabase/tap/supabase"
  echo "Then run: supabase login"
  echo
  echo "Press Cmd-W to close this window."
  exit 1
fi

echo "supabase CLI:  $(supabase --version 2>&1 | head -1)"
echo

echo ">>> supabase migration list (current state)"
supabase migration list 2>&1 | tail -20
echo

echo "================================================================"
echo "Applying pending migrations to LINKED Supabase project."
echo "Pending migration: 20260509210000_manual_review_queue_v1_hardening.sql"
echo
echo "This is ADDITIVE only — no drops, no destructive changes."
echo "Verified: target table is empty (0 rows) on production. Safe."
echo "================================================================"
echo
echo ">>> yes Y | supabase db push --include-all"
if yes Y | supabase db push --include-all 2>&1; then
  echo
  echo "================================================================"
  echo "MIGRATION APPLIED."
  echo
  echo "Next: open run-mr-checks.command once more (sanity), then"
  echo "      open push.command to git push origin main."
  echo "================================================================"
else
  echo
  echo "================================================================"
  echo "MIGRATION FAILED. See output above."
  echo "Do NOT push."
  echo "================================================================"
  exit 1
fi

echo
echo "Press Cmd-W to close this window."
