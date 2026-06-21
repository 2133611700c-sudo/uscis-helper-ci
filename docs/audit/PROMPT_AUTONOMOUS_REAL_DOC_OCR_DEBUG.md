# Autonomous Real-Document OCR Debug — Professional Agent Prompt

## Goal

Take the user's ORIGINAL passport, I-94, and driver's license images,
push them through Messenginfo's production TPS OCR pipeline yourself
(curl, no UI clicks), compare every extracted field against the
ground truth visible on the original image, find every bug in
OCR/parser/firewall/UI/PDF layer, fix the code, prove the fix with
shape-only redacted evidence, and iterate until all critical fields
extract correctly. **Do not ask the user to click anything. Do not
verify the user's records on CBP/USCIS websites — they are only
sources of FORM RULES, not validators of his identity.**

## Hard rules

- The agent uses the user's documents ONLY to test our OCR, never
  echoes raw values in committed artifacts.
- Evidence files contain field KEYS / response SHAPES / lengths /
  diff classifications — no surnames, no DOBs, no document numbers,
  no addresses.
- Government websites (CBP, USCIS) are consulted only for FORM
  field-map rules. Not for personal data verification.
- No PASS unless the live OCR response on the user's actual file
  contains the expected field keys with reasonable values when
  cross-checked against what the agent can SEE on the original image.
- If a fix touches code, full gates must pass before push:
  pnpm --filter web run typecheck / lint / guard / build.
- Real document images are written to `qa-shots/private/` which is
  in `.gitignore`. They are NEVER committed.

## File inputs the agent expects

The user provides three files. The agent must verify they exist
before any test:

```
qa-shots/private/sergii_passport.jpg
qa-shots/private/sergii_i94.png
qa-shots/private/sergii_dl.jpg
```

If any is missing, the agent reports the missing path and stops
that document's matrix line — no synthetic substitution.

## Ground truth per file

The agent extracts ground truth by READING the original image visually
(it can see images in context). It writes the ground truth into
`docs/audit/REAL_DOC_GROUND_TRUTH.local.yaml` which is gitignored.
That file is the comparison reference.

For each document the truth captures only the field KEYS and a
SHAPE hash (e.g. "8 chars uppercase letters+digits") — not values.
Example shape entries:

```yaml
passport:
  family_name: { shape: "10 uppercase letters", first_char: "K", last_char: "K" }
  given_name:  { shape: "6 uppercase letters",  first_char: "S", last_char: "I" }
  dob:         { shape: "MM/DD/YYYY",            decade: 1980 }
  passport_number: { shape: "2 letters + 6 digits", prefix: "FG" }
  mrz_present: true
```

This lets the agent verify correctness without echoing PII.

## Test loop per document

```
for doc in [passport, i94, dl]:
    1. POST to https://messenginfo.com/api/tps/ocr/extract
       with file=@<path> and docHint=<slot>
    2. Capture response, write shape-only summary to
       docs/audit/T3PS_REAL_DOC_TEST_<doc>.yaml:
         vision_text_length
         brain_status / brain_error_code
         module_field_count / module_field_keys
         final_field_keys
         rejected_fields (full, with reason)
         For each extracted field: { source, shape_of_value,
           matches_ground_truth: bool, mismatch_reason? }
    3. If mismatch_reason exists for any CRITICAL field, agent
       reads relevant code (e.g. lib/tps/modules/passport.ts,
       lib/tps/ai/documentBrain.ts, lib/tps/ocr/documentContracts.ts)
       and proposes a code-level fix.
    4. Apply fix, run tsc on the touched file, commit + push.
    5. Wait for Vercel deploy READY.
    6. Re-run the OCR for that document. Repeat until matches.
```

Critical fields per slot:

- passport: family_name, given_name, dob, sex, passport_number,
  passport_country_of_issuance, country_of_nationality
- i94:      i94_admission_number, last_entry_date,
            i94_class_of_admission
- dl:       us_address_street, us_address_city, us_address_state,
            us_address_zip

The full matrix passes only when every critical field on every
document either matches ground truth, or is correctly reported as
`requires_review: true` with a reason the user can understand.

## Iteration cap and stop conditions

- Maximum 4 fix iterations per document. After 4 unsuccessful
  iterations on the same field, stop and write a
  `BLOCKED` row in the report with the actual Vision raw_text shape
  and the Brain output shape so a human can decide.
- If Vision returns < 30 chars on a 1500px+ image, that's an
  image-quality block, not a code bug — report and stop that doc.
- If `brain_ready: false` on /api/tps/health, stop everything and
  surface env config issue.

## What gets committed vs what stays local

Committed:
- Code fixes
- `docs/audit/T3PS_REAL_DOC_TEST_*.yaml` (shape-only)
- `docs/audit/T3PS_REAL_DOC_FINAL_VERDICT.md`

NEVER committed:
- The image files themselves
- `REAL_DOC_GROUND_TRUTH.local.yaml`
- Any file under `qa-shots/private/`

`.gitignore` is updated to enforce this if not already.

## Final verdict format

`docs/audit/T3PS_REAL_DOC_FINAL_VERDICT.md` contains:

```
Status: GO | PARTIAL | BLOCKED
Sha that was tested: <git rev>
Per-document table:
  passport: PASS/FAIL/PARTIAL — N/M critical fields matched
  i94:      ...
  dl:       ...
Code fixes applied this run:
  - <commit sha> — <one line>
Image-level issues that no code can solve:
  - <doc>: <issue>
Carryover bugs for next session:
  - ...
```

## Why the agent does not click in the UI

The browser-based wizard adds nothing on top of the API call for
debugging purposes — the same /api/tps/ocr/extract endpoint serves
both. Going through the UI would slow each iteration to manual
clicks. The API path is identical, faster, and reproducible.

The UI is tested separately (`qa-shots/r1a-*.png` Playwright runs)
once the OCR pipeline is verified at the API layer.
