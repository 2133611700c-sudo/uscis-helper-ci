# CRITICAL FIELDS CONTRACT (P0 design lock)

Date: 2026-06-10
Status: LOCKED v1 (code-reconciled). Owner may extend per document class.
Backs: `classifyCriticality()` in `apps/web/src/lib/documentSafety/applyOcrFieldSafety.ts`,
`validateConfirmedValue()` in `confirmedValueGuard.ts`, the C3 output gate, and the
GT benchmark exit criteria.

## Why this exists

A "critical" field is one where a wrong or missing value in a CERTIFIED English
translation is a legal/identity defect, not a cosmetic one. C3 and the
confirmed-value guard MUST agree on exactly which fields are critical — otherwise
one layer blocks the wrong things and another lets a dangerous value through. This
is the single authoritative list.

Two tiers:
- **critical_identity** — names, vital facts, sex, nationality, validity dates.
- **critical_document** — the numbers/authorities/categories that identify the document itself.

Behavior bound to "critical":
- confirmed-value guard failure on a critical field → **403 block** (never silently nulled).
- C3 critical field with `finalValue=null` → **block PDF/payment** (Phase 3 + ADR-017).
- GT benchmark: critical fields carry the highest accuracy bar (see GT_BENCHMARK_EXIT_CRITERIA.md).

## Per document class

### Passport / internal-passport booklet
critical_identity: family_name, given_name, patronymic, date_of_birth, sex, citizenship/nationality
critical_document: passport_number / document_number, issue_date, expiration_date

### Birth certificate
critical_identity: child_family_name, child_given_name, child_patronymic, date_of_birth, place_of_birth, mother_full_name, father_full_name
critical_document: act_record_number / certificate_number, issue_date, issuing_authority

### Marriage certificate
critical_identity: spouse_1_full_name, spouse_2_full_name, marriage_date, place_of_marriage
critical_document: certificate_number, issue_date, issuing_authority

### Military booklet
critical_identity: family_name, given_name, patronymic, date_of_birth
critical_document: military_id_number / series_number, issuing_authority

### EAD / I-94 / I-797 (Latin US forms)
critical_identity: family_name, given_name, date_of_birth
critical_document: a_number, i94_admission_number, ead_category / class_of_admission, valid_from, valid_to

## Code reconciliation status (2026-06-10)

`classifyCriticality()` was extended this session to cover the dates, authorities,
and categories above (previously they fell through to `optional` — a real gap).
Verified: tsc 0, full suite green (3011 passed).

Substring-match note: classification is by case-insensitive substring, so
`country_of_nationality` matches `nationality`, `passport_expiration_date` matches
`expiration_date`, etc. New field names that should be critical must contain one of
the listed tokens OR be added explicitly.

## [OWNER DECISION] open points

1. Military "rank/status" — critical only if it appears in the translated output. Currently NOT listed. Owner to confirm whether rank is rendered and thus must be critical.
2. "place_of_birth" granularity — city vs oblast vs raw. Today all `place_*` variants are critical_identity. Owner to confirm this is desired (vs. only city being critical).
3. Whether `issue_date` on a non-expiring document (e.g. birth cert) should block or only review.
