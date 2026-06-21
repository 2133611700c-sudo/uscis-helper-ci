# OneBrain L2 — Scaffold (decideField implemented, NOT wired)

**Date:** 2026-06-04  **Type:** code scaffold behind-the-scenes; **prod byte-identical** (no live caller).

## What landed
- `apps/web/src/lib/docintel/oneBrain/decideField.ts` — pure `decideField(input) → FieldDecision`
  implementing the L1 contract (`ONEBRAIN_DECIDE_FIELD_CONTRACT.md`): value selection (reads / strong
  anchor), separate `normalized_value` (dictionary signal only), decision enum
  (accept / accept_low_confidence / force_review / reject), review reasons, source_trace, safety_flags,
  sha256 audit_hash. Types `FieldDecisionInput` / `FieldDecision` exported. `scoredForAccuracy()` helper.
- `oneBrain/__tests__/decideField.test.ts` — the binding rules.

## Byte-identical proof
`decideField` / `oneBrain` is imported by **no `/api` route and not by `documentFieldReader`** (grep:
`NO_LIVE_CALLER`). Nothing in production invokes it → prod behavior is byte-identical regardless of any
flag. The reserved flag `ONEBRAIN_DECIDE_FIELD_ENABLED` (default OFF) is documented for the future
L2-wiring step; it is read by nothing yet.

## Rules encoded (and tested)
1. Dictionary never overwrites `value` — value from reads/anchor; `normalized_value` is a separate field
   sourced only from the kmu55 signal; a dictionary `review_required` raises review but does not change value.
2. Critical + any review signal (dict-review / invalid validator / instability / low-confidence) → `force_review`;
   critical never goes `accept_low_confidence` without a strong anchor.
3. Self-consistency `mismatch`/`incomplete`/`insufficient_identity_fields` on a critical field → `force_review`
   + `safety_flags:[hard_case_model_instability]`; model high confidence cannot override.
4. `scoredForAccuracy()` returns true only for `owner_verified_field` AND not `candidate_not_verified`.
5. Not wired → no live caller → prod byte-identical. Plus: pure (same input → same audit_hash; input not mutated).
6. Strong anchor (e.g. MRZ) → `accept` even on critical (anchor controls that field).
7. No source → `reject`, value null, review_required, reason `no_source`. Value never blanked elsewhere.

## Evidence
typecheck PASS; `decideField.test.ts` + docintel suite = 83 tests pass. Synthetic test values only (no PII).

## Deferred (NOT in L2 scaffold)
- **Wiring** decideField into `readDocument`/routes behind the flag = a SEPARATE step (L2-wire), owner-gated,
  with a byte-identical shadow first.
- **Threshold numbers** (currently PLACEHOLDER `{critical:0.97, high:0.9, low:0.8}`) = L3, calibrated on the
  owner GT batch after the GT-language intent is set (value = as-written; normalized_value = canonical).
- Second independent reader (true consensus) / HTR / model switch = L4.
- consensus.ts untouched (dormant). SMART/HTR/model unchanged. No prod env, no flags enabled, no deploy.

## Note (pre-existing PII debt, NOT touched here)
`docs/architecture/DOCUMENT_INTELLIGENCE_LAYER.md` (+ a few arch docs) contain real PII example lines
(name/DOB/place) pre-existing in main — Session-54-class PII-sweep item in OWNER_QUEUE; not part of L2.
