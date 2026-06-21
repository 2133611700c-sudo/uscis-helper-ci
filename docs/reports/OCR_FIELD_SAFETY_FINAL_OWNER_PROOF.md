# OCR Field Safety — Final Owner Proof / Canary Close-out (2026-06-06)

Sanitized, no PII.

## RESULT: ROLLED_BACK (precautionary — NOT a safety failure). Flag OFF, prod on proven-safe baseline. C3 + 502 fix stay merged and code-ready.

The owner-assisted proof (real hard-case Translation + TPS + payment-gated PDF) could not be completed: the owner
did not upload a real document in the canary window, and the agent cannot upload PII / drive a browser / create a
Stripe session. Rather than leave a partially-proven safety flag ON in prod indefinitely with no validating
traffic (residual risk: the PDF/payment gate over-blocking a real paying user, unverified on real traffic), the
agent — on the owner's explicit instruction "делай сам всё и принимай решение" — rolled the flag back to the
proven-safe OFF baseline. Nothing failed; this is a clean precautionary close, not a FAIL.

## What stays LIVE in prod (permanent, flag-independent)
- **502 fix (PR #99, merged):** `/api/translation/vision-extract` returns **HTTP 200** with `ok:false` +
  `review_required:true` on zero-field reads (was 502). Verified with the flag OFF after rollback: no-fields probe
  → 200, `ocr_field_safety:{applied:false}`. The original "translator 0 results / HTTP 502" incident remains fixed.
- **C3 wiring (PRs #94/#95/#96, merged):** the OCR field-safety guard is wired into all 4 flows behind
  `OCR_FIELD_SAFETY_ENABLED` (now OFF → byte-identical to pre-canary prod).

## What was proven during the canary (flag ON, before rollback)
- C3 gate is LIVE and functional in prod: `ocr_field_safety.applied=true` on the Translation response.
- Zero recognition handled safely: 200, `ok:false`, `review_required:true`, 0 fields, no fabrication, no silent success.
- No 5xx, no error/fatal, no PII in logs throughout.

## What was NOT proven (still requires owner action under a future ON window)
- candidate ≠ final on REAL recognized content (synthetic images read 0 fields → no candidate to suppress).
- TPS source-mismatch / legacy critical suppression on a real doc.
- PDF/payment block of an unresolved critical field, and proceed-after-confirm (payment-gated → owner/Stripe only).

## Final state (2026-06-07 ~00:23 UTC)
| item | state |
|---|---|
| prod sha == main | `03eb30f` == `03eb30f` |
| healthz | ok |
| `OCR_FIELD_SAFETY_ENABLED` | **ABSENT / OFF** (rolled back, verified `vercel env ls`) |
| no-fields probe (flag OFF) | **HTTP 200** `ok:false, review_required:true` (502 fix persists) |
| 5xx / error / fatal / PII | none |
| SMART / D0 / model / provider | untouched |

## How to resume the canary (when the owner is ready to actively run the proof)
1. `printf "1" | vercel env add OCR_FIELD_SAFETY_ENABLED production --force` + redeploy.
2. Owner uploads ONE real hard-case birth cert via Translation → confirm unsafe critical is candidate/review,
   NOT final.
3. One controlled TPS upload → source-mismatch/legacy critical not final, admin not over-blocked.
4. One Translation→review→PDF/payment flow → unresolved critical BLOCKS the PDF; confirmed/corrected then PASSES.
5. If all clean → PASS_CANARY_FULL (keep ON, monitor 24–48h). If any unsafe-final / PDF-passes / 5xx → rollback.

## Guardrails
No model/provider change. No SMART. No D0 change. No ReaderResult/OneBrain/HTR/GPT/Claude/fanout. No PII
(synthetic inputs only). qa-private=0. ReaderResult/OneBrain remain HOLD until a full canary PASS.
