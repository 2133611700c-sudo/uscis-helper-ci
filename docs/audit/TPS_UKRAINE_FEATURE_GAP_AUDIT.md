# TPS Ukraine Feature Gap Audit

**Date:** 2026-05-13  
**Auditor:** Senior Engineering Auditor (Claude claude-sonnet-4-6)  
**Scope:** End-to-end pipeline: document upload → OCR extraction → wizard → PDF prefill → ZIP download  
**Verdict:** PARTIAL — core happy path works; 7 critical gaps prevent production-ready status

---

## 1. Executive Summary

**Verdict: PARTIAL**

The product promise is: *user uploads passport/I-94/EAD → OCR auto-fills I-821 + I-765 → user only corrects → downloads pre-filled PDF packet.*

This is **partially true**. The foundation is solid: PDF prefill works end-to-end, field names match the actual PDF, XFA stripping is correctly implemented, OCR modules for all three document types exist and are wired into the API route. The packetBuilder test suite is meaningful and currently passes.

However, critical gaps remain:

1. **I-821 is missing phone, email, and last-entry-date in the field map.** USCIS reviewers will see blank contact info on Part 8 (Page 11) and a blank last-entry date on Page 3. These are required fields.
2. **I-765 never fills the "Is mailing same as physical?" checkbox (Part2Line5_Checkbox) or the physical-address block (Pt2Line7).** When mailing = physical, the physical address section is blank.
3. **I-94 and EAD modules have zero unit tests.** A regex typo silently fails extraction with no alert.
4. **`ead_category_on_card` OCR field is extracted but never wired back to `ead_category` in `TPSAnswers`.** Re-registrants with C19 EAD can ship with wrong A12 category.
5. **`i94_admit_until` is extracted but never written to any TPSAnswers field or PDF.**
6. **`place_entry` (I-765 Page 3, "Place of Last Arrival into the US") is never mapped.**
7. **City of birth is hardcoded as `''` on both forms** — marked "not captured this cycle" but required by USCIS.

---

## 2. Repo Snapshot

```
git log --oneline -5:
1e33b98 fix(tps): scope signature warning to paper/mail filing; exclude document translations
24fc726 feat(tps): USCIS rule hardening — H.R.1 fees + signature deny rule + stale EAD cleanup
22f5011 feat(tps): service config + one-command Mac gate script + final report
bd1de54 a11y(tps): elder Ukrainian user accessibility floor (A11Y.1)
86cb059 docs(beta): DeepSeek Brain final session report

TPS-relevant source files:
apps/web/src/lib/tps/
  answers.ts, filingGuidance.ts, formIntegrity.ts, packetBuilder.ts,
  pdfPrefiller.ts, transliterate.ts, types.ts
  forms/i821FieldMap.ts, forms/i765FieldMap.ts
  modules/passport.ts, modules/passportBooklet.ts, modules/i94.ts, modules/ead.ts
  ai/documentBrain.ts
  __tests__/packetBuilder.test.ts, __tests__/formIntegrity.test.ts
  modules/__tests__/passport.test.ts
  ai/__tests__/documentBrain.test.ts

apps/web/src/app/api/tps/
  ocr/extract/route.ts
  generate-packet/route.ts

apps/web/src/app/[locale]/services/tps-ukraine/start/
  TPSWizard.tsx, GeneratePacketBlock.tsx

PDFs confirmed present:
  apps/web/public/uscis/tps/i-821.pdf  (511 AcroForm fields, edition 01/20/25)
  apps/web/public/uscis/tps/i-765.pdf  (180 AcroForm fields, edition 08/21/25)
  apps/web/public/uscis/tps/i-912.pdf  (present but never used)
```

---

## 3. OCR Pipeline — Per-Document Table

| document_type | module file | extracted_fields | wired_to_wizard | wired_to_pdf |
|---|---|---|---|---|
| passport (international TD3) | `modules/passport.ts` | family_name, given_name, passport_number, country_of_nationality, dob, sex, passport_expiration_date, passport_country_of_issuance | YES — via `ocrFields` → `applyPreExtracted` | YES — all 8 fields land in both I-821 and I-765 field maps |
| passport (internal booklet) | `modules/passportBooklet.ts` | family_name, given_name, middle_name, dob, passport_number, country_of_nationality, passport_country_of_issuance | YES — same path | PARTIAL — `passport_expiration_date` intentionally not emitted (booklet has no expiry); user must fill manually |
| I-94 | `modules/i94.ts` | i94_admission_number, i94_class_of_admission, last_entry_date, i94_admit_until | YES — `applyPreExtracted` maps `i94_class_of_admission → status_at_last_entry`, `last_entry_date`, `i94_admission_number` | PARTIAL — `i94_admit_until` extracted but never in `PersonalFields`, `TPSAnswers`, or any PDF field |
| EAD | `modules/ead.ts` | a_number, ead_category_on_card, ead_expiration_date, family_name, given_name | PARTIAL — `a_number` wired; `ead_category_on_card` extracted but NOT in `applyPreExtracted` fieldMap (GeneratePacketBlock.tsx:68); `ead_expiration_date` not in `TPSAnswers` | PARTIAL — `a_number` lands correctly in I-821 Part2_Item7 and I-765 Line7; `ead_category_on_card` silently discarded |

**OCR data flow:**
```
POST /api/tps/ocr/extract (route.ts)
  → preprocessImage → googleVisionProvider
  → runPassportModule | runI94Module | runEadModule  (based on doc_type_hint)
  → optional: runBrain (TPS_AI_BRAIN_ENABLED=1, default OFF)
  → returns TpsModuleResult { fields: TpsExtractedField[] }

TPSWizard.tsx (client):
  → DocumentUploadScreen (uploads, calls OCR API)
  → setOcrFields(result.fields)       (line 1020)
  → SelfReviewScreen (user reviews/edits)
  → ocrPhase='wizard'

GeneratePacketBlock.tsx (client):
  → useState with applyPreExtracted(base, preExtracted)  (line 387)
  → applyPreExtracted maps OCR fields → PersonalFields
  → POST /api/tps/generate-packet → buildPacket(TPSAnswers)
  → buildI821Ops + buildI765Ops → prefill → ZIP
```

**Gap in data flow:** `ead_category_on_card` is extracted by `runEadModule` (ead.ts:100) and returned in `TpsExtractedField[]`, but `applyPreExtracted` fieldMap (GeneratePacketBlock.tsx:68) does not include it, so it is silently dropped. A re-registrant who uploads their EAD card showing "C19" gets no auto-routing of the EAD category.

---

## 4. I-821 Field Coverage Table

PDF total: 511 fields. Mapped subset: ~34 ops (covering ~28 unique fields).

| field_name (PDF) | mapped | ocr_source | risk | notes |
|---|---|---|---|---|
| Part1_Item1_ApplicationType[0/1] | YES | filing_path | LOW | initial / re_registration checkboxes |
| Part1_TPScountry[0] | YES | hardcoded 'Ukraine' | LOW | |
| Part1_Item3_EADApp[0/1] | YES | wants_ead | LOW | |
| Part2_Item1_FamilyName[0] | YES | passport/booklet OCR | LOW | Page01 |
| Part2_Item1_GivenName[0] | YES | passport/booklet OCR | LOW | Page01 |
| Part2_Item1_MiddleName[0] | YES | passport/booklet OCR | LOW | Page01 |
| Part2_Item4_StreetNumberName[0] | YES | user types | LOW | US physical address |
| Part2_Item4_CityOrTown[0] | YES | user types | LOW | |
| Part2_Item4_State[0] | YES | user types | LOW | |
| Part2_Item4_ZipCode[0] | YES | user types | LOW | |
| Part2_Item4_Unit[0-2] | YES | user types | LOW | unit type checkboxes |
| Part2_Item4_AptSteFlrNumber[0] | YES | user types | LOW | |
| Part2_Item4_InCareofName[0] | YES (conditional) | user types | LOW | |
| Part2_Item5_YN[0/1] | YES | mailing_same_as_physical | LOW | mailing = physical checkbox |
| Part2_Item6_* | YES (conditional) | user types | LOW | mailing address when different |
| Part2_Item7_AlienNumber[0] | YES | EAD OCR → a_number | LOW | |
| Part2_Item8_AcctIdentifier[0] | YES (conditional) | user types | LOW | USCIS online account |
| **Part2_Item9_SocialSecurityNumber[0]** | **NO** | user types (ssn in TPSAnswers) | **MEDIUM** | TPSAnswers has `ssn` field (answers.ts:32) but i821FieldMap.ts never writes it |
| Part2_Item10_DateOfBirth[0] | YES | passport/booklet OCR | LOW | |
| Part2_Item11_DateOfBirth[0/1] | NO | none | LOW | "Other dates of birth used" — intentionally out of scope |
| Part2_Item12_Sex[0/1] | YES | passport OCR | LOW | |
| **Part2_Item13_CityOrTown[0]** | **NO (hardcoded '')** | none | **MEDIUM** | City of birth — always written as empty string (i821FieldMap.ts:165) |
| Part2_Item14_CountryofBirth[0] | YES | user types | LOW | |
| **P2_Line7_DateOfBirth[0]** | **NO** | I-94 OCR → last_entry_date | **HIGH** | I-821 Part 2 Item 19 "Date of Last Entry" — field name is misleading. Never mapped. Confirmed by TU: "19. Enter Date of Last Entry into the United States." |
| **Part2_Item19_ImmigrationStatus[0]** | **NO** | I-94 OCR → status_at_last_entry | **MEDIUM** | Immigration status at last entry. Not mapped. |
| Part2_Item22_Passport[0] | YES | passport OCR | LOW | passport number |
| Part2_Item22_I94[0] | YES (conditional) | I-94 OCR | LOW | |
| Part2_Item24_CountryofIssuance[0] | YES | passport OCR | LOW | |
| Part2_Item24_PassportExpiration[0] | YES | passport OCR | LOW | |
| **Part8_Item3_DayPhone[0]** | **NO** | user types (daytime_phone in TPSAnswers) | **HIGH** | Phone number on Part 8 signature page (Page 11). TPSAnswers has it; i821FieldMap.ts never writes it. |
| **Part8_Item5_Email[0]** | **NO** | user types (email in TPSAnswers) | **HIGH** | Email on Part 8 signature page (Page 11). Same issue. |
| Part3_Item1/2 (physical description) | NO | none | LOW | Eye/hair color — intentionally out of scope |
| Parts 4-7 (family, eligibility, travel) | NO | none | MEDIUM | Out of scope per design; user must fill yes/no questions |

**I-821 coverage stats:**
- Total AcroForm fields in PDF: 511
- Fields in scope (single adult, Parts 1-3 + Part 8 contact): ~45
- Mapped in i821FieldMap.ts: 34 ops (28 unique fields)
- OCR-auto-fillable: 10 fields (name, DOB, sex, passport info, A-number)
- User-must-type: 18 fields (address, phone, email, entry date, etc.)
- **Missing critical mapped fields: 4 (phone, email, last-entry-date, immigration status)**

---

## 5. I-765 Field Coverage Table

PDF total: 180 fields. Mapped subset: ~24 ops (covering ~22 unique fields).

| field_name (PDF) | mapped | ocr_source | risk | notes |
|---|---|---|---|---|
| Line1a_FamilyName[0] | YES | passport/booklet OCR | LOW | Page 1 |
| Line1b_GivenName[0] | YES | passport/booklet OCR | LOW | |
| Line1c_MiddleName[0] | YES | passport/booklet OCR | LOW | |
| Line4b_StreetNumberName[0] | YES | user types | LOW | Mailing address street (Line 5B per TU) |
| Pt2Line5_AptSteFlrNumber[0] | YES | user types | LOW | Mailing address apt/unit |
| Pt2Line5_CityOrTown[0] | YES | user types | LOW | Mailing address city |
| Pt2Line5_State[0] | YES | user types | LOW | Mailing address state |
| Pt2Line5_ZipCode[0] | YES | user types | LOW | Mailing address ZIP |
| **Part2Line5_Checkbox[0/1]** | **NO** | derived from mailing_same_as_physical | **MEDIUM** | "Is mailing same as physical?" (I-765 Line 6). Confirmed by TU. Never set. |
| **Pt2Line7_StreetNumberName[0]** | **NO** | us_address_street | **HIGH** | I-765 Physical address (Line 7A). Never mapped. Blank when mailing = physical. |
| **Pt2Line7_AptSteFlrNumber[0]** | **NO** | us_address_unit_number | **HIGH** | Same block |
| **Pt2Line7_CityOrTown[0]** | **NO** | us_address_city | **HIGH** | Same block |
| **Pt2Line7_State[0]** | **NO** | us_address_state | **HIGH** | Same block |
| **Pt2Line7_ZipCode[0]** | **NO** | us_address_zip | **HIGH** | Same block |
| Line7_AlienNumber[0] | YES | EAD OCR → a_number | LOW | |
| **Line12b_SSN[0]** | **NO** | user types (ssn in TPSAnswers) | **MEDIUM** | SSN field. TPSAnswers.ssn exists; i765FieldMap never writes it. |
| Line18a_CityTownOfBirth[0] | NO (hardcoded '') | none | MEDIUM | City of birth, hardcoded empty (i765FieldMap.ts:52) |
| Line18c_CountryOfBirth[0] | YES | user types | LOW | |
| Line19_DOB[0] | YES | passport OCR | LOW | |
| Line20a_I94Number[0] | YES (conditional) | I-94 OCR | LOW | |
| Line20b_Passport[0] | YES | passport OCR | LOW | |
| Line20d_CountryOfIssuance[0] | YES | passport OCR | LOW | |
| Line20e_ExpDate[0] | YES | passport OCR | LOW | |
| Line21_DateOfLastEntry[0] | YES | I-94 OCR | LOW | |
| **place_entry[0]** | **NO** | none | **HIGH** | "Place of Last Arrival into US" (I-765 Line 22) — confirmed by TU. Required. Never mapped. Not in PersonalFields. |
| Line23_StatusLastEntry[0] | YES (conditional) | I-94 OCR → i94_class_of_admission | LOW | |
| Line24_CurrentStatus[0] | YES (conditional) | user types | LOW | |
| #area[1].section_1/2/3 | YES | ead_category | LOW | Eligibility category (a)(12) or (c)(19) |
| Pt3Line3_DaytimePhoneNumber1[0] | YES | user types | LOW | Phone digits-only |
| Pt3Line5_Email[0] | YES | user types | LOW | |

**I-765 coverage stats:**
- Total AcroForm fields in PDF: 180
- Fields in scope: ~35
- Mapped in i765FieldMap.ts: 24 ops (22 unique fields)
- OCR-auto-fillable: 9 fields (name, DOB, passport info, A-number)
- User-must-type: 13 fields
- **Missing critical mapped fields: 5 (physical address block x4 + place_entry)**

---

## 6. Coverage Statistics

| metric | I-821 | I-765 |
|---|---|---|
| Total PDF fields | 511 | 180 |
| Fields in scope (single adult, Parts 1-3/8) | ~45 | ~35 |
| Currently mapped ops | 34 | 24 |
| OCR auto-filled (when user uploads docs) | 10 | 9 |
| User must type | 18 | 13 |
| **Missing — in scope, should be mapped** | **4** | **5** |
| Intentionally out of scope (family, legal, preparer) | ~466 | ~145 |

---

## 7. applyPreExtracted — What It Handles, What It Drops

**File:** `apps/web/src/app/[locale]/services/tps-ukraine/start/GeneratePacketBlock.tsx`, lines 51–104

**Handles (fieldMap, line 68–82):**
```
family_name                → family_name
given_name                 → given_name
middle_name                → middle_name
dob                        → dob
sex                        → sex  (coerced to 'M'/'F')
country_of_birth           → country_of_birth
passport_number            → passport_number
passport_country_of_issuance → passport_country_of_issuance
passport_expiration_date   → passport_expiration_date
i94_admission_number       → i94_admission_number
last_entry_date            → last_entry_date
a_number                   → a_number
i94_class_of_admission     → status_at_last_entry
```

**Silently drops:**
- `ead_category_on_card` — comment at line 58 says "ead_category is driven from filing_path on the server side". This is incorrect for re-registrants where the EAD card is the authoritative source of the category. When a user uploads an EAD showing C19 but the wizard defaults to A12 (initial path pre-selected), the wrong eligibility category ships.
- `ead_expiration_date` — not a form field; correct to drop.
- `i94_admit_until` — not a form field for I-821/I-765; correct to drop.

**Behavior when user has typed data:** user-typed localStorage values win (line 89: `if (next[key] && next[key].toString().trim() !== '') continue`). This is correct behavior.

---

## 8. Critical Bugs (with file + line)

### BUG-001: I-821 Part 8 phone and email never written to PDF
**Priority: P0**  
**File:** `apps/web/src/lib/tps/forms/i821FieldMap.ts`  
`buildI821Ops` returns ops only through Page03. It never emits ops for:
- `form1[0].Page11[0].Part8_Item3_DayPhone[0]` (TU: "Applicant's Daytime Telephone Number")
- `form1[0].Page11[0].Part8_Item5_Email[0]` (TU: "Applicant's Email Address")

`TPSAnswers.daytime_phone` and `TPSAnswers.email` are collected by the wizard (GeneratePacketBlock.tsx lines 506–509) and written to I-765 correctly, but never to I-821.

### BUG-002: I-821 last-entry date never written to PDF
**Priority: P0**  
**File:** `apps/web/src/lib/tps/forms/i821FieldMap.ts`  
`TPSAnswers.last_entry_date` is collected and written to I-765 Line 21 correctly (`i765FieldMap.ts:92`), but the I-821 equivalent field `form1[0].Page03[0].P2_Line7_DateOfBirth[0]` (TU confirmed: "19. Enter Date of Last Entry into the United States") is never mapped in i821FieldMap.ts. The misleading name `P2_Line7_DateOfBirth` in the PDF is what caused the miss.

### BUG-003: I-765 physical address block never written
**Priority: P0**  
**File:** `apps/web/src/lib/tps/forms/i765FieldMap.ts`  
The form has two address sections: mailing (Lines 4-5, mapped) and physical (Line 7, unmapped). The "Is mailing same as physical?" checkbox `Part2Line5_Checkbox` is also never set. When mailing = physical (the common case), USCIS will see a blank physical address section.

Fields never written (all confirmed by TU as "U.S. Physical Address"):
- `form1[0].Page2[0].Part2Line5_Checkbox[0]` (Select No)
- `form1[0].Page2[0].Part2Line5_Checkbox[1]` (Select Yes — same as mailing)
- `form1[0].Page2[0].Pt2Line7_StreetNumberName[0]`
- `form1[0].Page2[0].Pt2Line7_AptSteFlrNumber[0]`
- `form1[0].Page2[0].Pt2Line7_Unit[0-2]`
- `form1[0].Page2[0].Pt2Line7_CityOrTown[0]`
- `form1[0].Page2[0].Pt2Line7_State[0]`
- `form1[0].Page2[0].Pt2Line7_ZipCode[0]`

### BUG-004: I-765 Place of Last Arrival never written
**Priority: P0**  
**File:** `apps/web/src/lib/tps/forms/i765FieldMap.ts` and `GeneratePacketBlock.tsx`  
`form1[0].Page3[0].place_entry[0]` (TU: "23. Enter Place of Last Arrival into the United States") is a required field per I-765 instructions. It is never mapped, never collected in `PersonalFields`, and never in `TPSAnswers`.

### BUG-005: SSN in TPSAnswers never written to either PDF
**Priority: P1**  
**File:** `apps/web/src/lib/tps/forms/i821FieldMap.ts` and `apps/web/src/lib/tps/forms/i765FieldMap.ts`  
`TPSAnswers.ssn` (`answers.ts` line 32) is defined but:
- i821FieldMap.ts never emits `form1[0].Page02[0].Part2_Item9_SocialSecurityNumber[0]`
- i765FieldMap.ts never emits `form1[0].Page2[0].Line12b_SSN[0]`
The SSN field is also absent from `PersonalFields` in GeneratePacketBlock.tsx entirely, so the user is never asked for it.

### BUG-006: City of birth hardcoded as empty string
**Priority: P1**  
**File:** `apps/web/src/lib/tps/forms/i821FieldMap.ts` line 165; `apps/web/src/lib/tps/forms/i765FieldMap.ts` line 52

```typescript
// i821FieldMap.ts line 165:
{ field: 'form1[0].Page02[0].Part2_Item13_CityOrTown[0]', kind: 'text', value: '' /* not captured this cycle */ }

// i765FieldMap.ts line 52:
{ field: 'form1[0].Page3[0].Line18a_CityTownOfBirth[0]', kind: 'text', value: '' /* not captured this cycle */ }
```

USCIS requires city of birth. The user will see empty boxes with no prompt in the wizard.

### BUG-007: ead_category_on_card silently discarded — wrong eligibility category can ship
**Priority: P1**  
**File:** `apps/web/src/app/[locale]/services/tps-ukraine/start/GeneratePacketBlock.tsx` lines 58–61  
EAD-card OCR extracts the category (e.g. "C19") but `applyPreExtracted` fieldMap does not include `ead_category_on_card`. The category is derived solely from `filing_path` (line 529). If a re-registrant picks `initial` by mistake, the packet ships with A12. The extracted C19 from the card is available but ignored.

### BUG-008: packetBuilder test passes while hiding BUG-001
**Priority: P2**  
**File:** `apps/web/src/lib/tps/__tests__/packetBuilder.test.ts` line 109  
The test checks I-765 email (`expect(i765Text).toMatch(/test@example\.invalid/)`) but never checks I-821 Part8 phone or email. Since those fields are never written (BUG-001), the test passes while the bug is live in production.

---

## 9. Missing Tests

| missing test | impact | recommended location |
|---|---|---|
| `runI94Module` unit tests | I-94 extraction silently broken on CBP layout change | `modules/__tests__/i94.test.ts` |
| `runEadModule` unit tests | EAD extraction silently broken | `modules/__tests__/ead.test.ts` |
| `runPassportBookletModule` unit tests | Booklet extraction silently broken | `modules/__tests__/passportBooklet.test.ts` |
| `applyPreExtracted` unit tests | OCR-to-form wiring only indirectly tested | `__tests__/applyPreExtracted.test.ts` |
| I-821 Part8 phone/email field assertion | Would catch BUG-001 | `__tests__/packetBuilder.test.ts` |
| I-765 physical address assertion | Would catch BUG-003 | `__tests__/packetBuilder.test.ts` |
| I-765 place_entry field assertion | Would catch BUG-004 | `__tests__/packetBuilder.test.ts` |
| End-to-end OCR route test with mock Vision response | No test of `POST /api/tps/ocr/extract` | `app/api/tps/ocr/extract/__tests__/route.test.ts` |

---

## 10. P0 / P1 / P2 Gap List

### P0 — Blocks production (form is legally deficient as shipped)

| ID | title | file | evidence |
|---|---|---|---|
| P0-001 | I-821 applicant phone + email never written | `forms/i821FieldMap.ts` | No `ops.push` for Part8_Item3_DayPhone or Part8_Item5_Email anywhere in file |
| P0-002 | I-821 last-entry date never written | `forms/i821FieldMap.ts` | `P2_Line7_DateOfBirth[0]` (Item 19) absent from all ops; TPSAnswers.last_entry_date is collected but goes nowhere on I-821 |
| P0-003 | I-765 physical address entirely blank | `forms/i765FieldMap.ts` | `Pt2Line7_*` (7 fields) and `Part2Line5_Checkbox` absent from all ops |
| P0-004 | I-765 place of last arrival never collected or written | `forms/i765FieldMap.ts`, `GeneratePacketBlock.tsx` | `place_entry[0]` absent from fieldMap; field not in `PersonalFields` |

### P1 — Significant user-facing defect

| ID | title | file | evidence |
|---|---|---|---|
| P1-001 | SSN in TPSAnswers but never written to I-821 or I-765 | `forms/i821FieldMap.ts`, `forms/i765FieldMap.ts` | `ssn` in answers.ts:32; absent from both field maps and from PersonalFields |
| P1-002 | City of birth hardcoded as '' — no user prompt | `forms/i821FieldMap.ts:165`, `forms/i765FieldMap.ts:52` | Explicit `value: ''` comment "not captured this cycle" |
| P1-003 | `ead_category_on_card` extracted but dropped; wrong EAD category can ship | `GeneratePacketBlock.tsx:58-61` | fieldMap does not include `ead_category_on_card` |
| P1-004 | I-821 immigration status at last entry never written | `forms/i821FieldMap.ts` | `Part2_Item19_ImmigrationStatus[0]` absent; `status_at_last_entry` collected but only routed to I-765 |

### P2 — Quality / completeness

| ID | title | file | evidence |
|---|---|---|---|
| P2-001 | No unit tests for i94 module | `modules/` | Only `passport.test.ts` exists in `modules/__tests__/` |
| P2-002 | No unit tests for ead module | `modules/` | Same |
| P2-003 | No unit tests for passportBooklet module | `modules/` | Same |
| P2-004 | packetBuilder test does not assert I-821 Part8 phone/email | `__tests__/packetBuilder.test.ts` | Test passes despite BUG-001 being live |
| P2-005 | `i94_admit_until` extracted but unused — dead code | `modules/i94.ts:178` | Field not in `PersonalFields`, `TPSAnswers`, or any PDF map |
| P2-006 | `TpsPacketState.qa_result` always PENDING — QA validator referenced in architecture doc does not exist | `types.ts` | `tpsPacketQaValidator` mentioned in `docs/tps/ARCHITECTURE_V1.md` pipeline diagram but no such file exists |
| P2-007 | AI Brain defaults OFF; no fallback for unknown document types | `ai/documentBrain.ts:167` | `TPS_AI_BRAIN_ENABLED=1` required; without it, unrecognized docs return raw OCR with no field extraction |

---

## 11. Minimum Work to Call It Production-Ready

### Fix 1 — I-821: add phone, email, last-entry-date, immigration status (P0-001, P0-002, P1-004)
**File:** `apps/web/src/lib/tps/forms/i821FieldMap.ts` — add to `buildI821Ops`:

```typescript
// Part 2 Item 19 — Date of Last Entry (Page 03, PDF field is misleadingly named P2_Line7_DateOfBirth)
ops.push({ field: 'form1[0].Page03[0].P2_Line7_DateOfBirth[0]', kind: 'text',
  value: toUscisDate(a.last_entry_date) })

// Part 2 Item 20 — Immigration status at last entry
if (a.status_at_last_entry) {
  ops.push({ field: 'form1[0].Page03[0].Part2_Item19_ImmigrationStatus[0]', kind: 'text',
    value: a.status_at_last_entry })
}

// Part 8 — Applicant contact info (Page 11)
ops.push({ field: 'form1[0].Page11[0].Part8_Item3_DayPhone[0]', kind: 'text',
  value: (a.daytime_phone || '').replace(/\D/g, '').slice(0, 10) })
ops.push({ field: 'form1[0].Page11[0].Part8_Item5_Email[0]', kind: 'text', value: a.email })
```

### Fix 2 — I-765: add physical address block and "same as mailing" checkbox (P0-003)
**File:** `apps/web/src/lib/tps/forms/i765FieldMap.ts` — add to `buildI765Ops`:

```typescript
// Line 6 — Is mailing same as physical?
ops.push({ field: 'form1[0].Page2[0].Part2Line5_Checkbox[0]', kind: 'checkbox',
  value: a.mailing_same_as_physical === false }) // [0] = No (different)
ops.push({ field: 'form1[0].Page2[0].Part2Line5_Checkbox[1]', kind: 'checkbox',
  value: a.mailing_same_as_physical !== false }) // [1] = Yes (same)

// Line 7 — Physical address
ops.push({ field: 'form1[0].Page2[0].Pt2Line7_StreetNumberName[0]', kind: 'text', value: a.us_address_street })
ops.push({ field: 'form1[0].Page2[0].Pt2Line7_AptSteFlrNumber[0]', kind: 'text', value: a.us_address_unit_number ?? '' })
const physUnitIdx = a.us_address_unit_type === 'apt' ? 0 : a.us_address_unit_type === 'ste' ? 1 : a.us_address_unit_type === 'flr' ? 2 : -1
for (let i = 0; i < 3; i++) {
  ops.push({ field: `form1[0].Page2[0].Pt2Line7_Unit[${i}]`, kind: 'checkbox', value: i === physUnitIdx })
}
ops.push({ field: 'form1[0].Page2[0].Pt2Line7_CityOrTown[0]', kind: 'text', value: a.us_address_city })
ops.push({ field: 'form1[0].Page2[0].Pt2Line7_State[0]', kind: 'choice', value: a.us_address_state })
ops.push({ field: 'form1[0].Page2[0].Pt2Line7_ZipCode[0]', kind: 'text', value: a.us_address_zip })
```

### Fix 3 — Add place_of_last_entry to TPSAnswers, PersonalFields, I-765 (P0-004)
**Files:** `answers.ts`, `GeneratePacketBlock.tsx`, `forms/i765FieldMap.ts`

Add `place_of_last_entry?: string` to `TPSAnswers`. Add it to `PersonalFields` and add a text input in GeneratePacketBlock labeled "City/Port of Last Entry into the US (I-765 Line 22)". Map to `form1[0].Page3[0].place_entry[0]` in i765FieldMap.

### Fix 4 — Add city_of_birth to PersonalFields and both form maps (P1-002)
**Files:** `answers.ts`, `GeneratePacketBlock.tsx`, `forms/i821FieldMap.ts`, `forms/i765FieldMap.ts`

Replace the hardcoded `''` with `a.city_of_birth ?? ''`. Add a text input in the wizard. Note: no OCR module currently extracts city of birth (the passport MRZ does not carry it); user must type it.

### Fix 5 — Wire ead_category_on_card into filing-path pre-selection (P1-003)
**File:** `GeneratePacketBlock.tsx` lines 58–82

When `ead_category_on_card` is present in `preExtracted`, use it to suggest the correct `ead_category` to the user. At minimum, warn the user if the OCR-extracted category contradicts the `filing_path` derived category.

### Fix 6 — Add tests for i94, ead, booklet modules (P2-001, P2-002, P2-003)
Create `modules/__tests__/i94.test.ts`, `modules/__tests__/ead.test.ts`, `modules/__tests__/passportBooklet.test.ts` with at least one happy-path fixture test each, mirroring the existing `passport.test.ts` pattern.

### Fix 7 — Add regression assertions to packetBuilder.test.ts (P2-004)
After Fix 1 and Fix 2, add:
```typescript
expect(i821Text).toMatch(/5550000000/)    // Part8 phone
expect(i821Text).toMatch(/test@example/)  // Part8 email
expect(i821Text).toMatch(/05\/01\/2023/)  // last entry date
const physStreet = await readAcroFieldValue(i765bytes, 'form1[0].Page2[0].Pt2Line7_StreetNumberName[0]')
expect(physStreet).toBe('100 Test St')
```

---

## Appendix: File Locations

| file | path |
|---|---|
| I-821 field map | `apps/web/src/lib/tps/forms/i821FieldMap.ts` |
| I-765 field map | `apps/web/src/lib/tps/forms/i765FieldMap.ts` |
| PDF prefiller | `apps/web/src/lib/tps/pdfPrefiller.ts` |
| Packet builder | `apps/web/src/lib/tps/packetBuilder.ts` |
| OCR route | `apps/web/src/app/api/tps/ocr/extract/route.ts` |
| Generate-packet route | `apps/web/src/app/api/tps/generate-packet/route.ts` |
| Wizard (main) | `apps/web/src/app/[locale]/services/tps-ukraine/start/TPSWizard.tsx` |
| Generate packet block | `apps/web/src/app/[locale]/services/tps-ukraine/start/GeneratePacketBlock.tsx` |
| TPSAnswers contract | `apps/web/src/lib/tps/answers.ts` |
| Passport module | `apps/web/src/lib/tps/modules/passport.ts` |
| Passport booklet module | `apps/web/src/lib/tps/modules/passportBooklet.ts` |
| I-94 module | `apps/web/src/lib/tps/modules/i94.ts` |
| EAD module | `apps/web/src/lib/tps/modules/ead.ts` |
| Document Brain (AI) | `apps/web/src/lib/tps/ai/documentBrain.ts` |
| I-821 PDF | `apps/web/public/uscis/tps/i-821.pdf` |
| I-765 PDF | `apps/web/public/uscis/tps/i-765.pdf` |
