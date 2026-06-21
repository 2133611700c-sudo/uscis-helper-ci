# Messenginfo Document OCR Reality Audit

**Date:** 2026-05-20
**Auditor:** Independent senior engineer (automated)
**Scope:** TPS Ukraine wizard OCR pipeline — all document types
**Codebase:** `apps/web/` — commit cc46158 (test infra) on top of 173a9cb (product patch)
**Test suite:** 45/45 files, 1832/1832 tests PASS

---

## Executive summary

The passport MRZ extraction pipeline works well — 7 of 7 expected fields extracted with high confidence and correct provenance display. The I-94 pipeline extracts 2 of 4 expected fields. A field-name mismatch bug silently drops the class-of-admission value even when OCR succeeds. Two passport fields (expiration date, country of issuance) are extracted but hidden from user review, preventing verification before PDF generation. EAD, USCIS Notice, DL, and translation documents remain unverified due to fixture or path limitations.

---

## Document matrix

| Document | Slot | Filing path | Verdict | Fields OK | Fields missing/broken |
|---|---|---|---|---|---|
| Passport (MRZ) | `passport` | init + rereg | **PASS** | family_name, given_name, dob, sex, passport_number, country_of_nationality, passport_expiration_date\*, passport_country_of_issuance\* | middle_name (expected: not in MRZ) |
| I-94 | `i94` | init + rereg | **PARTIAL** | i94_admission_number, last_entry_date | i94_class_of_admission (Bug P1), i94_admit_until (not shown) |
| EAD card | `ead` / `ead_old` | rereg only | **UNVERIFIED** | — | Not testable on initial path |
| USCIS Notice (I-797) | `tps_notice` | rereg only | **UNVERIFIED** | — | Not testable on initial path |
| Driver's license | `dl` | both (optional) | **UNVERIFIED** | — | No DL fixture exists |
| Photo (2x2) | `photo` | rereg+paper | **PASS (contract)** | N/A | allowed_fields: [] correctly blocks all OCR |
| Translation docs | — | /translate-document | **UNVERIFIED** | — | No image fixtures exist |

\* Extracted by MRZ parser but NOT shown in Step 5 review UI (Bugs P2, P3).

---

## Bugs found

### P1: i94_class_of_admission field name mismatch — value silently lost

**Severity:** P1 — data loss in production
**Location:** `modules/i94.ts:206` → `TPSWizardV2.tsx:1625-1662` → `:2557` → `:1823`

**Root cause:** The I-94 rule module extracts class of admission as `i94_class_of_admission`. The document contract (`documentContracts.ts`) correctly allows this field for the i94 slot. However, the V2 wizard's merge logic (`mergedFields` useMemo) copies fields by key as-is. The review UI and the generate handler both read `status_at_last_entry` — a different key. No mapping from `i94_class_of_admission` → `status_at_last_entry` exists in V2.

The old V1 wizard (`GeneratePacketBlock.tsx:82`) had this mapping: `i94_class_of_admission: 'status_at_last_entry'`. It was never ported to V2.

**Impact:** Even when OCR successfully extracts class of admission from I-94, the value sits in `mergedFields['i94_class_of_admission']` and is never read. The review UI always shows "Не найдено — введите вручную". The I-821 Part 7 Item 3 and I-765 Line 23 receive empty strings unless the user manually enters the value.

**Fix:** Add a post-merge alias in `mergedFields` useMemo:
```typescript
// After the merge loops, before return:
if (merged['i94_class_of_admission'] && !merged['status_at_last_entry']) {
  merged['status_at_last_entry'] = { ...merged['i94_class_of_admission'] }
}
```

**Risk:** Low — pure additive, no existing behavior changes.

### P2: passport_expiration_date not shown in Step 5 review UI

**Severity:** P2 — user cannot verify before PDF generation
**Location:** `TPSWizardV2.tsx:2544-2551` (review `rows` array)

**Root cause:** The `rows` array that drives the Step 5 "Распознанные данные" display includes family_name, given_name, middle_name, dob, sex, passport_number, country_of_nationality — but omits passport_expiration_date. The field IS extracted by the MRZ parser (`modules/passport.ts:334-357`), IS stored in mergedFields, and IS consumed by the generate handler (`:1819`). It's invisible to the user.

**Impact:** If the MRZ is damaged or the check digit fails, the parser may produce a wrong expiration date. This wrong date reaches the I-821 and I-765 PDFs without the user seeing or correcting it.

**Fix:** Add to the rows array:
```typescript
{ key: 'passport_expiration_date', label: t.label.passport_expiration_date, expectedDoc: 'passport' },
```

**Risk:** Low — purely additive UI change.

### P3: passport_country_of_issuance not shown in Step 5 review UI

**Severity:** P3 — low impact for TPS Ukraine
**Location:** Same as P2

**Root cause:** Same pattern — extracted, stored, consumed, but not displayed.

**Impact:** Low for TPS Ukraine (defaults to "Ukraine" and is rarely wrong). But architecturally the same gap as P2.

**Fix:** Same pattern as P2.

---

## Observations (not bugs)

### EAD category assignment — PASS
After our earlier fix (commit 173a9cb), the wizard correctly assigns:
- **C19** for initial filing (pending TPS → 8 CFR 274a.12(c)(19))
- **A12** for re-registration (approved TPS → 8 CFR 274a.12(a)(12))

Verified both in the browser (Step 5 shows "C19" with "Устанавливается автоматически") and in unit tests (1832/1832 pass).

### Provenance display — PASS
All OCR-extracted fields display source and method:
- "Паспорт · MRZ (высокая точность)" for passport fields
- "I-94 → OCR" for I-94 fields
- Each field has an "Изменить" (Edit) button for manual correction

### Slot contracts (documentContracts.ts) — PASS
All 7 slot definitions verified against the audit spec's expected_slot_rules:
- `passport`: allows 10 identity fields, forbids a_number/i94/ead/address
- `i94`: allows admission/entry/class + passport crosscheck, forbids a_number/ead
- `ead`/`ead_old`: allows a_number/ead_category/ead_expiry + name/dob, forbids passport_expiry/i94
- `tps_notice`: allows a_number/address/name, forbids i94/ead/passport_expiry
- `dl`: allows address + biometrics, forbids all immigration fields
- `photo`: allows nothing, forbids everything

`applyContract()` correctly enforces these at runtime.

### Upload slots per filing path — by design
- **Initial:** passport, i94, dl(optional)
- **Re-registration + EAD:** tps_notice, passport, ead_old, i94, photo(paper only), dl(optional)

This means EAD slot testing requires a re-registration flow walkthrough.

### Synthetic fixture quality
- `synthetic-passport.jpg` — good: clear MRZ with valid check digits, all fields extracted
- `synthetic-i94.jpg` — adequate: admission number and entry date extracted; class of admission may or may not be extracted (can't confirm due to P1 bug masking the result)
- `synthetic-ead.jpg` — untested (re-registration path only)
- `synthetic-uscis-notice.jpg` — untested (re-registration path only)

---

## Recommended actions

### Must fix before deploy (P1)
1. **P1: Add i94_class_of_admission → status_at_last_entry alias** in `TPSWizardV2.tsx` mergedFields useMemo. This is the only data-loss bug found.

### Should fix soon (P2)
2. **P2: Add passport_expiration_date to Step 5 review rows.** Users need to see and verify this before PDF generation.

### Nice to have (P3)
3. **P3: Add passport_country_of_issuance to Step 5 review rows.** Low impact but completes the review UI.

### Follow-up verification needed
4. **Re-registration path browser walkthrough** — test EAD, USCIS Notice, and Photo slots with synthetic fixtures.
5. **Create DL synthetic fixture** — the DL slot is visible in both paths but has no test fixture.
6. **Translation service audit** — create image fixtures for birth/marriage/divorce certificates and test `/translate-document` route.

---

## Test evidence

### Browser walkthrough screenshots (production site)
- Step 1: "Впервые" selected → Step 2: "Почтой" selected → Step 3: "Да" (EAD) → Step 4: Passport + I-94 uploaded → Step 5: Review screen captured

### Step 5 extracted fields (verbatim from production)
```
Фамилия / Surname:        Testsurname    (Паспорт · MRZ, высокая точность)
Имя / Given Name:          Testgiven      (Паспорт · MRZ, высокая точность)
Отчество / Patronymic:     —              (Нет в загранпаспорте)
Дата рождения:             1985-07-12     (Паспорт · MRZ, высокая точность)
Пол:                       M              (Паспорт · MRZ, высокая точность)
Номер паспорта:            AB1234567      (Паспорт · MRZ, высокая точность)
Гражданство:               Ukraine        (Паспорт · MRZ, высокая точность)
I-94 Admission Number:     12345678901    (I-94 → OCR)
Дата въезда в США:         2024-03-15     (I-94 → OCR)
Статус при въезде:         —              (Не найдено — введите вручную) ← BUG P1
Категория EAD:             C19            (Устанавливается автоматически) ✓
```

### Code audit evidence
- `modules/passport.ts:334-357` — passport_expiration_date extraction confirmed
- `modules/i94.ts:206` — i94_class_of_admission extraction confirmed
- `TPSWizardV2.tsx:1625-1662` — merge logic copies fields as-is, no aliasing
- `TPSWizardV2.tsx:2544-2558` — review rows array, passport_expiration_date absent
- `GeneratePacketBlock.tsx:82` — V1 alias exists but not in V2
- `documentContracts.ts` — all 7 slot contracts verified

### Unit test evidence
- 45/45 test files pass (1832/1832 tests)
- `packetBuilder.test.ts` — 6 tests verify PDF prefill with AcroForm field read-back
- `controlledBetaLock.test.ts` — 4 tests verify passport selectors and 422/200 route contract
- `reparole/packetBuilder.test.ts` — 3 tests verify Cyrillic transliteration and I-131 field fill
- `documentContracts.test.ts` — contract enforcement verified

---

## Methodology

1. **Phase 1 (Code audit):** Read and verified all slot contract definitions, field maps, merge logic, and PDF builder code. No code changes.
2. **Phase 2 (Fixture inventory):** Classified all test documents as synthetic (safe) or real PII (blocked). Verified no real PII was used.
3. **Phase 3 (Browser walkthrough):** Uploaded synthetic passport and I-94 to production wizard. Captured OCR results, verified field values, provenance display, and edit controls.
4. **Phase 4 (This report):** Compiled evidence into document matrix with PASS/PARTIAL/FAIL/UNVERIFIED verdicts per document type.

All testing used synthetic fixtures only. No real PII was exposed or processed.
