#!/usr/bin/env bash
# ============================================================
# Content & Brand Guard — Messenginfo
# Blocks commits / CI builds if forbidden phrases are found
# in product-facing source files.
#
# Exit 0 = clean. Exit 1 = violations found.
# ============================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO_ROOT/src"
MSG="$REPO_ROOT/messages"

VIOLATIONS=0

banner() { echo ""; echo "▶ $1"; }
ok()     { echo "  ✅  $1 — CLEAN"; }
fail()   { echo "  ❌  $1"; VIOLATIONS=$((VIOLATIONS + 1)); }

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   Messenginfo Content & Brand Guard                  ║"
echo "╚══════════════════════════════════════════════════════╝"

# ── Rule 1: No "translator certification statement" ──────────
banner "Rule 1 — No 'translator certification statement'"
HITS=$(grep -rn "translator certification statement" "$SRC" "$MSG" 2>/dev/null || true)
if [ -n "$HITS" ]; then
  fail "translator certification statement"
  echo "$HITS" | sed 's/^/     /'
else
  ok "translator certification statement"
fi

# ── Rule 2: No "USCIS-certified" ─────────────────────────────
banner "Rule 2 — No 'USCIS-certified'"
HITS=$(grep -rn "USCIS-certified" "$SRC" "$MSG" 2>/dev/null || true)
if [ -n "$HITS" ]; then
  fail "USCIS-certified"
  echo "$HITS" | sed 's/^/     /'
else
  ok "USCIS-certified"
fi

# ── Rule 3: No "we certify" (any case) ───────────────────────
banner "Rule 3 — No 'we certify' (case-insensitive)"
HITS=$(grep -rin "we certify" "$SRC" "$MSG" 2>/dev/null || true)
if [ -n "$HITS" ]; then
  fail "we certify"
  echo "$HITS" | sed 's/^/     /'
else
  ok "we certify"
fi

# ── Rule 4: No "certified translation" as product claim ──────
# Allowed: "not a certified translation", "does not create a certified translation"
# Blocked: any other occurrence in src/components, src/app, src/lib, messages
banner "Rule 4 — No 'certified translation' as product claim"
HITS=$(grep -rn "certified translation" "$SRC/components" "$SRC/app" "$SRC/lib" "$MSG" 2>/dev/null \
  | grep -v "not a certified translation\|not create a certified\|cannot create a certified\|does not produce a certified" \
  | grep -v "translationQaValidator\|FORBIDDEN_PHRASES\|# content-guard: detection-list" \
  | grep -v "__tests__\|\.test\.ts\|\.spec\.ts" \
  || true)
if [ -n "$HITS" ]; then
  fail "certified translation (product claim)"
  echo "$HITS" | sed 's/^/     /'
else
  ok "certified translation (product claim)"
fi

# ── Rule 5: No "Standalone translator certification" ─────────
banner "Rule 5 — No 'Standalone translator certification'"
HITS=$(grep -rn "Standalone translator certification" "$SRC" "$MSG" 2>/dev/null || true)
if [ -n "$HITS" ]; then
  fail "Standalone translator certification"
  echo "$HITS" | sed 's/^/     /'
else
  ok "Standalone translator certification"
fi

# ── Rule 6: No "translator certification is not included in this step" (old banner phrase) ──
banner "Rule 6 — No old banner 'translator certification is not included in this step'"
HITS=$(grep -rn "translator certification is not included in this step" "$SRC" "$MSG" 2>/dev/null || true)
if [ -n "$HITS" ]; then
  fail "translator certification is not included"
  echo "$HITS" | sed 's/^/     /'
else
  ok "translator certification is not included"
fi

# ── Rule 7: No "Translator Certification Statement" as heading ─
# (allowed in comments/docs, blocked in rendered HTML/JSX strings)
banner "Rule 7 — No 'Translator Certification Statement' in UI strings"
HITS=$(grep -rn "Translator Certification Statement" "$SRC/components" "$SRC/app" "$SRC/lib" "$MSG" 2>/dev/null || true)
if [ -n "$HITS" ]; then
  fail "Translator Certification Statement (UI string)"
  echo "$HITS" | sed 's/^/     /'
else
  ok "Translator Certification Statement (UI string)"
fi

# ── Rule 8: No UPL / legal advice claims ─────────────────────
banner "Rule 8 — No UPL / legal-advice phrases in UI"
UPL_PATTERNS=(
  "USCIS requires you"
  "USCIS will accept"
  "USCIS will reject"
  "guaranteed acceptance"
  "will cause denial"
  "will cause RFE"
  "RFE will"
  "legal advice"
  "must file"
  "case strategy"
  "This guarantees acceptance"
  "This is legally sufficient"
)
for PHRASE in "${UPL_PATTERNS[@]}"; do
  HITS=$(grep -rin "$PHRASE" "$SRC/components" "$SRC/app" "$MSG" 2>/dev/null \
    | grep -v "FORBIDDEN_PHRASES\|detection-list\|content-guard\|__tests__\|\.test\.ts\|\.spec\.ts" \
    | grep -vi "not legal advice\|no legal advice\|does not provide legal advice\|is not legal advice\|not a law firm\|is this legal advice\|for legal advice\|not provide legal\|does not.*legal\|is not.*legal\|constitutes legal advice\|WE DO NOT PROVIDE LEGAL\|nothing.*legal advice\|not.*legal advice" \
    || true)
  if [ -n "$HITS" ]; then
    fail "UPL phrase: $PHRASE"
    echo "$HITS" | sed 's/^/     /'
  else
    ok "UPL clean: $PHRASE"
  fi
done

# ── Rule 9: No PDF-forbidden phrases in renderer / PDF lib ────
banner "Rule 9 — No forbidden PDF phrases in renderer/packet"
PDF_PATTERNS=("CERTIFIED COPY" "Translator Note" "internal QA" "ocr_id" "source trace")
for PHRASE in "${PDF_PATTERNS[@]}"; do
  HITS=$(grep -rn "$PHRASE" "$SRC/lib/packet" "$SRC/lib/translation/bureauStyleRenderer.ts" 2>/dev/null \
    | grep -v "FORBIDDEN_PHRASES\|detection-list\|content-guard\|__tests__\|\.test\.ts" \
    | grep -v "^\s*[*\/]\|NO.*$PHRASE\|No.*$PHRASE\|no.*$PHRASE\|removed\|NOT.*$PHRASE\|without.*$PHRASE" \
    || true)
  if [ -n "$HITS" ]; then
    fail "PDF forbidden phrase: $PHRASE"
    echo "$HITS" | sed 's/^/     /'
  else
    ok "PDF clean: $PHRASE"
  fi
done

# ── Rule 10: TPS forbidden claims (from CB.5 / TPS controlled-beta) ─
# Hard list from TPS_CONTROLLED_BETA_READINESS_FINAL prompt-pack.
# Each phrase, if it appears in user-facing copy, breaks the promise
# that Messenginfo never claims to be USCIS-approved or a law firm.
banner "Rule 10 — TPS forbidden claims"
TPS_FORBIDDEN=(
  "we file for you"
  "we file on your behalf"
  "USCIS accepted"
  "USCIS approved"
  "official USCIS partner"
  "guaranteed approval"
  "guaranteed acceptance"
  "we are certified"
  "we are a law firm"
  "fully done"
  "paid launch ready"
)
for PHRASE in "${TPS_FORBIDDEN[@]}"; do
  HITS=$(grep -rin "$PHRASE" "$SRC/components" "$SRC/app" "$MSG" 2>/dev/null \
    | grep -v "FORBIDDEN_PHRASES\|detection-list\|content-guard\|__tests__\|\.test\.ts\|\.spec\.ts\|TPS_CONTROLLED_BETA\|TPS_FINISH_PLAN\|SECURITY_PRIVACY_AUDIT\|OUTPUT_CONTRACT_AUDIT" \
    | grep -vi "not a law firm\|is not a law firm\|do not file\|does not file\|does not.*USCIS\|not.*USCIS accepted\|not.*USCIS approved\|never.*guarantee\|no guaranteed\|no.*guarantee\|never.*USCIS partner\|not.*USCIS partner\|not.*certified\|no \"USCIS\|no '\''USCIS\|^\s*\*.*no\b" \
    || true)
  if [ -n "$HITS" ]; then
    fail "TPS forbidden: $PHRASE"
    echo "$HITS" | sed 's/^/     /'
  else
    ok "TPS clean: $PHRASE"
  fi
done

# ── Rule 11: Signature-deny-fee warning MUST be present in product copy ──
# FR doc 2026-09289 (effective 2026-07-10): USCIS may deny and keep fee
# for invalid signatures. The warning must appear in packetBuilder README
# and in PacketCompletenessChecker / GeneratePacketBlock sign sections.
banner "Rule 11 — Signature deny+fee warning present in packetBuilder README"
README_WARN=$(grep -c "DENY\|deny\|RETAIN\|retain\|fee.*invalid\|invalid.*fee" \
  "$SRC/lib/tps/packetBuilder.ts" 2>/dev/null || true)
if [ "${README_WARN:-0}" -lt 1 ]; then
  fail "packetBuilder.ts missing signature deny+fee warning"
else
  ok "packetBuilder.ts contains signature deny+fee warning"
fi

banner "Rule 11b — Signature deny+fee warning present in GeneratePacketBlock"
BLOCK_WARN=$(grep -c "DENY\|deny\|RETAIN\|retain\|FR 2026-09289\|2026-09289" \
  "$SRC/app/[locale]/services/tps-ukraine/start/GeneratePacketBlock.tsx" 2>/dev/null || true)
if [ "${BLOCK_WARN:-0}" -lt 1 ]; then
  fail "GeneratePacketBlock.tsx missing signature deny+fee warning"
else
  ok "GeneratePacketBlock.tsx contains signature deny+fee warning"
fi

banner "Rule 11c — Signature deny+fee warning present in PacketCompletenessChecker"
CHECKER_WARN=$(grep -c "DENY\|deny\|RETAIN\|retain\|FR 2026-09289\|2026-09289\|signDenyFeeWarning" \
  "$SRC/components/tps/PacketCompletenessChecker.tsx" 2>/dev/null || true)
if [ "${CHECKER_WARN:-0}" -lt 1 ]; then
  fail "PacketCompletenessChecker.tsx missing signature deny+fee warning"
else
  ok "PacketCompletenessChecker.tsx contains signature deny+fee warning"
fi

# ── Rule 12: No unconditional stale EAD auto-extension date claim ────────
# The EAD auto-extension date (Apr 19, 2026) has expired as of May 2026.
# Claiming it as a current/future EAD validity date is factually wrong.
# Rule: block any UI string that mentions "Apr 19, 2026" or "April 19, 2026"
# NEXT TO EAD context ("EAD", "work permit", "автопродовження", "автопродление")
# without being explicitly marked as expired.
# Oct 19, 2026 is the TPS EXTENSION end date (valid/future) — not blocked here.
# Comment lines (containing ' * ' or beginning with //) and explicit
# "EXPIRED/expired" or "past" annotations are excluded.
banner "Rule 12 — No unconditional stale EAD auto-extension date (Apr 19, 2026 + EAD context)"
STALE_EAD=$(grep -rn "Apr 19, 2026\|April 19, 2026\|04\/19\/2026\|2026-04-19" \
  "$SRC/components" "$SRC/app" "$MSG" 2>/dev/null \
  | grep -i "EAD\|work permit\|employment auth\|автопрод\|auto-extension\|autoextension\|Card Expires" \
  | grep -v "EXPIRED\|expired\|stale\|removed\|past\|no longer\|is expired\|has expired" \
  | grep -v "^\s*\*\|^\s*//" \
  | grep -v "__tests__\|\.test\.ts\|\.spec\.ts\|test-fixtures\|\.report\." \
  || true)
if [ -n "$STALE_EAD" ]; then
  fail "Stale EAD auto-extension date (Apr 19, 2026) without expired marker in user-facing copy"
  echo "$STALE_EAD" | sed 's/^/     /'
else
  ok "No unconditional stale EAD auto-extension date (Apr 19, 2026)"
fi

# ── Summary ───────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════"
if [ "$VIOLATIONS" -eq 0 ]; then
  echo "  ✅  ALL CONTENT GUARDS PASSED — $VIOLATIONS violations"
  echo "══════════════════════════════════════════════════════"
  echo ""
  exit 0
else
  echo "  ❌  CONTENT GUARD FAILED — $VIOLATIONS violation(s) found"
  echo "      Fix the phrases above before committing."
  echo "══════════════════════════════════════════════════════"
  echo ""
  exit 1
fi
