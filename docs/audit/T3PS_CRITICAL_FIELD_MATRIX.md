# T3PS Critical Field Matrix

Generated: 2026-05-14T07:59:41.328841Z
Commit: ref: refs/heads/main

## Coverage counts
- I-821 total PDF fields: 511
- I-821 mapped valid fields: 85
- I-821 unmapped fields: 426
- I-765 total PDF fields: 180
- I-765 mapped valid fields: 47
- I-765 unmapped fields: 133

## I-821 key semantics
- family_name: auto_from_ocr
- given_name: auto_from_ocr
- DOB: auto_from_ocr
- TPS country: visible_confirmed_default
- marital_status: visible_manual_input
- A-number: collected_but_not_mapped_or_not_provided
- I-94: collected_but_not_mapped_or_not_provided
- passport_number: mapped_but_not_verified
- Part 7 yes/no: visible_manual_input + mapped_but_not_fully_verified

## I-765 key semantics
- application_type: visible_confirmed_default
- family_name: auto_from_ocr
- A-number: mapped_but_not_verified
- DOB: auto_from_ocr
- I-94: auto_from_ocr
- status_at_last_entry: visible_manual_input/auto
- eligibility category a12/c19: visible_confirmed_default
- phone/email: visible_manual_input

## Field class caveat
- Spouse/children/interpreter/preparer/signature areas remain largely `manual_only` or `not_collected` in current TPS draft flow.
