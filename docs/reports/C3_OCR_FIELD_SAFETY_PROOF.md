# C3 — OCR Field Safety Proof (flag-ON, local/logic; route-HTTP = owner canary)

**Date:** 2026-06-06. Sanitized, no PII. Proves the wired guard's behavior with `OCR_FIELD_SAFETY_ENABLED=1`
using the exact guard/helper the routes call (`c3FlowSafety.proof.test.ts`, in main via #96). The route-level
HTTP / browser proof is the owner canary step (see OCR_FIELD_SAFETY_CANARY_RUNBOOK.md) — not run by the agent.

## Merge state
- Stack merged: **#94 (audit) → #95 (guard) → #96 (C3 wiring)** → origin/main `0d3d82b`.
- `OCR_FIELD_SAFETY_ENABLED` **absent (OFF)** in prod (`vercel env ls production`).
- tsc 0 errors; full suite **2913 passed / 4 skipped** on merged main. Flag OFF ⇒ byte-identical.

## Flag gate
- OFF (absent) ⇒ `isOcrFieldSafetyEnabled()=false` ⇒ every wired route skips the guard ⇒ behavior unchanged.
- ON ⇒ enforcement active (below).

## Per-flow proof (flag ON), booleans/reason-codes only — NO field values
| flow | scenario | result |
|---|---|---|
| Translation public | hard-case birth cert critical fields | `value=null` (not final) · `candidate_value` kept · `review_required=true` · `manual_required=true` |
| Translation public | zero recognition | `manual_required=true`, reason `zero_usable_recognition` — NOT silent success |
| TPS merge | legacy reader (no strong anchor) critical | not final · reason `legacy_reader_untrusted` |
| TPS merge | birth-cert field vs internal-passport-expected slot | not final · reason `source_doc_type_mismatch` |
| Legacy boundary | legacy critical (passport_number) | not final · admin field (`us_address_state`) → passes |
| PDF/payment | unresolved critical | `hasUnresolvedCriticalForOutput=true` → blocked |
| PDF/payment | confirmed critical + unresolved admin | NOT blocked (admin not over-blocked) |

## Guarantees demonstrated
- candidate ≠ final (unsafe critical never occupies the value slot).
- zero recognition ≠ success.
- source mismatch / legacy / hard-case critical → not final.
- review_required / manual_required enforced (monotonic — only increase).
- admin fields not over-blocked.
- guard is PII-free by construction (takes `value_present` booleans, never the value).

## Limitation
Logic-level local proof via the routes' own guard path. The literal route-HTTP/browser proof (upload through
the dev server / messenginfo with the flag ON) is the owner canary step — the agent did not run it (no prod
flag change, no PII upload). Test reference: `apps/web/src/lib/documentSafety/__tests__/c3FlowSafety.proof.test.ts`.
