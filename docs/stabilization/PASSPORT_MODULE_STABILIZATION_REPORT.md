# Passport Module Stabilization Report

**Module:** Ukrainian Internal Passport Booklet (`ua_passport_booklet`)  
**Date:** 2026-05-09  
**Commit:** `91f5161`  
**Vercel deployment:** `dpl_FWHpwemY3LegrXZuJ3AfzJxPTvRm` — READY  
**Production URL:** https://messenginfo.com

---

## Objective

Harden the Ukrainian internal passport booklet pipeline as the first production-grade document module before expanding to birth certificates or other document types. No new document types, no Stripe work, no UI redesign, no fake OCR, no PII logging.

---

## Phase Execution Summary

| Phase | Title | Status | Evidence |
|-------|-------|--------|----------|
| 0 | Baseline | ✅ DONE | TS 0 errors, 325 tests, build clean, guard 0 violations |
| 1 | Architecture inventory | ✅ DONE | 5 test files, 11 critical fields across 4 source files, gaps identified |
| 2 | `passportBookletContract.ts` | ✅ DONE | Created — single source of truth for 14 fields |
| 3 | Evidence storage tests | ✅ DONE | 101 new tests including evidence policy guards |
| 4 | Month exports + crossCheckDateZones | ✅ DONE | `UKRAINIAN_MONTHS`, `RUSSIAN_MONTHS`, `ALL_MONTHS` exported |
| 5 | Name safety tests | ✅ DONE | Patronymic label, no silent transliteration, Taras≠Sergiy |
| 6 | Glossary completeness | ✅ DONE (pre-existing) | 33 glossary tests, all required cases covered |
| 7 | Bilingual layer | ✅ DONE (pre-existing) | UA > RU priority, Russian fallback detection tested |
| 8 | PDF cleanliness | ✅ DONE | `npm run guard` → 0 violations (includes PDF phrase scan) |
| 9 | Mobile screenshots | ✅ DONE (pre-existing) | 8 screenshots at 375×812, audit in `SCREENSHOT_AUDIT.txt` |
| 10 | E2E smoke | ✅ DONE (pre-existing) | Full smoke: session→OCR→11 fields→certify→PDF, all pass |
| 11 | Privacy audit | ✅ DONE (pre-existing) | 0 PII in audit_logs, no secrets in source |
| 12 | Final typecheck/test/build/guard/push | ✅ DONE | See verification section below |
| 13 | Final report | ✅ THIS DOCUMENT | |

---

## What Was Built in This Stabilization Run

### `passportBookletContract.ts` (new file)

Path: `apps/web/src/lib/translation/passport/passportBookletContract.ts`

**Problem solved:** The 11 critical field definitions were scattered across 4 files with no single authoritative source. `field-mapper.ts` had them as a plain string array. `inputValidation.ts` had them as a `Set` using internal names. Tests had month maps defined inline. There was no typed record of display labels, validators, or review policy.

**What it provides:**
- `PassportFieldContract` type: typed record per field with `key`, `spec_label`, `display` (EN/RU/UK), `source_labels`, `expected_evidence`, `validators`, `review_policy`, `on_missing`, `allowed_zones`
- `PASSPORT_BOOKLET_CRITICAL_FIELDS` — 11 critical fields (immutable)
- `PASSPORT_BOOKLET_EXTENDED_FIELDS` — 3 extended fields (nationality, date_of_expiry, record_number)
- `PASSPORT_BOOKLET_ALL_FIELDS` — 14 fields total
- `INTERNAL_TO_SPEC` / `SPEC_TO_INTERNAL` maps for renamed fields:
  - `series` ↔ `passport_series`
  - `number` ↔ `passport_number`
  - `given_names` ↔ `given_name`
  - `issued_by` ↔ `issuing_authority`
- `crossCheckDateZones()` — detects date_of_birth / date_of_issue zone swaps (the most common field-swap error in passport extraction)
- `getDisplayLabel()` — multilingual label lookup
- `isCriticalPassportField()`, `isPassportBookletField()` — type-safe field guards

### Month map exports (updated file)

Path: `apps/web/src/lib/translation/numericAccuracy/dateFieldLockValidator.ts`

**Problem solved:** `UA_MONTHS` and `RU_MONTHS` were defined inline in the test file, meaning production code and tests used different objects. If a month was added to one, the other would diverge silently.

**What changed:** `UKRAINIAN_MONTHS`, `RUSSIAN_MONTHS`, `ALL_MONTHS` are now exported constants. Tests import from the validator. No inline duplication.

### Test import cleanup

Path: `apps/web/src/lib/translation/__tests__/ocr-accuracy.test.ts`

Removed inline `UA_MONTHS`, `RU_MONTHS`, `ALL_MONTHS` definitions. Now imports from `dateFieldLockValidator.ts` — production and test code share the same objects.

### `passportBookletContract.test.ts` (new file — 101 tests)

Path: `apps/web/src/lib/translation/__tests__/passportBookletContract.test.ts`

**Tests added:**

**Contract completeness (Phase 2):**
- Exactly 11 critical fields, 3 extended, 14 total
- No duplicate keys
- All 11 critical keys explicitly enumerated and verified
- Critical fields have `on_missing: 'block'` or `'warn_review'` (never `'skip'`)
- Extended fields have `on_missing: 'skip'`

**Evidence policy (Phase 3):**
- `series` / `number` → `expected_evidence: 'ocr_bbox'`
- `issued_by` / `date_of_birth` / `patronymic` → `expected_evidence: 'combined_ocr_bbox'`
- All critical fields are non-skippable when missing

**Date cross-check (Phase 4):**
- `crossCheckDateZones()`: clean zones → null, conflicting zones → string warning
- `date_of_birth` and `date_of_issue` allowed zones must not overlap (verified)
- Missing zones do not crash (returns null)

**Name safety (Phase 5):**
- `patronymic` display.en is `'Patronymic'` not `'Middle Name'`
- `analyseNameField('ТАРАС')` returns Cyrillic, not transliterated Latin
- `analyseNameField('Taras')` → `'Taras'` (not rewritten to `'Sergiy'` or `'Taras'`)
- Pure Cyrillic names not flagged; lookalike-only Latin names are flagged

**INTERNAL_TO_SPEC (Phase 5):**
- All 4 renamed fields verified (series, number, given_names, issued_by)
- SPEC_TO_INTERNAL round-trips correctly
- Coverage: 14 / 14 entries

**Month maps (Phase 4):**
- `UKRAINIAN_MONTHS`: 12 entries, all required
- `RUSSIAN_MONTHS`: 12 entries, all required
- `ALL_MONTHS`: 24 entries, no key collision between UA and RU sets

---

## Verification (Phase 12)

```
TypeScript:   0 errors
Tests:        426 / 426 pass (325 pre-existing + 101 new)
Build:        exit 0
Guard:        0 violations (reparole + content guards)
Git push:     main → 91f5161
Vercel:       dpl_FWHpwemY3LegrXZuJ3AfzJxPTvRm → READY
```

---

## Pre-existing Gaps NOT Fixed (and why)

| Gap | Reason deferred |
|-----|-----------------|
| Month maps not wired into production `normalizeDateUkrainian()` calls — production currently passes `{}` and lets DeepSeek normalize | DeepSeek Text already outputs normalized dates. The month map is the fallback for the zone-lock validator. Wiring would require changing the OCR pipeline contract — out of scope for stabilization. Flag for next sprint. |
| Russian month used in extraction → `review_required` not automatically set by pipeline | `normalizeDateUkrainian` returns `null` for Russian months when passed `UKRAINIAN_MONTHS` only. The pipeline should detect null → set `review_required`. Not implemented in production extraction code — detection is test-documented only. Out of scope for this stabilization. |
| `passportBookletContract.ts` not yet imported by `field-mapper.ts` or `inputValidation.ts` | Contract is authoritative spec now, not yet wired as the source for the allowed-field Set or field list. Wiring safely requires regression testing the full OCR pipeline. Schedule for next sprint after P001 pilot completes. |

---

## Architecture State After Stabilization

```
ua_passport_booklet pipeline
────────────────────────────

Photo upload
  ↓
Google Vision OCR → OcrResult (words + lines with stable IDs + bboxes)
  ↓
field-mapper.ts / mapFieldsWithDeepSeek
  → sends OCR token list to DeepSeek Text (NOT Vision)
  → DeepSeek returns: field + raw_value + normalized_value + ocr_ids + source_zone
  → nameNormalizer.analyseNameField() on name fields (mixed-script detection)
  → agencyGlossary.resolveIssuedBy() on issued_by
  ↓
bbox resolver → maps ocr_ids back to exact bboxes from OcrResult
  ↓
dateFieldLockValidator.validateDateFieldLock()
  → date_of_birth must come from birth_block / personal_data zones
  → date_of_issue must come from issuance_block / issue_block zones
  ↓
passportPerforationValidator.validatePassportPerforation()
  → series: 2 Cyrillic letters; number: 6 digits
  → ambiguous digits 0/8, 1/7, 6/9 flagged at confidence < 0.90
  ↓
ExtractedField[] written to DB (extracted_fields table)
  → critical fields always present (placeholder rows if OCR missed them)
  → review_required = true for any suspicious field
  ↓
Evidence Review UI (user confirms or corrects each field)
  → user_corrections written to DB with correction_class
  ↓
Certification gate (all critical fields confirmed)
  ↓
Completeness audit (confirmed values match expected normalized form)
  ↓
Payment gate
  ↓
PDF render (2 pages: translation + certification block)
  → No source trace in customer PDF
  → No OCR metadata in customer PDF
  → 8 CFR §103.2(b)(3) self-certification

──────────────────────────────────
Contract (passportBookletContract.ts) is the single source of truth
for field definitions, labels, validators, and review policy.
It is NOT YET wired into the pipeline — wiring is next sprint work.
──────────────────────────────────
```

---

## Next Steps (Post-Stabilization)

1. **Wire contract into `inputValidation.ts`**: Replace `UA_PASSPORT_ALLOWED_FIELDS` Set with `PASSPORT_BOOKLET_FIELD_KEYS` from contract. This eliminates the second definition.

2. **Wire contract into `field-mapper.ts`**: Replace `UA_INTERNAL_FIELDS` array with `PASSPORT_BOOKLET_ALL_FIELDS.map(f => f.key)`. Single source of truth for field extraction targets.

3. **Russian month detection**: When `normalizeDateUkrainian(raw, UKRAINIAN_MONTHS)` returns null but `normalizeDateUkrainian(raw, ALL_MONTHS)` returns a date → set `review_required: true` with `review_reason: 'russian_layer_fallback_used'`.

4. **P001 pilot**: Create Stripe 100% coupon → send link → collect PDF QA result → GO/NO-GO for general release.

5. **Birth Certificate module**: Begin only after P001 GO decision. Prerequisite: at least 3 anonymized birth certificate samples (new format + Soviet-era + handwritten).
