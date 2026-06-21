# Numeric Accuracy Protocol — messenginfo

**Source of truth in code:** `apps/web/src/lib/translation/numericAccuracy/`.

---

## Core rule (v5 §10)

**Numbers are evidence.** They are never:
- inferred
- guessed
- "corrected by logic"
- copied from memory
- borrowed from another field

If a number cannot be read with confidence ≥ 0.85 AND verified by a
double-pass, it goes to `review_required=true` and blocks final render.

---

## 1. What counts as a number

For any document type:

- **Dates.** date_of_birth, date_of_issue, valid_until, marriage_date,
  registration_date, certificate_issue_date, etc.
- **Document identifiers.** passport_series + passport_number,
  certificate_number, act_record_number, court_decision_number,
  visa number, MRZ check digits.
- **Addresses with house/apartment numbers.** Street numbers and apt
  numbers are part of the address, but are validated like other numbers:
  no inference allowed.
- **Account / case numbers** if present.

## 2. Double-Pass Protocol

Every numeric field undergoes at least two independent passes:

```
visual_pass_1 — Google Vision OCR digit-by-digit
visual_pass_2 — DeepSeek text mapping verifies against raw_text
ocr_compare   — re-scan vs raw_value disagreement check
```

Tracked on `ExtractedField.passes` (added by v5 cycle).

If pass_1 ≠ pass_2 → `review_required=true`. The user sees both
candidates side-by-side and picks the correct one.

## 3. Digit Shape Comparator (v5 §12)

Within a single number, ambiguous shapes are flagged and re-checked:

| Pair | When to flag |
|---|---|
| 0 ↔ O ↔ Ø | OCR confidence < 0.95 on either |
| 1 ↔ I ↔ l | always (frequent OCR confusion) |
| 3 ↔ 8 | confidence < 0.92 |
| 5 ↔ 6 | confidence < 0.92 |
| 6 ↔ 9 | always |
| 7 ↔ Z | confidence < 0.95 |
| 4 ↔ A | always |
| 2 ↔ Z | always |

`numericAccuracy/digitShapeComparator.ts` returns the list of suspect
positions plus alternative candidates.

If any digit in the same sequence appears with both forms (e.g. a
number that contains both a confident "8" and a low-confidence "8"
that could also be "3"), `review_required=true`.

## 4. Date Zone Lock (v5 §11)

`numericAccuracy/dateFieldLockValidator.ts` enforces zone separation:

| Pair | Rule |
|---|---|
| date_of_birth, date_of_issue | must be in different zones, must be different values |
| date_of_issue, valid_until | must be different |
| date_of_birth, date_of_marriage | DOB strictly < marriage date |
| act_record_date, date_of_issue | birth/marriage cert: must be different |
| date_of_marriage, date_of_divorce | divorce cert: divorce > marriage |

## 5. Month Map Validator

`numericAccuracy/monthMapValidator.ts` resolves Ukrainian and Russian
genitive-case month names to canonical English:

```
Ukrainian: січня → January, лютого → February, ...
Russian:   января → January, февраля → February, ...
```

Refuses unknown month tokens. Returns `{ valid, monthName, monthIndex }`.
If `valid: false`, calling validator MUST set `review_required=true`.

## 6. Passport Perforation Validator

`numericAccuracy/passportPerforationValidator.ts` validates the legacy
booklet perforated identifier:

- length 8 (2 letters + 6 digits)
- letters from `[A-Z А-Я]` (Cyrillic series like КМ, СО are valid)
- digits from `[0-9]`
- if any digit is in the digit-shape ambiguity list AND OCR confidence
  < 0.92, mark `review_required=true`

## 7. What a Validator Returns

Every numeric validator returns:

```ts
type ValidatorResult = {
  ok: boolean
  field: string
  raw_value: string
  normalized_value: string
  passes: string[]                // which passes were run
  flags: Array<                   // triggered findings
    | { type: 'ambiguous_digit', position: number, candidates: string[] }
    | { type: 'zone_collision', other_field: string }
    | { type: 'unknown_month', token: string }
    | { type: 'length_mismatch', expected: number, got: number }
    | { type: 'low_confidence', threshold: number, got: number }
  >
  review_required: boolean
}
```

## 8. What MUST Block Final Render

- any numeric field with `review_required=true` that the user has not
  explicitly confirmed via the EvidenceReviewPage
- any zone-collision (DOB == DOI etc.)
- any unknown month token
- any length mismatch
- any digit-shape ambiguity flagged AND not user-confirmed

## 9. What is OK to Auto-Resolve

- Trim leading/trailing whitespace
- Convert "01" to "1" for day-of-month when EU format is used
  ("1 May 1990" not "01 May 1990")
- Map known glyph-to-digit (e.g. Ukrainian italic О-shape vs digit-zero)
  ONLY when both passes agree

## 10. What is NEVER OK to Auto-Resolve

- Picking between candidate digits when the two passes disagree
- "Correcting" 31 February to 28 February
- Inferring a missing digit from "what feels likely"
- Applying validation rules from one document type to another
  (e.g. assuming a marriage cert number must be 6 digits because birth
  cert numbers are 6 digits)
