# OCR Field Safety — Canary Runbook (OCR_FIELD_SAFETY_ENABLED)

**Date:** 2026-06-06. C3 wiring merged to main (stack #94→#95→#96). The guard is wired into all 4 flows behind
`OCR_FIELD_SAFETY_ENABLED` (**default OFF → prod byte-identical**). This runbook is for the OWNER to enable a
controlled canary. The agent does NOT flip the prod flag.

## Pre-flight (status 2026-06-06)
| check | state |
|---|---|
| C3 stack merged (#94/#95/#96) | ✅ origin/main = 0d3d82b |
| `OCR_FIELD_SAFETY_ENABLED` in prod | **absent (OFF)** — verified `vercel env ls production` |
| tsc / full suite on main | ✅ 0 errors / 2913 passed / 4 skipped |
| flag-ON logic proof (all 4 flows) | ✅ `c3FlowSafety.proof.test.ts` |
| route-level HTTP / browser proof | ⏳ owner step (below) |
| prod deploy of 0d3d82b | catching up (3 stacked merges; flag OFF = behavior-identical) |

## Enable (canary) — OWNER runs these
```
printf "1" | vercel env add OCR_FIELD_SAFETY_ENABLED production --force
# redeploy main so the new env reaches the running deployment
```
(Optionally enable in a preview deployment first and run the proof there before production.)

## Rollback — keep ready BEFORE enabling
```
vercel env rm OCR_FIELD_SAFETY_ENABLED production --yes
# redeploy main → behavior returns byte-identical (no data migration)
```
Rollback priority: roll back `OCR_FIELD_SAFETY_ENABLED` FIRST. Do NOT touch `ANTI_FABRICATION_GATE_ENABLED` /
`SELF_CONSISTENCY_GATE_ENABLED` unless they are the proven cause.

## Canary checks (after enabling) — one controlled run per flow, no PII in shared notes
1. `healthz` ok; prod sha == main.
2. **Translation**: upload a hard-case birth cert → expect `recognition_status=manual_required`, critical
   fields NOT finalized (candidate kept), `review_required=true`. NOT a silent "0 results / success".
3. **TPS**: upload a doc whose source ≠ the expected slot (or a legacy-read field) → critical field NOT final,
   candidate preserved, `manual_review_required=true`, reason includes source/legacy.
4. **PDF/payment**: with an unresolved critical field → PDF/payment **blocked**; an admin-only unresolved field
   does NOT block. Error carries field NAMES only, no values.
5. Confirm a CORRECTED/confirmed critical field then DOES allow PDF/payment (user can complete).
6. `vercel logs --since 1h`: no 5xx/error spike; no PII in logs.

## Stop conditions (rollback immediately)
- A critical field still appears as a FINAL value while unsafe (the exact harm the guard prevents).
- PDF/payment still allows an unresolved critical field.
- Admin fields over-blocked at a high rate (users can't proceed on safe data).
- 5xx spike; or a user cannot complete after manual correction; or PII appears in logs.

## What this guard does NOT do
Not a model-quality fix (the model still misreads hard-case UA — that's why these go to human review). Not
HTR, not a 2nd provider, not OneBrain. It is the containment that makes wrong/garbled reads safe
(candidate / manual / blocked) instead of silently final.

## After a stable canary
Keep the flag ON → then resume D0 prod decision → ReaderResult → OneBrain shadow (each its own gated step).
HTR / second provider remain gated on GT from different people + owner decision.
