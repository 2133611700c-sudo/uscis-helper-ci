# OneBrain L3 — GT batch + threshold calibration plan (docs only)

**Date:** 2026-06-04. Goal: define what GT to gather and how to turn it into calibrated
`decideField` thresholds, BEFORE any L2-WIRE. No runtime change; no flags; no model/HTR/SMART; no prod.

## 1. GT batch requirements

- **6–10 documents minimum; different people where possible** (current N=2/one-person = signal, not proof).
- Categories (label each GT file's `_meta.document_class`):
  - (a) Soviet / Russian-language birth cert
  - (b) Ukrainian PRINTED birth cert
  - (c) Ukrainian HANDWRITTEN birth cert
  - (d) passport / ID card
  - (e) EAD
  - (f) I-94
- Per file: `_meta.ground_truth_status = VERIFIED_BY_OWNER`, `_meta.owner_verified_fields = [...]`,
  `_meta.verified_scope` describing what is penalized. Everything else = `candidate_not_verified`.
- `value` = as-written (GT_LANGUAGE_INTENT.md); unreadable → `null` + note. Filled files stay in
  `qa-private/` (gitignored). Empty PII-free templates are versioned under `docs/templates/ground-truth/`.

## 2. Field criticality (drives decideField thresholds)

- **critical (identity):** family_name, given_name, patronymic/middle_name, date_of_birth,
  place_of_birth, issuing_authority (when identity/origin-relevant).
- **high:** document numbers (passport_number, doc_number, act_record_number), issue/expiry dates.
- **low:** free text, seals, notes.

## 3. Signal → decision policy (what to calibrate)

**Always force_review (never auto-accept), regardless of model confidence:**
- self_consistency ∈ {mismatch, incomplete, insufficient_identity_fields} on a critical field
- validator status = invalid on a critical field
- hard-case document class with no strong anchor (handwritten/soviet birth) on identity
- dictionary `review_required=true` on a critical field (e.g. fuzzy/unknown place)

**Lower confidence only (may still accept / accept_low_confidence):**
- soft quality warning (mild blur) without instability
- dictionary `matched=false` with no review flag (passthrough)
- low reader confidence on a non-critical field

**Strong anchor (MRZ/I-94/EAD/I-797) → accept the anchored field** (suppresses the blanket hard-case force
on that field only).

## 4. Metrics required BEFORE any canary

- `false_negative_review` (wrong value, review=false) — MUST be 0 on the gate path. **Dangerous metric.**
- `false_positive_review` (correct value, review=true) — UX cost; track, weigh.
- DOB / name / place mismatch caught vs missed (per the proven test-case).
- `review_rate_by_doc_type` — how much each category goes to review (drives the HTR decision later).
- `missing_rate_by_field` — fields the reader never produces.
- `model_disagreement_rate` (LATER, when a 2nd independent reader exists — true consensus).

## 5. Calibration procedure (when GT batch ready)

1. Run the accuracy harness (modes A/B/C × models) over the expanded batch, scoring ONLY
   `owner_verified_fields`, `value` vs raw layer (as-written).
2. Tune `ACCEPT_THRESHOLD[criticality]` (currently PLACEHOLDER {critical:0.97, high:0.9, low:0.8}) so that
   `false_negative_review = 0` while minimizing `false_positive_review`.
3. Record the chosen numbers + the metric table in `ACCURACY_OFFON_RESULTS.md` (sanitized).
4. Only then consider L2-WIRE (shadow-first) and a flag canary.

## 6. Templates (versioned, PII-free)

`docs/templates/ground-truth/`: existing — `birth_cert_soviet`, `birth_cert_handwritten`, `military_id_p1`.
Added in L3 — `birth_cert_ua_printed`, `international_passport`, `id_card`.
EAD / I-94 templates: **TBD** — their fields come from the EAD/Re-Parole adapters (a_number, ead_category,
i94_admission_number, …), not the UA docintel registry; define when those docs enter the batch (avoids
inventing field names now). Owner copies a template to `qa-private/ground-truth/` and fills `value` as-written.

## 7. Restrictions honored
docs + GT workflow only; no decideField wiring; no /api change; no flag enabled; no model/SMART/HTR; no
prod env; no deploy; no PII in docs; filled GT stays in qa-private (gitignored).
