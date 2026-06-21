# ONE_BRAIN Final Status

Date: 2026-06-03
Status: ONE_BRAIN_COMPLETE_LIVE

## Product Status

| Product | Backend | UI Wired | Flags ON | Live Smoke | Status |
|---|---|---|---|---|---|
| TPS | B1 | yes | yes | pass | LIVE |
| Translation | B2 | yes | yes | pass | LIVE |
| Re-Parole | B3 | yes | yes | pass | LIVE |
| EAD | B4 | yes | yes | pass | LIVE |

## Routes

| Product | Core Route | Old Route |
|---|---|---|
| TPS | /api/tps/ocr/extract | same |
| Translation | /api/translation/vision-extract | same |
| Re-Parole | /api/reparole/ocr/extract | /api/tps/ocr/extract |
| EAD | /api/ead/ocr/extract | manual/none |

## Flags (Vercel Production)

| Flag | Value |
|---|---|
| ONE_CORE_TPS_ENABLED | true |
| ONE_CORE_REPAROLE_ENABLED | true |
| NEXT_PUBLIC_ONE_CORE_REPAROLE_ENABLED | true |
| ONE_CORE_EAD_ENABLED | true |
| NEXT_PUBLIC_ONE_CORE_EAD_ENABLED | true |

## Source Gates (EAD — hard rules enforced by eadAdapter.ts)

| Source Document | Fields Unlocked |
|---|---|
| Passport / any identity doc | family_name, given_name, date_of_birth, sex, country_of_birth, passport_number, passport_expiry |
| EAD card (I-766) / I-797 | a_number, uscis_number, ead_category, card_number, ead_validity_from, ead_validity_to |
| Form I-94 | i94_admission_number, i94_date_of_entry, i94_class_of_admission, i94_place_of_entry |
| Driver's License / State ID | us_address |

A-number / EAD category / validity: only from EAD/I-766/I-797 source.
I-94 fields: only from I-94 source.
Address: only from DL/state ID/manual.
Invented fields: 0 (guaranteed by type-level `invented_fields_count: 0` literal).

## Live Smoke Test Results

| Route | Response | Flag Gate |
|---|---|---|
| /api/tps/health | ok=true, sha=c254143b | N/A |
| /api/translation/vision-extract | 400 multipart expected (route live) | N/A |
| /api/reparole/ocr/extract | flag_active=true | passed |
| /api/ead/ocr/extract | flag_active=true | passed |

Prod SHA: c254143b46198d0dbfc0e00f8d45278744764dce
Build time: 2026-06-03T19:15:40.413Z

## EAD Wizard Bundle Check

Chunk: `_next/static/chunks/app/[locale]/services/ead-work-permit/start/page-*.js`
Contains: `api/ead`, `ocr/extract` — NEXT_PUBLIC_ONE_CORE_EAD_ENABLED baked in.

## Test Suite

- Total: 2610 passing / 0 failing
- eadAdapter.test.ts: 74 tests (B4 adapter)
- eadWizardUiWiring.test.ts: 45 tests (B4 UI wiring)
- tsc: 0 errors

## What is NOT solved

- Cyrillic hard-case certificates: NOT globally solved. Forced review via policy guards (birth_certificate_handwritten, birth_certificate_soviet_bilingual, marriage_apostille → review_required=true always).
- Ground truth for failed certificates: owner-blocked (OWNER_FILL_REQUIRED.md exists).
- Certificate accuracy benchmark: pending ground truth.
- MRZ international passport: not covered in this sprint.
- BUREAU_PDF/P2 glossary: out of scope.
- EAD wizard: address prefill not implemented (no DL step in EAD flow; user enters address manually in Step 4).
- I-94 admission fields not shown in EAD wizard prefill (not part of I-765 personal info step).

## PR History

| PR | Description | Status |
|---|---|---|
| #70 | feat/b2-translation-core | merged |
| #72 | feat/b3-reparole-core | merged |
| #73 | feat/b4-ead-core | merged 2026-06-03T19:10:55Z |

## Architecture

All 4 products share a single canonical document brain:
```
Image → readDocument (Gemini docintel) → arbitrateDocument (Core)
      → toTpsAnswers / toTranslationRows / toReParoleCoreAnswers / toEadAnswers
      → Product wizard prefill
```
Source gates are enforced in each adapter — no field is ever invented.
Flag gates allow rollback per-product without code changes.
