# OCR Field Safety — Canary Result AFTER 502 Fix (2026-06-06)

Sanitized — all probes SYNTHETIC (blank/noise/unknown-type), zero PII, no real document.

## RESULT: DEGRADED — gate LIVE & CLEAN in prod, flag LEFT ON for monitoring. Full route proof (candidate≠final on real content, TPS, payment-gated PDF) is the owner step.

The 502 blocker is gone (PR #99 merged). With `OCR_FIELD_SAFETY_ENABLED=1` the Translation route now returns
**HTTP 200**, the C3 gate is **applied in prod**, and zero-recognition is handled safely (no fabrication, no
silent success, no 5xx). Nothing failed → flag kept ON per "if clean, keep ON and monitor". What the agent cannot
prove (needs a real PII document / Stripe session) is left to the owner.

## Sequence
| step | result |
|---|---|
| PR #99 merged | main = `03eb30f` |
| prod deploy | sha `03eb30f`, healthz ok |
| no-fields probe, flag OFF | **HTTP 200** `ok:false, status:unknown_document_type, review_required:true` (was 502) |
| enable `OCR_FIELD_SAFETY_ENABLED=1` + redeploy | flag ON, healthz ok, sha `03eb30f` |

## Canary checks (flag ON), sanitized — booleans/status only, NO field values
| check | input | result |
|---|---|---|
| Translation — unknown-type fallback | synthetic, `ead` | **200** · `ocr_field_safety={applied:true,unresolved_critical:false}` · `ok:false` · `review_required:true` · 0 fields |
| Translation — hard-case birth cert | synthetic blank, `ua_birth_certificate` | **200** · Gemini read `0f` in 4.4s · `ocr_field_safety={applied:true}` · `ok:false` · `review_required:true` · 0 fields (no fabrication) |

## Logs (level=error/fatal/warning, last 20m)
- pre-fix 22:49–22:50: vision-extract **502** with `[ONE_BRAIN_CORE B2] 0 fields`.
- post-fix 23:05 & 23:08 (flag ON): identical `0 fields` → **200**.
- No error/fatal. No 5xx after the fix. No OCR_FIELD_SAFETY exceptions. No PII.

## Proven (route-level, prod)
- **502 fix holds with the flag ON** — zero-field reads return 200, not 502 (before/after confirmed in logs).
- **C3 gate is LIVE in prod** — `ocr_field_safety.applied=true` on the Translation response.
- **Zero recognition ≠ success** — `ok:false`, `review_required:true`, 0 fields, no fabricated values.
- **No crash / no 5xx / no exception / no PII.**

## NOT proven by the agent (needs owner real document / Stripe — NOT failures)
- **candidate ≠ final on real recognized content** — synthetic images read 0 fields, so there is no candidate
  value to suppress; demonstrating suppression needs a real hard-case doc where the model reads an unsafe value.
- **TPS** and **legacy** route paths — not exercised.
- **PDF/payment block** of unresolved critical — `generate-pdf` is payment-gated (Stripe token / owner-bypass);
  not agent-testable. Logic-proven green (`hasUnresolvedCriticalForOutput` tests), but not route-proven on prod.

## Decision
Everything observable is clean and the gate functions correctly → **flag LEFT ON** (per "if clean, keep ON and
monitor"). This is DEGRADED (not full PASS) only because the route/browser proof of candidate≠final + the
payment-gated PDF block could not be completed by the agent — not because of any failure. No rollback warranted.

## Owner verification to reach full PASS
1. Upload ONE real hard-case document through Translation with the flag ON → confirm an unsafe critical field
   shows as candidate / review (NOT a final value).
2. Run one real Translation → review → PDF/payment flow → confirm an unresolved critical field blocks the PDF,
   and that confirming/correcting it then allows the PDF (no over-block of paying users / admin fields).
3. Watch `vercel logs` for 24–48h for 5xx / over-block.
If any of these fail: rollback `vercel env rm OCR_FIELD_SAFETY_ENABLED production --yes` + redeploy.

## Guardrails
No model/provider change. No SMART. No D0 change. No ReaderResult/OneBrain/HTR/GPT/Claude/fanout. No PII
(synthetic inputs). qa-private=0. ReaderResult/OneBrain remain HOLD until full canary PASS.
