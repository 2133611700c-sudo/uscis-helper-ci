# TPS PRODUCTION AUDIT — 2026-05-24
# Principal QA Architect Report

## STATUS: DEGRADED

---

## UPLOAD SLOT MATRIX (code-verified, line 1700-1730 TPSWizardV2.tsx)

| Path         | Passport | Booklet | I-94 | I-797/EAD | TPS Notice | EAD Old | DL |
|--------------|----------|---------|------|-----------|------------|---------|-----|
| INIT+EAD     | ✅       | ✅      | ✅   | ✅        | —          | —       | ✅  |
| INIT+NOEAD   | ✅       | ✅      | ✅   | ✅        | —          | —       | ✅  |
| REREG+EAD    | ✅       | ✅      | ✅   | —         | ✅         | ✅      | ✅  |
| REREG+NOEAD  | ❌       | ✅      | ❌   | —         | ✅         | —       | ✅  |

## GATE REQUIRED vs PATH CAPABILITY

| Path         | Gate Result | Blocked Fields |
|--------------|-------------|----------------|
| INIT+EAD     | ✅ PASS     | none |
| INIT+NOEAD   | ✅ PASS     | none |
| REREG+EAD    | ✅ PASS     | none |
| REREG+NOEAD  | ❌ DEAD END | family_name, given_name, dob, sex, passport_number, passport_expiration_date, last_entry_date |

## SCENARIO MATRIX

| # | Scenario                    | Slots OK | Gate OK | E2E Proven | Verdict     |
|---|----------------------------|----------|---------|------------|-------------|
| 1 | INIT + EAD + PAPER         | ✅       | ✅      | ✅ (session 13) | PASS |
| 2 | INIT + EAD + ONLINE        | ✅       | ✅      | ❓ not tested | UNVERIFIED |
| 3 | INIT + NOEAD + PAPER       | ✅       | ✅      | ❓ not tested | UNVERIFIED |
| 4 | REREG + EAD + PAPER        | ✅       | ✅      | ❓ not tested | UNVERIFIED |
| 5 | REREG + EAD + ONLINE       | ✅       | ✅      | ❓ not tested | UNVERIFIED |
| 6 | REREG + NOEAD              | ❌       | ❌      | ❌ dead end   | FAIL |
| 7 | Owner mode (any)           | ✅       | ✅      | ❌ no session | BLOCKED |
| 8 | Mobile (any)               | ❓       | ❓      | ❌ not testable| UNVERIFIED |

## SIGNATURE MATRIX

| Mode   | Signature Block | Behavior |
|--------|----------------|----------|
| PAPER  | VISIBLE        | Screen (draw) or Paper (print+sign) |
| ONLINE | HIDDEN         | User signs in myUSCIS |

## OWNER vs CLIENT COMPARISON (code-level)

| Aspect              | Owner                    | Client                   | Drift? |
|---------------------|--------------------------|--------------------------|--------|
| Upload slots        | SAME                     | SAME                     | NO     |
| OCR                 | SAME                     | SAME                     | NO     |
| Review              | SAME                     | SAME                     | NO     |
| Gate                | SAME rules               | SAME rules               | NO     |
| Generate            | Direct (no pay)          | Requires Stripe payment  | YES — expected |
| Signature           | SAME                     | SAME                     | NO     |
| ZIP contents        | SAME                     | SAME                     | NO     |
| Translation         | Auto (future)            | Paid service (future)    | YES — by design |

## MOBILE vs DESKTOP (code-level, NOT live-tested)

| Aspect              | Mobile Risk | Notes |
|---------------------|-------------|-------|
| Nav bar             | ❓ No hamburger menu at 390px | May overflow or wrap |
| Upload slots        | ❓ Touch upload | File picker behavior unknown on iOS |
| Signature pad       | ❓ Touch draw | Canvas touch events may differ |
| Tooltips [?]        | ❓ Click popup | May not position correctly |
| Review fields       | ❓ Input focus | May zoom/scroll unexpectedly |
| ZIP download        | ❓ Blob download | iOS Safari blob handling differs |
| PDF in ZIP          | ❓ Can user open | iOS needs Files app or third-party |

⚠️ NONE OF THE ABOVE IS LIVE-TESTED. All mobile items are UNVERIFIED.

## TOP BUGS (ranked by severity)

### 🔴 CRITICAL #1: REREG+NOEAD = dead path
- **Impact**: User who chooses re-registration without EAD can never complete
- **Root cause**: TPSWizardV2.tsx line 1711 — `if (ead)` gates passport/ead_old/i94 slots
- **7 required fields** have no source: name, dob, sex, passport, expiry, entry date
- **Fix**: Add passport + i94 slots to rereg-noEAD path, OR disable this path in UI

### 🟡 HIGH #2: Stripe not connected
- **Impact**: Client mode = dead end. Paywall shows but can't pay.
- **Root cause**: Stripe integration not wired
- **Fix**: Connect Stripe or remove paywall for beta

### 🟡 HIGH #3: Translation disabled
- **Impact**: USCIS requires certified translation. ZIP without it = incomplete packet.
- **Root cause**: Translation bridge disabled, templates not approved
- **Fix**: Enable translation OR add clear warning that translation is separate

### 🟡 HIGH #4: No mobile testing done
- **Impact**: 80%+ of target users are mobile. Unknown if flow works.
- **Root cause**: All testing on desktop Chrome
- **Fix**: Manual test on iPhone + Android

### 🟡 HIGH #5: passport_expiration_date no manual fallback
- **Impact**: If MRZ OCR fails on expiry date, gate blocks with no recovery
- **Root cause**: Field is REQUIRED but not in manual inputs
- **Fix**: Add manual input field

### 🟡 MEDIUM #6: last_entry_date unconditionally required
- **Impact**: Blocks rereg even when I-94 uploaded (if OCR misses date)
- **Root cause**: mailReadyGate.ts line 49 — no path condition
- **Fix**: Add manual input for last_entry_date in all paths

### 🟡 MEDIUM #7: INSTRUCTION.txt not verified
- **Impact**: Wrong Lockbox address or fee = rejection
- **Root cause**: Nobody compared with current uscis.gov/TPS-Ukraine
- **Fix**: Manual verification against official source

### 🟢 LOW #8: I-912 fee waiver not supported
- **Impact**: Low-income users can't generate fee waiver form
- **Fix**: Future feature

### 🟢 LOW #9: EAD auto-extension deadline not shown
- **Impact**: Users may miss July 22, 2026 deadline
- **Fix**: Add banner/warning

## WHAT IS ACTUALLY PRODUCTION-READY

Only ONE path is fully E2E verified:
**INIT + EAD + PAPER (client mode, desktop)**

Everything else = code looks right but not proven end-to-end.

## NEXT EXACT FIX ORDER

1. Fix REREG+NOEAD (add passport+i94 slots) — 15 min code, prevents dead end
2. Add passport_expiration_date manual input — 5 min
3. Add last_entry_date manual input for all paths — 5 min
4. Test on real iPhone — 30 min manual
5. Verify INSTRUCTION.txt against uscis.gov — 15 min manual
6. Connect Stripe — separate project
7. Enable translation — separate project

## EVIDENCE FILES
- docs/reports/evidence/t3ps-final-release/browser-run-clean/dual_proof_summary.json
- docs/reports/evidence/t3ps-final-release/browser-run-clean/dual_proof_zip_listing.txt
- docs/reports/evidence/t3ps-final-release/browser-run-clean/dual-proof-pdf-pages/
- docs/audit/T3PS_MASTER_RELEASE_LOCK_FINAL.yaml
