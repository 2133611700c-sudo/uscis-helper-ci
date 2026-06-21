# Ground-Truth Fill Guide (owner — human transcription, NOT model output)

**Why only you can do this:** ground-truth = the TRUE values, read by a human from the
physical/scanned document. It is the thing that breaks the "model checks itself" loop. It must
NOT be filled from any model/OCR output (on these docs the model returns a different person each
run). An agent filling it would be fabrication.

## Files to open (local, gitignored — never committed)

- `qa-private/ground-truth/birth_cert_soviet_<surname>.json`  (image: `test-fixtures/real-docs/birth_cert_soviet_<surname>.jpg`)
- `qa-private/ground-truth/birth_cert_handwritten_<surname>.json`  (image: `test-fixtures/real-docs/birth_cert_handwritten_<surname>.jpg`)

Open each JSON beside its image and type what YOU read on the document.

## Fields to fill (minimum)

| key | what to type |
|---|---|
| `family_name_cyrillic` | surname exactly as on the document (Cyrillic) |
| `given_name_cyrillic` | given name (Cyrillic) |
| `patronymic_cyrillic` | patronymic (Cyrillic) |
| `date_of_birth` | **`YYYY-MM-DD`** |
| `sex` | `M` or `F` |
| `place_of_birth_raw` | place of birth exactly as written (Cyrillic, incl. с./смт/м. prefix) |
| `issuing_authority_raw` | issuing body exactly as written (Cyrillic) |
| `issue_date` | **`YYYY-MM-DD`** |
| `act_record_number` | act record № (digits) |
| (optional) `*_latin`, `*_english` | only if you want to pin the expected Latin/English too |

## Rules

- **Unreadable field → `null`** (not a guess) + add a line in `notes` (e.g. `"place: нечитаемо на скане"`). A `null` is correct GT, not a failure — that field is excluded from the accuracy denominator.
- Date format strictly `YYYY-MM-DD`.
- When done, set:  `"ground_truth_status": "VERIFIED_BY_OWNER"`
- Do **not** commit the filled files — `qa-private/` is gitignored (PII).

## After you fill both

Tell the agent: "GT filled". It will then (local only, no prod, no PII in public report):
- confirm `VERIFIED_BY_OWNER` + non-empty counts (no values printed),
- run baseline OFF / ANTI_FABRICATION ON / +SELF_CONSISTENCY ON,
- compare to GT via the map in `GT_ACCURACY_VERIFICATION.md` (GT key → read field id),
- report accuracy, review_delta, **false_negative_review** (the dangerous metric), instability,
- write results into `GT_ACCURACY_VERIFICATION.md` (sanitized), raw into `qa-private/reports/gt-accuracy/`.

`sex`/`province`/passport/military fields are N/A on birth certs (the spec emits no such field) —
leave or fill, they won't be scored.
