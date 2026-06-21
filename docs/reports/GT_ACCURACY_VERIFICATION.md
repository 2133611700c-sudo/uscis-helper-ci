# GT Accuracy Verification — CONTRACT / skeleton (results pending owner GT)

**Date:** 2026-06-04  **Status:** awaiting owner-filled ground truth. NO results yet.
This file fixes the COMPARISON CONTRACT so the future accuracy run compares the right
pairs and does not report false misses from a schema mismatch. NO code, NO prod env,
NO behavior flags, NO GT values here (PII).

## Why a contract is needed

The GT JSON schema (what the owner fills) and the field ids `readDocument` emits are
DIFFERENT vocabularies. Without an explicit map, an accuracy run would compare
`family_name_cyrillic` (GT) against nothing and report "all wrong" — a false negative.
Both birth-cert images use `docTypeId = ua_birth_certificate`, so ONE map covers
`birth_cert_soviet` and `birth_cert_handwritten`.

## Comparison map (GT key → read field id + layer)

`read` = a field in `DocumentReadResult.fields`. Cyrillic layer = `raw_cyrillic`;
Latin/normalized layer = `value` (KMU-55 / ISO date).

| GT key | read field id | layer | normalize for compare |
|---|---|---|---|
| `family_name_cyrillic` | `child_family_name` | raw_cyrillic | trim/NFC/lower/apostrophe |
| `family_name_latin` | `child_family_name` | value | case-insensitive |
| `given_name_cyrillic` | `child_given_name` | raw_cyrillic | as above |
| `given_name_latin` | `child_given_name` | value | case-insensitive |
| `patronymic_cyrillic` | `child_patronymic` | raw_cyrillic | as above |
| `patronymic_latin` | `child_patronymic` | value | case-insensitive |
| `date_of_birth` | `dob` | value | ISO `YYYY-MM-DD` |
| `place_of_birth_raw` | `place_of_birth_city` | raw_cyrillic | as above |
| `place_of_birth_english` | `place_of_birth_city` | value | case-insensitive |
| `issuing_authority_raw` | `issuing_authority` | raw_cyrillic | as above |
| `issuing_authority_english` | `issuing_authority` | value | case-insensitive |
| `issue_date` | `date_of_issue` | value | ISO |
| `act_record_number` | `act_record_number` | value | digits only |

## N/A — fields that CANNOT be scored on birth cert (do NOT count as false-negative)

- `sex` — the `ua_birth_certificate` spec emits NO sex field → **N/A**.
- `province` — no separate oblast field in the birth-cert spec → **N/A**.
- `passport_number`, `expiry_date`, `military_id_number` — GT template is a generic
  superset; not birth-cert fields → **N/A**.
- `father_full_name` / `mother_full_name` — `readDocument` EMITS these, but the GT
  template has no parent fields → cannot score until GT adds them → **N/A (GT gap)**.

## GT value rules (owner)

- `ground_truth_status: VERIFIED_BY_OWNER` required for the run to score the file.
- Unreadable field → `null` + a note in `notes` ("нечитаемо на скане"). A null is valid
  GT, not a failure; the field is excluded from accuracy denominators.

## Run matrix (local, when GT is VERIFIED)

- baseline (all behavior flags OFF)
- ANTI_FABRICATION_GATE_ENABLED=1
- ANTI_FABRICATION + SELF_CONSISTENCY (N=2/3)
- SMART_NORMALIZE_ENABLED stays OFF unless separately authorized.

## Metrics to report (per field, then aggregate)

- accuracy: read value vs GT (mapped + normalized) → correct / wrong / N/A / not-read.
- review_delta: identity fields forced to review by each flag config.
- false_positive_review: GT-correct field that the gate forced to review (UX cost).
- false_negative_review: GT-wrong field that was NOT flagged for review (the dangerous miss).
- instability_detected: self_consistency status (agree/mismatch/...).
- PII: report counts/verdicts only; NO GT or read values in the public report; raw → qa-private.

## Honest framing

- Accuracy is measured ONLY against owner GT (human transcription) — never against another
  model read (that would be the model checking itself).
- self_consistency `agree` is NOT correctness — only GT decides correctness.
- The dangerous metric is **false_negative_review** (wrong value, not flagged): that is what
  the gate exists to prevent. false_positive_review is a UX cost to weigh, not a safety failure.

## Status

PENDING — owner fills `qa-private/ground-truth/birth_cert_soviet_*.json` and
`birth_cert_handwritten_*.json` (`VERIFIED_BY_OWNER`). Then the local accuracy run fills the
Results section below. No behavior flags in prod; no prod env; no push.

## Results

Done 2026-06-04 — see `docs/reports/ACCURACY_OFFON_RESULTS.md` (sanitized) + `SMART_NORMALIZE_DECISION.md`.
Headline: mode C (anti-fab + self-consistency) → false_negative_review=0 in all 12 cells; SMART_NORMALIZE no accuracy gain; DOB month-mismatch caught by the gate, missed without it. N=2/one-person + RU-doc-vs-UA-GT caveat → signal, not prod-grade proof.
