# T3PS — Autonomous Real-Document OCR Test — Final Verdict

**Status:** GO_4_OF_4_PASS
**SHA tested:** `abbc3ff` (production, deploy `dpl_8C6dYn8ahmJydo6qo6G4t55yrmaJ`, READY at 2026-05-20)
**Protocol:** `docs/audit/PROMPT_AUTONOMOUS_REAL_DOC_OCR_DEBUG.md`
**Files under test:** 4 real documents from the user (in `qa-shots/private/`, gitignored)

## Per-document table

| Doc | Critical fields matched | Status | Pre-fix | Post-fix |
|---|---|---|---|---|
| passport | 7 of 7 | PASS | 7/7 (already worked) | 7/7 (no regression) |
| dl | 4 of 4 | PASS | 0/4 (slot useless) | 4/4 (+ 8 bonus biometric fields) |
| i94 | 3 of 3 | PASS | 1/3 (admit_until rejected, last_entry_date missing) | 3/3 (+ 5 bonus identity fields) |
| ead | 7 of 7 | PASS | 7/7 but country_of_birth rejected | 7/7 + country_of_birth surfaced |

## Code fixes applied this run

1. `c4c8cea` `fix(tps-ocr): real-doc audit — DL address, I-94 admit_until, EAD country_of_birth`
   - `documentBrain.ts`: added 8 keys to Zod schema + SYSTEM_PROMPT (us_address_street/city/state/zip, height, weight, eye_color, hair_color) + i94_admit_until + us_drivers_license document_type + dedicated DL rule block (items 15–20)
   - `documentContracts.ts`: i94 allowed_fields += [i94_admit_until, country_of_nationality]; ead allowed_fields += country_of_birth (same for ead_old)
   - `modules/i94.ts`: added yyyyMonthDdToUs() + anyDateToUs(); both last_entry_date and admit_until regexes now accept both MM/DD/YYYY and "YYYY Month DD" (CBP web printout format)

2. `abbc3ff` `fix(tps-ocr): bump Brain threshold to <5 + scrub PII example from DL prompt`
   - `route.ts`: Brain gate changed from `ruleFieldsCount < 3` to `< 5`. After the I-94 rule module learned new date formats it started returning 3 fields by itself, which would have permanently skipped Brain (losing name/admission_number). Bumping to 5 keeps Brain off only when passport rule hits its full 8-field MRZ extraction.
   - `documentBrain.ts`: removed the user's actual residential address from the DL example in SYSTEM_PROMPT. Replaced with a fully synthetic "123 Any Street Name Apt 4 / Anytown, CA 90000" that still teaches Brain the address-line split rule.

3. `5010c28` `fix(guards): drop hardcoded $1,020 parole fee — point to USCIS fee calculator`
   - Earlier `de11c38` (re-parole prototype port) shipped the literal `$1,020` parole fee in 4 wizard locale strings and 1 route.ts comment. The GH Actions `Content & Brand Guards / Forbidden patterns + typecheck + build` job was failing fast (~21–44s) on the first grep step (`\$580|\$630|\$1[,]?0[02]0`). Replaced all 5 with the substantive warning + uscis.gov/feecalculator link.

## Bugs found vs bugs introduced

Bugs found by this audit:
- DL slot was useless in production (silent — no rejected_field error, just 4 missing fields)
- I-94 contract rejected the single most important I-94 field (admit_until)
- I-94 rule module couldn't read CBP's "YYYY Month DD" date format
- EAD contract rejected country_of_birth (cosmetic — passport is identity-authoritative anyway)
- Hardcoded $1,020 fee in re-parole UI (existed since de11c38, breaking GH Actions guards)

Bugs I temporarily introduced and then closed in the same session:
- I-94 regression (Brain stopped running after rule module returned 3 fields) — closed by Brain threshold bump
- PII leak in SYSTEM_PROMPT (user's home address as example) — closed by replacing with synthetic example
- DL HTTP 500 (transient on first run after deploy) — did not reproduce; tracked as monitor-only

## Image-level issues that no code can solve

- Passport TD3 MRZ has `td3_parsed_with_check_failures` — single-character OCR misread on line 2 check digits. The MRZ-anchor override in `route.ts` (commit `9d11aad`) pulls name + given Latin directly from line 1, so this does not affect identity fields. Worth a future iteration but not blocking.

## Carryover bugs for next session

- The transient DL 500 was observed once and never reproduced. If it recurs, look at Lambda cold-start + DeepSeek timeout interaction.
- Brain extracts but doesn't yet pass the DL biometric fields (height/weight/eye_color/hair_color) through to the I-131 Part 3 PDF prefill. The contract allows them; the wizard mergedFields + packetBuilder still need to surface them.
- The DL address split correctness was verified by string-length match against private ground truth. A schema-level "splits exactly into 4 parts that recombine into the original" assertion would be a sturdier guard.

## Why this is GO

All 4 documents extract every critical field defined in the audit protocol's per-slot spec. The slot firewall reports 0 rejections across the matrix. Brain is classifying every document correctly with confidence ≥ 0.95. No PII reaches `docs/audit/` — all evidence is shape-only (field keys, value lengths, source labels, match booleans). Code changes are all behind production deploys that show READY state on Vercel. The GH Actions guard regression that surfaced mid-session was traced to pre-existing code (re-parole port from earlier) and fixed in the same series of commits.

The user's actual document images live in `qa-shots/private/` (gitignored, never committed).
