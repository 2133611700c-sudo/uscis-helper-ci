# ADR-021 — Delegated Certifier Role & `certifier_override` Authority

Date: 2026-06-10
Status: **RULED v1 (owner 2026-06-10).** Q1/Q2/Q3 ruled; agent additions A/B/C accepted into the spec (matrix, anchor-id referent, signal dependency). `certifier_override` code (L0) may now be written against this — once.
Related: ONE_BRAIN_CYRILLIC_CONSTITUTION LAW 2#5 (tiered authority), ADR-019 (audit persistence), ADR-020 (HTR data-handling, future), CRITICAL_FIELDS_CONTRACT, C3_USER_CORRECTION_CONTRACT

## Context

LAW 2#5 made user-confirmation authority tiered by criticality. The certifier role is owner-only transitional. Before
`certifier_override` is written, scope / reason-codes / parents-scope must be fixed, or the code is rewritten when this
lands. This ADR fixes them.

## Q1 — RULING: THREE tiers (not two) — friction must scale with fraud risk

Collapsing applicant DOB and issuing-authority into one bucket would make the certifier block every Soviet-bilingual
doc over normal authority-spelling variance ("ВРАЦ" vs "ВЦАГС") — throughput dies. Three tiers:

```
TIER 1 — Applicant identity (HIGHEST friction)
  Fields per doc class:
    Passport/booklet: surname, given_name, patronymic, DOB, sex, nationality,
      document_number, place_of_birth, issue_date, expiration_date
    Birth cert (applicant as child): child_surname, child_given_name, child_DOB, child_place_of_birth
    Marriage cert (applicant as spouse): spouse_surname, spouse_given_name, spouse_DOB, marriage_date
    Military booklet: surname, given_name, DOB, document_number_series
    EAD: A_number, name, DOB, valid_from, valid_to, category
    I-94: admission_number, name, DOB
    I-797: receipt_number, applicant_name, applicant_DOB
  Authority: certifier_override REQUIRED. Friction HIGHEST — explicit reason_code + source side-by-side review.
  Anchor conflict (MRZ/EAD vs typed) → ALWAYS blocks override.

TIER 2 — Related-person identity + document validity (LOW friction)
  Fields per doc class:
    Birth cert: mother_full_name, father_full_name, certificate_number, issue_date, issuing_authority
    Marriage cert: certificate_number, issue_date, issuing_authority
    Military: rank_status (if in output), issuing_authority
    EAD/I-797: validity dates if not in TIER 1
  Authority: certifier_override REQUIRED. Friction LOW — source side-by-side, single-click source_verified, no written reason.
  Cross-document: records MUST carry cross_doc_anchor_id (see addition B) for future case-level reconciliation.

TIER 3 — Non-critical
  Fields: secondary witness names, registration office name (when not the issuing authority), notes/remarks,
    address components beyond city.
  Authority: user_confirmed MAY finalize. Audit: timestamp + session + IP. PDF metadata flag: yes.
```

Notes carried from the ruling: `patronymic` is its own field (NEVER "middle name"); `place_of_birth` is TIER 1
(USCIS checks it across forms); per-doc-class lists because A_number ≠ document_number ≠ receipt_number.

**Cross-dependency (agent-flagged):** TIER 1 `place_of_birth` routes through the gazetteer (snapCity), which is weak on
historical/pre-2020 names (LAW 6 gap) — so the gazetteer-history work directly REDUCES TIER 1 certifier load. Sequence
LAW 6 gazetteer history alongside this, or place_of_birth becomes the dominant certifier-override cost.

## Q2 — RULING: ENUM of 6 reason codes

```
reason_code ENUM:
  source_verified                  — certifier read the field directly from the source document
  source_corroborated_user_value   — certifier confirmed the user's value matches the source after review
                                     (distinct legal attribution from source_verified)
  user_clarified                   — user clarified, source unclear, certifier accepts (TIER 3 ONLY)
  dual_witness                     — two authorized certifiers independently confirmed (post-launch, high-stakes)
  unreadable_per_source            — field cannot be determined from source; STAYS NULL/review.
                                     A documented REFUSAL, NOT a finalization code.
  other_with_text                  — escape hatch; mandatory written reason; auto-flagged for audit review
```

### ADDITION A (agent, accepted) — tier × reason_code validity MATRIX
The ENUM alone lets a certifier mis-apply a code across tiers. Valid combinations:

| reason_code | TIER 1 | TIER 2 | TIER 3 |
|---|---|---|---|
| source_verified | ✓ | ✓ | ✓ |
| source_corroborated_user_value | ✓ | ✓ | ✓ |
| user_clarified | ✗ | ✗ | ✓ (T3 only) |
| dual_witness | ✓ (post-launch) | ✓ (post-launch) | — |
| unreadable_per_source | ✓ (→ stays null) | ✓ (→ stays null) | ✓ (→ stays null) |
| other_with_text | ✓ (flagged) | ✓ (flagged) | ✓ (flagged) |

Code MUST reject an out-of-matrix (code, tier) pair (e.g. `user_clarified` on a TIER 1 field) at the override entry point.

## Q3 — RULING: parents/spouses = CRITICAL (TIER 2) with low friction, + anchor id

Accepted as-is: parents/spouses require `certifier_override` (USCIS cross-validates parent names birth-cert↔name-change/
marriage; mismatch = auto fraud flag) but via the LOW-friction single-click `source_verified` path (TIER 2).

### ADDITION B (agent, accepted) — `cross_doc_anchor_id` referent
TIER 2 records MUST include `cross_doc_anchor_id` even though cross-document validation is not yet enforced — enabling
future case-level reconciliation without retrofit. **Referent (required so the id is not random):** `cross_doc_anchor_id`
keys on the **applicant case / person key** (the per-applicant identifier that links all documents in one filing), so a
birth-cert `father_full_name` and a later marriage-cert `spouse` of the same case can be reconciled. Undefined referent = unusable id.

## Audit hook (LOCKED — written from commit 1, per owner point 4)

Every `certifier_override` emits this from the first commit (destination may be a log file until ADR-019 persistence
lands; SCHEMA + HOOK ship with commit 1 — never retrofit):

```
reason_code          // the 6-code ENUM above
tier                 // 1 | 2 | 3  (validates the code per ADDITION A)
field_name
document_class
previous_value       // null | candidate
new_value
certifier_id         // owner_id transitionally
timestamp_utc
session_id
linked_pdf_doc_id    // if applicable
cross_doc_anchor_id  // applicant case/person key (ADDITION B); required for TIER 2, recommended for TIER 1
immutable_marker
```

Anchor rule (LAW 2#5): a cross-document anchor (MRZ/EAD) ALWAYS overrides `user_confirmed` on critical identity; a
`user_confirmed` ↔ anchor conflict → **block + escalate**, never override (passport TARAS vs user OLEKSANDR → block).

## Consequences

- `certifier_override` (L0) is now unblocked and written ONCE against this spec.
- Owner-only certifier is transitional; a delegated multi-operator certifier role (identity on the certification line,
  `dual_witness`) is a FUTURE extension of this ADR.
- The audit schema (incl. `tier`, `cross_doc_anchor_id`) is frozen now so the hook is correct from commit 1.
- The tier×reason_code matrix (ADDITION A) is enforced in code, not just documented.
