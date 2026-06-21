#!/bin/bash
# Commit + push the USCIS rule hardening (H.R.1 + signature deny rule).
# Double-click in Finder, or run from terminal.

set -euo pipefail
cd "$(dirname "$0")" || exit 1

echo "================================================================"
echo "  USCIS Rule Hardening — commit & push"
echo "  Date:   $(date)"
echo "  Branch: $(git branch --show-current 2>&1 | head -1)"
echo "================================================================"
echo

# Remove stale lock files if they exist
rm -f .git/index.lock .git/index2.lock 2>/dev/null && echo "  ✓ Cleared stale git lock files" || true
echo

echo ">>> Staging changed files"
git add \
  apps/web/src/lib/tps/filingGuidance.ts \
  apps/web/src/lib/tps/packetBuilder.ts \
  apps/web/src/components/tps/PacketCompletenessChecker.tsx \
  apps/web/src/app/[locale]/services/tps-ukraine/page.tsx \
  apps/web/src/app/[locale]/services/tps-ukraine/sources/page.tsx \
  apps/web/src/app/[locale]/services/tps-ukraine/start/GeneratePacketBlock.tsx \
  apps/web/src/app/[locale]/services/tps-ukraine/start/TPSWizard.tsx \
  apps/web/src/lib/tps/__tests__/packetBuilder.test.ts \
  apps/web/scripts/check-content-guards.sh \
  apps/web/test-fixtures/proof/USCIS_RULE_SNAPSHOT_2026-05-12.report.yaml
echo "  ✓ Staged"
echo

echo ">>> git diff --stat (staged)"
git diff --cached --stat
echo

echo ">>> Committing"
git commit -m "feat(tps): USCIS rule hardening — H.R.1 + signature deny rule + stale EAD cleanup

Per evidence snapshot USCIS_RULE_SNAPSHOT_2026-05-12.report.yaml:

REGULATORY CHANGES (FR 2026-08333 + FR 2026-09289):
- filingGuidance.ts: SNAPSHOT_DATE→2026-05-12, HR1_FEE_RULE constants,
  feeGuidance notes split (I-912 base only, H.R.1 non-waivable, EAD 1yr cap)
- packetBuilder.ts: README §4 signature deny+fee warning (FR 2026-09289,
  eff 2026-07-10); §5 H.R.1 non-waivable fee note

UI (all 4 locales uk/ru/en/es):
- tps-ukraine/page.tsx: regulatory alert banner; FAQ EAD + fee waiver updated
- sources/page.tsx: ⚠ 2026 rules category (FR 2026-08333 + FR 2026-09289)
- PacketCompletenessChecker.tsx: signDenyFeeWarning + fee section (checker);
  fix curly-quote string delimiters that broke tsc
- GeneratePacketBlock.tsx: nsSignPenWarning → deny+keep-fee + FR citation
- TPSWizard.tsx: s3EadAutoNote marks Apr 19, 2026 EAD auto-ext as expired

GUARDS (check-content-guards.sh):
- Rule 11: signature deny+fee warning required in 3 surfaces
- Rule 12: no stale Apr 19, 2026 EAD date without expired marker

TEST: packetBuilder.test.ts adds readAcroFieldValue (pdf-lib)

Evidence: apps/web/test-fixtures/proof/USCIS_RULE_SNAPSHOT_2026-05-12.report.yaml"

echo "  ✓ Committed"
echo
echo ">>> HEAD: $(git rev-parse HEAD)"
echo

echo "================================================================"
echo "  Running content guards before push..."
echo "================================================================"
cd apps/web && bash scripts/check-content-guards.sh
cd ..
echo

echo "================================================================"
echo "  Pushing to origin/main"
echo "================================================================"
git push --force-with-lease origin main
echo
echo "================================================================"
echo "  ✅ DONE. Vercel will build and deploy."
echo "  Tell the agent: 'pushed' to proceed with smoke test."
echo "================================================================"
echo
echo "Press Cmd-W to close this window."
