# C3 — Wire Global OCR Field Safety Gate into live flows (behind OFF flag)

**Date:** 2026-06-06. Wires the proven guard (PR #95) into product flows behind `OCR_FIELD_SAFETY_ENABLED`
(default OFF). **OFF ⇒ byte-identical prod.** No prod flag enabled. No model/provider/HTR/OneBrain/SMART change.

## Done in this increment
- **Wiring helper** `apps/web/src/lib/documentSafety/applyOcrFieldSafety.ts`:
  - `classifyCriticality(fieldName)` → critical_identity / critical_document / admin / optional.
  - `isOcrFieldSafetyEnabled()` (flag, default OFF).
  - `applyOcrFieldSafety(fields, ctx, {zeroRecognition})` → runs each field through `protectOcrField`; an unsafe
    critical field is moved to `candidate_value` (value→null) and flagged `review_required` + `manual_required`,
    never shown as the final value. Input is never mutated. Returns `anyUnresolvedCritical`.
- **Wired flow #1 — Translation public** (`/api/translation/vision-extract`): a guarded block before the
  response. OFF ⇒ skipped (byte-identical). ON ⇒ unsafe critical reads (hard-case, source/stale mismatch, low
  conf, zero recognition) become candidate-only + review/manual; response carries `ocr_field_safety`.

## Tests — RED→GREEN
- `ocrFieldSafetyGate.test.ts` (18) + `applyOcrFieldSafety.test.ts` (10): classify; flag default OFF; hard-case
  → candidate-only (value→null, candidate kept, manual_required); source mismatch → not final; legacy reader →
  candidate; zero recognition → manual; admin safe → stays; input not mutated; PII-free output.
- The guard's `manual_required` was corrected (contract 2.5): candidate_only ALSO sets manual_required (the
  human must confirm/correct), only `accept_final` leaves it false.
- **Evidence:** tsc 0 errors; documentSafety 28/28; **full web suite 2903 passed / 4 skipped** — flag OFF =
  vision-extract byte-identical, zero regression.

## All 4 flows wired (C3 COMPLETE, behind OFF flag)
1. Translation public (`vision-extract`) — guard applied to fields. ✅
2. TPS merge (`tps/ocr/extract`) — `mergedModule.fields` guarded before response; legacy reads (non-Core) treated untrusted; normalized_value→null for unsafe critical, raw_value kept as candidate, manual_review_required set. ✅
3. Legacy OCR boundary (`/api/ocr/extract`) — response annotated `legacy_reader/critical_fields_candidate_only` so consumers never auto-finalize. ✅
4. PDF/payment (`generate-pdf`) — unified critical gate via `hasUnresolvedCriticalForOutput` (blocks only CRITICAL unresolved; admin passes); complements the existing reviewGate. ✅
All behind `OCR_FIELD_SAFETY_ENABLED` (OFF). Wired one flow at a time, full suite green after each. Flag OFF = zero prod impact.

## Flag-ON local proof (logic-level; route HTTP/browser = owner canary)
`c3FlowSafety.proof.test.ts` — with OCR_FIELD_SAFETY_ENABLED=1, proves per wired flow: Translation hard-case → candidate-only+manual; zero-recognition → manual (not success); TPS legacy/source-mismatch critical → not final; legacy boundary critical → candidate, admin passes; PDF gate blocks unresolved critical, admin passes. documentSafety 38 tests; full suite 2913 passed. Route-level HTTP/browser proof = owner canary step.

## Guardrails
No prod env/flag change; `OCR_FIELD_SAFETY_ENABLED` unset in prod; no model/provider/HTR/OneBrain/ReaderResult/
SMART; no PII (guard is PII-free by construction); qa-private=0.

## Status
PASS for this increment (guard wired into the incident-primary Translation path, flag-gated, tested, byte-identical
OFF). Full C3 = PASS after sub-increments 2–4. D0 prod / ReaderResult / OneBrain stay HELD until C3 complete +
owner enables the flag after a browser proof.
