# TPS Ukraine — Field Coverage Matrix

**Audit date:** 2026-05-13  
**Author:** TPS_FIELD_COVERAGE_CLOSEOUT_V1 automated cycle  
**Forms audited:** I-821 (01/20/25 edition, 511 fields) · I-765 (08/21/25 edition, 180 fields)  
**Source of truth for field names:** `docs/uscis/forms/tps/field_inventory_i821.json` · `field_inventory_i765.json`

---

## 1. Coverage Summary

| Form | Total AcroForm fields | Not applicable¹ | Applicable | Runtime ops mapped | Coverage (applicable) |
|------|----------------------|-----------------|------------|-------------------|-----------------------|
| I-821 | 511 | 168 | 343 | **145** | **42 %** |
| I-765 | 180 | 42 | 138 | **53** | **38 %** |

¹ Not applicable = barcodes, PDF417 scan codes, signature/date-of-signing rows, preparer/interpreter certification, Part 4–6 family-member pages (not part of solo filer packet), continuation-page slots.

**Before this cycle (baseline):**

| Form | Runtime ops (before) | Coverage before |
|------|---------------------|-----------------|
| I-821 | ~18 | ~5 % |
| I-765 | ~20 | ~14 % |

---

## 2. Field Classification Legend

| Class | Meaning |
|-------|---------|
| `MAPPED` | We write this field in the prefiller. Value comes from user input or OCR. |
| `INTENTIONALLY_MANUAL` | USCIS field exists; user must fill it by hand after printing. Not fillable by us (signature, date of signing, biometric worksheet). |
| `NOT_APPLICABLE` | Field exists in the PDF but is never relevant for a solo TPS filer (preparer cert, interpreter cert, family-member slots). |
| `CONDITIONAL` | We write this field only when a condition is met (e.g., Line 7 physical address only when mailing ≠ physical; I-765 included only when `wants_ead=true`). |
| `PLANNED` | Known missing; in the backlog. Not blocking P0/P1. |

---

## 3. I-821 Field Classification — by Part

### Part 1 — Type of Application (Page 01)
| Field | Class | Provenance |
|-------|-------|------------|
| Part1_Checkbox[0] initial | `MAPPED` | `filing_path` → `user_manual` |
| Part1_Checkbox[1] re-register | `MAPPED` | `filing_path` → `user_manual` |

### Part 2 — Applicant Identity (Pages 02–04)
| Field | Class | Provenance |
|-------|-------|------------|
| FamilyName, GivenName, MiddleName | `MAPPED` | `user_manual` |
| Other names (Items 15a–16d, first 2 slots) | `MAPPED` | `user_manual` (schema field `other_names[]`) |
| Other names slots 3+ | `PLANNED` | Form has room; most filers need ≤2 |
| DOB Item 11 [0/1] (century + full date) | `MAPPED` | `user_manual` |
| A-Number (Item 7) | `MAPPED` (conditional) | `ead_ocr` or `user_manual` |
| USCIS Online Account (Item 8) | `PLANNED` | Low-priority; most initial filers don't have one |
| Sex (Item 12) Male/Female | `MAPPED` | `user_manual` |
| Country of birth (Item 14) | `MAPPED` | `user_manual` |
| City of birth (Item 13) | `MAPPED` | `user_manual` |
| Country of nationality (Item 14b) | `MAPPED` | hardcoded `Ukraine` |
| Marital status [0–6] (Item 17) | `MAPPED` | `user_manual` |
| US physical address (Items 4a–4g) | `MAPPED` | `user_manual` |
| Mailing address (Items 3a–3g) | `MAPPED` (conditional) | `user_manual` |
| In-care-of checkboxes | `PLANNED` | Uncommon; deferred |
| SSN (Item 10) | `MAPPED` (conditional) | `user_manual` |
| Passport number (Item 19) | `MAPPED` | `passport_ocr` or `user_manual` |
| Passport country (Item 19b) | `MAPPED` | `passport_ocr` or `user_manual` |
| Passport expiration (Item 19c) | `MAPPED` | `passport_ocr` or `user_manual` |
| Date of last arrival (Item 22) | `MAPPED` | `i94_ocr` or `user_manual` |
| I-94 number (Item 23) | `MAPPED` (conditional) | `i94_ocr` or `user_manual` |
| Port of entry city (Item 20) | `MAPPED` (conditional) | `user_manual` |
| Port of entry state (Item 20) | `MAPPED` (conditional) | `user_manual` |
| Class of admission (Item 25) | `MAPPED` (conditional) | `i94_ocr` or `user_manual` |
| Authorized stay (Item 21) | `MAPPED` (conditional) | `user_manual` |
| Height/weight | `PLANNED` | Biographic; low priority |

### Part 3 — Biographic Information (Page 05)
| Field | Class | Provenance |
|-------|-------|------------|
| Ethnicity [0–1] Hispanic/Not Hispanic | `MAPPED` | `user_manual` |
| Race White | `MAPPED` | `user_manual` |
| Race Asian | `MAPPED` | `user_manual` |
| Race Black/African American | `MAPPED` | `user_manual` |
| Race American Indian/Alaska | `MAPPED` | `user_manual` |
| Race Pacific Islander | `MAPPED` | `user_manual` |
| Eye color [0–8] | `MAPPED` | `user_manual` |
| Hair color [0–8] | `MAPPED` | `user_manual` |
| Height (ft/in) | `PLANNED` | Deferred |
| Weight (lbs) | `PLANNED` | Deferred |

### Parts 4–6 — Family members / biometric worksheet
| Field | Class |
|-------|-------|
| All fields | `NOT_APPLICABLE` (solo filer) |

### Part 7 — Background Declaration (Pages 07–09)
All 30 yes/no questions mapped. Each question has two checkbox fields [0]=Yes [1]=No.

| Item | Field | Class | Provenance |
|------|-------|-------|------------|
| 4a–4c (criminal) | Part7_Item4a/b/c_YN[0/1] | `MAPPED` | `user_manual` (required review) |
| 5a–5c (DUI) | Part7_Item5a/b/c_YN[0/1] | `MAPPED` | `user_manual` |
| 7a–7c (persecution/genocide) | Part7_Item7a/b/c_YN[0/1] | `MAPPED` | `user_manual` |
| 8 (domestic violence) | Part7_Item8_YN[0/1] | `MAPPED` | `user_manual` |
| 9a–9e (immigration fraud) | Part7_Item9a–e_YN[0/1] | `MAPPED` | `user_manual` |
| 11a–11d (removal) | Part7_Item11a–d_YN[0/1] | `MAPPED` | `user_manual` |
| 12a–12d (prior TPS) | Part7_Item12a–d_YN[0/1] | `MAPPED` | `user_manual` |
| 13a–13c (benefit fraud) | Part7_Item13a–c_YN[0/1] | `MAPPED` | `user_manual` |
| 17 (prior I-821) | Part7_Item17_YN[0/1] | `MAPPED` | `user_manual` |
| 18a–18c (proceedings) | Part7_Item18a–c_YN[0/1] | `MAPPED` | `user_manual` |

**Hard stop:** `part7_reviewed=true` required before ZIP generation. Enforced in GeneratePacketBlock (Generate button disabled) and `isMinimallyComplete()` (server-side 422).

### Part 8 — Applicant Declaration / Signature (Pages 10–11)
| Field | Class | Notes |
|-------|-------|-------|
| Daytime phone | `MAPPED` | `user_manual` |
| Email | `MAPPED` | `user_manual` |
| Signature | `INTENTIONALLY_MANUAL` | FR 2026-09289: must be handwritten |
| Date of signature | `INTENTIONALLY_MANUAL` | User fills after print |

---

## 4. I-765 Field Classification — by Section

### Part 1 — Type of Application (Page 1)
| Field | Class | Provenance |
|-------|-------|------------|
| Checkbox[0] Initial permission | `MAPPED` | `i765_application_type` → `user_manual` |
| Checkbox[1] Replacement card | `MAPPED` | `i765_application_type` → `user_manual` |
| Checkbox[2] Renewal | `MAPPED` | `i765_application_type` → `user_manual` |

### Part 2 — Identity / Address (Pages 1–2)
| Field | Class | Provenance |
|-------|-------|------------|
| Family/Given/Middle name (Line 1) | `MAPPED` | `user_manual` |
| Mailing street (Line 4b) | `MAPPED` | `user_manual` |
| Mailing city/state/zip (Line 5) | `MAPPED` | `user_manual` |
| Mailing unit type checkboxes [0–2] | `MAPPED` | `user_manual` |
| Is mailing same as physical? [0/1] | `MAPPED` | `user_manual` |
| Physical address (Line 7) | `MAPPED` (conditional) | `user_manual`; only when mailing ≠ physical |
| A-Number (Line 7 alien number) | `MAPPED` (conditional) | `ead_ocr` or `user_manual` |
| Gender [0/1] Male/Female (Line 9) | `MAPPED` | `user_manual` |
| Race [0–3] (Line 10) | `MAPPED` | `user_manual` |
| SSN (Line 12b) | `MAPPED` (conditional) | `user_manual` |

### Page 3 — Identity continued
| Field | Class | Provenance |
|-------|-------|------------|
| City of birth (Line 18a) | `MAPPED` | `user_manual` |
| Country of birth (Line 18c) | `MAPPED` | `user_manual` |
| Date of birth (Line 19) | `MAPPED` | `user_manual` |
| Passport number (Line 20b) | `MAPPED` | `passport_ocr` or `user_manual` |
| Passport country of issuance (Line 20d) | `MAPPED` | `passport_ocr` or `user_manual` |
| Passport expiration (Line 20e) | `MAPPED` | `passport_ocr` or `user_manual` |
| I-94 number (Line 20a) | `MAPPED` (conditional) | `i94_ocr` or `user_manual` |
| Date of last entry (Line 21) | `MAPPED` | `i94_ocr` or `user_manual` |
| Status at last entry (Line 23) | `MAPPED` (conditional) | `i94_ocr` or `user_manual` |
| Current immigration status (Line 24) | `MAPPED` (conditional) | `user_manual` |
| Eligibility category (Item 27) section_1/2/3 | `MAPPED` | `ai_brain` (derived from `filing_path`) |

### Part 3 — Applicant Contact (Page 4)
| Field | Class | Provenance |
|-------|-------|------------|
| Daytime phone (Line 3) | `MAPPED` | `user_manual` |
| Email (Line 5) | `MAPPED` | `user_manual` |
| Signature | `INTENTIONALLY_MANUAL` | FR 2026-09289 |
| Date of signature | `INTENTIONALLY_MANUAL` | User fills after print |

---

## 5. Scenario Matrix

Four canonical scenarios used to verify field map completeness:

| Scenario | Filing path | Wants EAD | Mailing = Physical | A-Number | SSN | Expected behavior |
|----------|------------|-----------|-------------------|----------|-----|-------------------|
| S1 — New U4U parolee | `initial` | Yes | Yes | No | No | I-821 + I-765; EAD cat `a12`; status defaults to `UH`; no A-number written |
| S2 — Re-registering TPS holder | `re_registration` | Yes | Yes | Yes (from EAD OCR) | Maybe | I-821 + I-765; EAD cat `c19`; A-number written on both forms |
| S3 — Initial, no EAD | `initial` | No | Yes | No | No | I-821 only; I-765 not included; `wants_ead=false` |
| S4 — Separate mailing address | `initial` | Yes | **No** | No | No | I-821 + I-765; Line 7 physical block written; mailing block uses mailing address |

All four scenarios pass the `isMinimallyComplete()` validation when required fields are populated.

---

## 6. Field Provenance Classification

Every value written to a USCIS PDF field must have exactly one declared provenance. Forbidden: `silent_default` (a value the user never sees and cannot correct before generation).

| Provenance code | Meaning | Examples |
|----------------|---------|---------|
| `user_manual` | User typed the value in the wizard UI | Names, DOB, address, phone, all Part 7 answers |
| `passport_ocr` | Value extracted from passport MRZ via OCR module | `passport_number`, `given_name`, `dob` (can be overridden) |
| `i94_ocr` | Value extracted from I-94 via OCR module | `last_entry_date`, `i94_admission_number`, `status_at_last_entry` |
| `ead_ocr` | Value extracted from EAD card via OCR module | `a_number` |
| `ai_brain` | Deterministic derivation from other confirmed inputs — no ML inference | `ead_category` (derived from `filing_path`), `country_of_nationality` (hardcoded `Ukraine` for TPS Ukraine service) |
| `visible_default_confirmed_by_user` | Pre-filled default the user saw and did not change (or actively confirmed) | `country_of_birth` defaults to `Ukraine`; `status_at_last_entry` defaults to `UH` when blank on initial path |
| `silent_default` | **FORBIDDEN** — value written without user ever seeing it | Any value that bypasses the UI and prefills a USCIS field the user cannot inspect before download |

**Part 7 provenance note:** All 30 yes/no answers default to `false` (No). This is a `visible_default_confirmed_by_user` provenance — every question is shown in the UI and the user must check a confirmation checkbox (`part7_reviewed=true`) before generation is allowed. The hard stop prevents the silent-default anti-pattern.

---

## 7. Hard Stop Criteria

Generation is blocked (server returns HTTP 422, Generate button disabled in UI) when:

| Condition | Enforcement point |
|-----------|------------------|
| `family_name` empty | `isMinimallyComplete()` + PacketCompletenessChecker + GeneratePacketBlock |
| `given_name` empty | same |
| `dob` empty | same |
| `sex` empty | same |
| `country_of_birth` empty | same |
| `passport_number` empty | same |
| `passport_country_of_issuance` empty | same |
| `passport_expiration_date` empty | same |
| `us_address_street/city/state/zip` any empty | same |
| `last_entry_date` empty | same |
| `marital_status` empty | same |
| `daytime_phone` empty | same |
| `email` empty | same |
| `wants_ead=true` AND `ead_category` null | `isMinimallyComplete()` server side |
| `part7_reviewed` false/undefined | `isMinimallyComplete()` + Generate button gate |
| Attestation unchecked | Generate button gate (client only) |

Fields NOT in the hard-stop list are still surfaced in PacketCompletenessChecker as amber warnings (non-blocking): `middle_name`, `a_number`, `ssn`, `i94_admission_number`, `status_at_last_entry`, `city_of_birth`.

---

## 8. Known Gaps (Backlog)

Items below are real gaps — not defects, but deliberately deferred:

| Gap | Impact | Priority |
|-----|--------|----------|
| I-821 USCIS Online Account number (Item 8) | Empty for most initial filers; field left blank | Low |
| I-821 height / weight (Part 3 Items 3–4) | Optional biographic; field left blank | Low |
| I-821 in-care-of name checkbox for mailing/physical | Uncommon; user fills by hand | Low |
| I-821 other names slots 3+ (Part 2 Items 15c–16d) | Relevant only if >2 prior names | Medium |
| I-765 Apt/Ste/Flr unit designation for mailing separate path | Rare; unit type omitted when mailing address is separate | Low |
| I-912 fee waiver PDF prefill | Not yet generated; user must complete by hand | Medium |
| I-821 Part 4–5 family members | Out of scope for solo-filer packet | Not planned |
| Online filing via my.uscis.gov | Different data contract; out of scope | Not planned |

---

## 9. Verification Gates

Run before every commit touching field maps or answers schema:

```bash
# TypeScript — zero errors required
npx tsc --noEmit --project apps/web/tsconfig.json

# Content guards — zero violations required
bash apps/web/scripts/check-content-guards.sh

# Unit tests (run on Mac — arm64 native bindings)
pnpm --filter web test
```

Test coverage targets (vitest, `apps/web/src/lib/tps/`):
- `i821FieldMap.test.ts` — scenario matrix S1–S4, Part 7 default-all-No, Part 3 biographic
- `i765FieldMap.test.ts` — S1/S2 EAD category, separate mailing address path, app type checkboxes
- `answers.test.ts` — `isMinimallyComplete()` blocks on missing `marital_status` and `part7_reviewed`

---

*This document is auto-generated from the coverage closeout cycle. Update whenever field maps change.*
