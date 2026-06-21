# SOURCE_OF_TRUTH.md
Purpose: define canonical modules. Prevent duplication. Stop re-litigation.

> **LIVE V1 PROGRAM TRACKER:** GitHub issue #159 "USCIS HELPER V1 — FINAL DELIVERY PROGRAM" is the single source of release-gate truth. DONE: #161 (OCR coordination wired to live path, off by default), #160 (isolated staging LIVE + runtime-proven — Supabase `rxnlpvldngxgdxkxoaaj` + Vercel preview, `V1_STAGING_READY=true`, ADR-023). PR #119 (Translation V2) = KEEP_DRAFT→REBUILD_FROM_MAIN→supersede. NEXT: product browser E2E (TPS first). Staging deploy = `.github/workflows/staging-deploy.yml` (`vercel deploy -e/-b`); staging DB provision = `.github/workflows/staging-provision.yml`. V1 verdict: **NOT_READY** (E2E/visual/Stripe-test/canary gates pending).

## Canonical normalization layer
- `packages/knowledge/src/dictionary.ts` — authorities, geography, field labels, oblasts, blocklist
- `packages/knowledge/src/normalize.ts` — normalizeName, normalizeDate, normalizeSex, normalizeAuthority, normalizePlace, validateOutput
- `packages/knowledge/src/transliterate.ts` — KMU-55 engine, date converter
These own: transliteration, authority names, historical policy, geography, USCIS output, conflicts.

## Canonical TPS data structure
- `apps/web/src/lib/tps/answers.ts` — TPSAnswers interface, 60+ fields

## Canonical OCR / extraction modules
- `apps/web/src/lib/tps/modules/passport.ts` — international passport MRZ
- `apps/web/src/lib/tps/modules/passportBooklet.ts` — internal passport (handwritten)
- `apps/web/src/lib/tps/modules/dl.ts` — driver license (address, eye/hair, controlling Latin names)
- `apps/web/src/lib/tps/modules/i94.ts` — I-94 (entry date, status, admission number)
- `apps/web/src/lib/tps/modules/ead.ts` — EAD card (A-number, category)
- `apps/web/src/lib/tps/modules/i797.ts` — I-797 notice (A-number, receipt#, uscis_online_account)
- `apps/web/src/lib/tps/modules/visionBridge.ts` — OCR→Knowledge→TPSAnswers bridge

## Canonical form maps
- `apps/web/src/lib/tps/forms/i765FieldMap.ts` — I-765 edition 08/21/25 (TPS pipeline)
- `apps/web/src/lib/ead/i765FieldMap.ts` — I-765 edition 08/21/25 (EAD wizard, sparse `EadFieldData`; UNIFICATION with the TPS map is documented-not-executed, kept separate until a golden-PDF parity harness exists — do NOT naively merge)
- `apps/web/src/lib/tps/forms/i821FieldMap.ts` — I-821 edition 01/20/25

## Product gate E2E (real-artifact proof, per product)
- TPS: `tests/e2e-ui/tps-golden-path.spec.ts` + `.github/workflows/staging-e2e-tps.yml` → real I-821(+I-765) ZIP. **CLOSED** (run 27853270531).
- EAD: `tests/e2e-ui/ead-golden-path.spec.ts` + `.github/workflows/staging-e2e-ead.yml` → real filled I-765 PDF via the live UI (EAD is FREE — no owner/Stripe gating). Hard acceptance = negative readiness + pypdf field-level checks (name/dob/category a+12/app-type/address/A-number blank/signature blank) + 7 pages + render/missing-page + staging-ref proof. Stable testids live on `apps/web/src/components/services/ead/EADWizard.tsx`. **CLOSED** (run 27885324248, 2026-06-20).
- Translation V2: REBUILD from main (supersede draft PR #119; forensic audit first, do NOT merge #119). Target full E2E: Stripe test → verified webhook (idempotency already on main via #184) → one order → upload → classify → quality → Cyrillic OCR (uk/ru separated; printed vs handwriting; uncertain critical → review_required+null) → translation candidate → operator review/correction (provenance) → approval → immutable PDF once → visual acceptance → exact stored bytes delivered. IN PROGRESS.

## Canonical PDF prefill
- `apps/web/src/lib/tps/pdfPrefiller.ts` — XFA-strip, AcroForm fill, WinAnsi safety

## Canonical transliteration (app-level, uses knowledge package)
- `apps/web/src/lib/tps/transliterate.ts` — WinAnsi-safe wrapper over KMU-55

## Canonical OCR entry point
- `apps/web/src/app/api/tps/ocr/extract/route.ts` — POST endpoint, dispatches to modules

## Canonical prompts
- `prompts/universal-document-extraction.md` — 10 document types, vision extraction
- `prompts/vision-extraction-prompt.md` — legacy, simpler version
- `prompts/translation-agent-system.md` — translation agent rules

## Rules that must never be bypassed
1. Patronymic = "Patronymic", NEVER "Middle Name"
2. Historical "Міліція" → "Militsiya", NEVER "Police" or "Militia"
3. Self-name on authority's own .gov.ua site beats third-party references
4. Controlling Latin spelling from MRZ/I-94/EAD beats retransliteration
5. Historical place names in old issuers must not be auto-modernized
6. "Вінницької області" auto-converts to "Vinnytsia Oblast" (DMS-verified)
7. "смт" = "urban-type settlement", NEVER "city" or "town"

## Deprecated paths — do not use
- Any ad-hoc transliteration outside `packages/knowledge` — superseded
- Any hardcoded authority name mapping outside `dictionary.ts` — superseded
- `docs/UKRAINE_TERMINOLOGY_DICTIONARY.md` (v1.0 from other agent) — superseded by v1.2 in `dictionary.ts`


## Canonical mail-ready gate
- `apps/web/src/lib/tps/mailReadyGate.ts` — blocks export on: empty required fields, unresolved spelling conflicts, low OCR confidence, invalid phone/email. Messages in EN/RU/UK.

## KNOWN BYPASS PATHS (must migrate to @uscis-helper/knowledge)
- `apps/web/src/lib/translation/glossary/agencyGlossary.ts` — OLD agency resolver. Uses "Militia Department" (violates ADR-004, should be "Militsiya")
- `apps/web/src/lib/translation/glossary/ukraine_agency_abbreviations.json` — OLD abbreviation data. Superseded by dictionary.ts
- `apps/web/src/lib/translation/glossary/civil_registry_terms.json` — OLD ЗАГС/РАЦС terms. Superseded by dictionary.ts
- `apps/web/src/lib/translation/glossary/nominativeCaseRestorer.ts` — OLD genitive→nominative. Superseded by normalizeOblastToNominative in knowledge
- **BUG:** translation glossary.test.ts line 47 expects "Militia Department" — must change to "Militsiya" per ADR-004
