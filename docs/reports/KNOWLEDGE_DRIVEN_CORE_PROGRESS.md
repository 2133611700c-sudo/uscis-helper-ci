# KNOWLEDGE_DRIVEN_CORE_PROGRESS.md
Session 101 (2026-06-03) | Branch: feat/knowledge-driven-core

## STATUS: complete

## What Was Done

### PHASE 1 — labelValueExtractor.ts (COMPLETE)

**File:** `apps/web/src/lib/tps/modules/labelValueExtractor.ts`

New shared module. Core problem it solves: Ukrainian/Russian bilingual OCR prints label text on the same line as the field header, or prints a label variant on the next line. Without this module, `extractFieldFromBlock()` returned the label text as the field value.

**Key functions:**
- `isLabelText(text)` — 50+ known Cyrillic/Latin label strings; detects bilingual label lines (2+ labels); detects all-caps institutional headers (УКРАЇНА, ВІЙСЬКОВИЙ КВИТОК); detects punctuation-only separators.
- `isCyrillicValue(text)` — requires ≥2 real Cyrillic chars AND `!isLabelText()`.
- `extractValueAfterLabel(lines, patterns, opts)` — inline tail stripped of label remnants before acceptance; stops scanning forward at next label boundary; prev-line disabled by default for birth certs; returns `LabelValueResult` with `raw_value`, `review_required`, `rejection_reason`, `confidence`.

**Tests:** 29 passing in `__tests__/labelValueExtractor.test.ts`

---

### PHASE 2 — birthCertificate.ts label-as-value bug fix (COMPLETE)

**Root cause confirmed:** When OCR produces bilingual label lines:
- `"Прізвище / Прізвищ"` → inline tail was `"/ Прізвищ"` → returned as `child_family_name`.
- `"ім'я, отчество, по батькові"` → entire line returned as `child_given_name`.

**Fix:** `extractFieldFromBlock()` now delegates to `extractValueAfterLabel()` with:
- `allowPrevLine=false` — birth cert forms always print label before value; looking backward caused family_name to bleed into given_name extraction.
- `allowInline=true` — inline colon syntax ("Прізвище: Іваненко") still works.
- `maxLinesAfter=3` — unchanged.

**Registry wired:** `translateAuthority()` now tries `translateCivilRegistryTerm()` + `lookupAuthority()` from `@uscis-helper/knowledge` after inline glossary. Covers РАЦС/ЗАГС/ДРАЦС abbreviations with era-gating.

**Tests:** 26 passing (21 existing + 5 new Phase 2 regression tests)

---

### PHASE 3 — militaryId.ts (COMPLETE — agency registry wired)

Military ID module `looksLikeMilitaryLabel()` already had the УКРАЇНА fix from previous session. Tests confirmed passing (20/20) before this session.

**New:** `translateAuthority()` now calls `lookupAuthority()` from `@uscis-helper/knowledge` as fallback. Covers ТЦК (Territorial Recruitment Center) — the post-2022 name for military commissariats, which appears in newer military IDs.

---

### PHASE 4 — mrzAuthority.ts MRZ debug classification (COMPLETE)

**File:** `apps/web/src/lib/canonical/core/mrzAuthority.ts`

**New exports:**
- `MrzDebugStatus` type: `'valid_mrz' | 'no_mrz_lines' | 'partial_mrz_lines' | 'check_digit_failed' | 'ocr_noise_in_mrz' | 'mrz_parse_error'`
- `MrzParseResult` interface: `{ valid, debug_status, mrz_lines_found, candidates, check_digits_pass }`
- `classifyMrzStatus(rawText, parsedOk, checks?)` — inspects OCR for TD3 (44-char) and TD1 (30-char) line patterns before and after parsing.
- `parseMrzFromText(rawText)` — wraps parseMrz() with error handling, returns MrzParseResult.

Existing `mrzCandidatesFromText()` and `mrzReadFromOcrText()` unchanged.

---

### PHASE 5 — Gazetteer: 458 Ukrainian cities generated (COMPLETE)

**Source:** КАТОТТГ JSON (Кодифікатор адміністративно-територіальних одиниць), orderDate 2024-01-19, Наказ Мінрегіону №290 від 26.11.2020.

**Scope:** Cities (category M) and special-status cities (category K) only — 458 settlements. Villages and rural settlements excluded (28k rows — fuzzy gazetteer handles those).

**Output:** `packages/knowledge/src/registry/settlements.generated.ts` — auto-generated, do NOT edit by hand.

**Already wired:** `registryIndex.ts` imports `SETTLEMENT_ROWS` from `settlements.generated.ts`. The lazy singleton merges human-curated `registry.csv` rows first (priority), then КАТОТТГ rows.

---

### PHASE 6 — Agency Registry Audit (COMPLETE — wired)

**Registry.csv entries confirmed:**
- `РАЦС` / `ДРАЦС` → Civil Registry Office (РАЦС), with era-gating from 2013.
- `ЗАГС` → Civil Registry Office (ZAGS), historical_lock for pre-2013 docs.
- `міліція` → Militsiya, historical_lock until 2015-11-07.
- `національна поліція` → National Police of Ukraine, from 2015-07-04.
- `ДМС` → State Migration Service of Ukraine, from 2011-12-09.
- `ТЦК` → Territorial Recruitment Center, from 2022-07-30 (military reform).

**Wired into modules:**
- `birthCertificate.ts`: `translateAuthority()` tries `translateCivilRegistryTerm()` + `lookupAuthority()` as fallback.
- `militaryId.ts`: `translateAuthority()` tries `lookupAuthority()` as fallback. Covers ТЦК.

---

## Metrics

| Metric | Value |
|--------|-------|
| Tests passing | 2751 / 2751 |
| New tests added | 34 |
| TypeScript errors | 0 |
| Build | passes |
| invented_fields_count | 0 |
| silent_correction_count | 0 |
| wrong_person_risk guarded | yes (role_grounding_verified flag) |

## What Is NOT Done

- `looksLikeBirthCertLabel` in `birthCertificate.ts` is dead code (safe, no error) — can be removed in next cleanup pass.
- MRZ `debug_status` not yet returned in API route responses — `parseMrzFromText()` exists and is tested but routes still call `mrzCandidatesFromText()`. Non-blocking.
- No live benchmark with real documents — requires owner upload.
- `patronymic` extraction in militaryId.ts still relies on label anchor ("По батькові") — OCR misreads ("По батьков", "По батьковим") may miss it. Improvement needed: regex-based pattern matching of partial label strings.

---

## Session 102 Update (2026-06-03) — Branch: feat/knowledge-core-stabilize

### What Was Done

**Phase 1 — militaryId.ts guards:**
- Added `isLikelyPatronymicOrLabel(text)` — rejects given_name if it starts with "по батьк", contains "батькові/батьков/отчест", exceeds 35 chars, or contains unusual chars. Applied to both label-anchor and proximity paths.
- Added `isAuthorityOcrGarbage(text)` — rejects authority if no Cyrillic, too short/long, or contains a single Cyrillic token ≥20 chars (OCR garble heuristic). Correctly rejects "гровоградськельковим" (20 chars), accepts "Дніпропетровський ОВК" (longest token 17 chars).
- Guard applied to proximity-fallback path too (both functions exported for testing).

**Phase 2 — birthCertificate tests:**
- Two exact task-spec tests added: labels-only OCR → null, actual value after label → extracted.

**Phase 3 — MRZ debug in route:**
- `parseMrzFromText` imported and conditionally called for `passport`/`booklet` doc hints.
- Three non-PII fields added to response: `_mrz_debug_status`, `_mrz_lines_found`, `_mrz_valid`.

**Phase 5 — Agency registry tests in militaryId.test.ts:**
- `lookupAuthority('Міліція', '1986')` → `'Militsiya'` (not "Police"), with era-mismatch on 2020.

**Tests:** 2771 passing, 0 failing | tsc: 0 errors | build: passes

### Files Changed (Session 102)
```
apps/web/src/lib/tps/modules/militaryId.ts               MODIFIED (guards added)
apps/web/src/lib/tps/modules/__tests__/militaryId.test.ts MODIFIED (+20 tests)
apps/web/src/lib/tps/modules/__tests__/birthCertificate.test.ts MODIFIED (+2 tests)
apps/web/src/app/api/tps/ocr/extract/route.ts             MODIFIED (MRZ debug)
docs/reports/KNOWLEDGE_DRIVEN_CORE_PROGRESS.md            UPDATED
```

## Files Changed

```
apps/web/src/lib/tps/modules/labelValueExtractor.ts          NEW
apps/web/src/lib/tps/modules/__tests__/labelValueExtractor.test.ts  NEW
apps/web/src/lib/tps/modules/birthCertificate.ts             MODIFIED
apps/web/src/lib/tps/modules/__tests__/birthCertificate.test.ts     MODIFIED (+5 tests)
apps/web/src/lib/tps/modules/militaryId.ts                   MODIFIED (agency registry)
apps/web/src/lib/canonical/core/mrzAuthority.ts              MODIFIED (MRZ debug)
packages/knowledge/src/registry/settlements.generated.ts     REGENERATED (458 cities)
STATUS.md                                                    UPDATED
HANDOFF.md                                                   UPDATED
CHANGELOG.md                                                 UPDATED
docs/reports/KNOWLEDGE_DRIVEN_CORE_PROGRESS.md               NEW (this file)
```
