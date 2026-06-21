# P7 — Gates Verification Report
**Date:** 2026-05-27
**Session:** 33
**Base SHA at report time:** (see git log)
**Test suite:** 2092/2092 pass, 0 type errors

## G1 — Provider separation: OCR = image only, DeepSeek = text only
**STATUS: PASS**
- Google Vision: `apps/web/src/lib/ocr/providers/google-vision.ts` — sends image bytes only ✅
- Google DocAI: `apps/web/src/lib/docai/client.ts` — sends document bytes only, behind `isDocAIEnabled()` flag ✅
- DeepSeek: `apps/web/src/lib/tps/ai/documentBrain.ts` — takes `text: string`, never image ✅
- Evidence: ADR-009 audit table rows: Google image-only ✅, DeepSeek text-only ✅

## G2 — Central Brain contract applied for form path
**STATUS: PASS**
- `documentContracts.ts` booklet allowed_fields enforced by `applyContract()` in CB
- `issued_by` and `passport_date_of_issue` explicitly in `forbidden_fields` with comment
- Test: centralBrain.test.ts validates contract rejection behavior ✅

## G3 — Translation Mode path exists (bypasses CB form contract)
**STATUS: PASS**
- `translationExtractor.ts` built: cb_merged → cb_rejected → manual priority chain
- Fields blocked by form contract (given_name, sex, passport_number) flow via `rejected[]`
- Test: translationExtractor.test.ts 21 tests ✅

## G4 — DOB format: "June 25, 1986" (not ISO/US/dot format)
**STATUS: PASS**
- `formatDobForTranslation()` handles YYYY-MM-DD, MM/DD/YYYY, DD.MM.YYYY
- Applied in both `translateBookletFromBrain` (primary) and `mapTPSToBookletFields` (fallback)
- Test: translationExtractor.test.ts DOB tests, translationBridge.brain.test.ts updated ✅

## G5 — Safety guard blocks forbidden phrases before Renderer
**STATUS: PASS**
- `translationCandidateSafetyGuard.ts` integrated into `translateBookletFromBrain`
- Returns early with violations[] when guard fails
- Test: translationCandidateSafetyGuard.test.ts 20 tests ✅

## G6 — Patronymic labeled "Patronymic" NEVER "Middle Name"
**STATUS: PASS**
- `PASSPORT_BOOKLET_FIELD_LABELS.patronymic = 'Patronymic'` ✅
- `FORBIDDEN_PHRASES` includes 'Middle Name' ✅
- Safety guard blocks 'Middle Name' in any field ✅
- Test: translationBridge.brain.test.ts "not Middle Name" assertion ✅

## G7 — Pre-2015 militsiya agencies = "Militsiya" NOT "Police"
**STATUS: PASS**
- `agencyGlossary.ts` MILITIA_ERA_ABBRS set enforces militsiya-era units ✅
- `translationCandidateSafetyGuard.ts` blocks "Police Department", "Militia" pattern, "passport police" ✅
- `FORBIDDEN_PHRASES` includes 'Police Department', 'passport police' ✅
- ВМ → "Militsiya Department" in glossary with explicit note ✅
- Test: translationCandidateSafetyGuard.test.ts "Police Department", "Militia" tests ✅

## G8 — issued_by extracted from booklet OCR
**STATUS: PASS**
- `passportBooklet.ts`: label-based extraction for "Орган, що видав" / "Орган выдавший" / "Authority" ✅
- `documentContracts.ts`: `issued_by` in booklet `forbidden_fields` (form path) ✅
- `translationExtractor.ts`: picks up `issued_by` from `rejected[]` ✅

## G9 — date_of_issue extracted from booklet OCR
**STATUS: PASS**
- `passportBooklet.ts`: label-based extraction for "Дата видачі" / "Дата выдачи" / "Date of issue" ✅
- `parseUaDate()` applied → ISO format ✅
- `formatDobForTranslation()` converts to "Month DD, YYYY" for display ✅
- `documentContracts.ts`: `passport_date_of_issue` in booklet `forbidden_fields` ✅

## G10 — Review Gate: reviewConfirmed required (8 CFR §103.2(b)(3))
**STATUS: PASS**
- `TranslationReviewGate.tsx` component built with 4-locale support ✅
- `packetBuilder.ts`: translation excluded from ZIP when `reviewConfirmed !== true` ✅
- `/api/tps/translation/preview`: preview endpoint for gate UI ✅
- Wizard: "Review Translation" button → preview → modal gate → confirm ✅

## G11 — Translation HTML in ZIP only after reviewConfirmed
**STATUS: PASS**
- `packetBuilder.ts` line: `const reviewConfirmed = translationOpts.reviewConfirmed === true`
- `if (result && result.violations.length === 0 && reviewConfirmed)` guards ZIP insertion ✅

## G12 — Agency glossary coverage ≥ 40 entries
**STATUS: PASS**
- `ukraine_agency_abbreviations.json`: 49 entries (target was ~50) ✅
- Covers: MVS/MVD era (pre-2015), DMS era (2012+), NPU era (2015+), RACS/DRACS, CNAP, historical units

## G13 — International passport translation non-null
**STATUS: PASS**
- `generateTPSTranslation()` now implements 'internationalPassport' template case ✅
- Was returning null — now produces full translation + certification HTML ✅
- `shouldTranslateForTPSPacket('passport')` returns true ✅

---

## Overall: 13/13 gates PASS
**Production readiness note:** G10 (Review Gate) is built in code but requires end-to-end browser verification (Playwright) to confirm the full review→confirm→generate flow works in the live UI. Until that verification run is completed, the production status remains DEGRADED per CLAUDE.md standards.

## Remaining OPEN items (not gates — operational)
- Image retention audit (ADR-009): temp files, Vercel logs, Supabase ZIP storage not fully traced
- DeepSeek privacy disclosure UI: required pre-production, not yet added to wizard
- P2.5: Google Vision/DocAI benchmark (needs 5 real documents)
- P4: Multi-sample robustness
- End-to-end Playwright test for Review Gate flow
