# ACTUAL_PRODUCT_CALL_GRAPH

Date: 2026-06-03
Scope: source-code-only audit of `apps/web` and `packages/knowledge`
Ignored: `.next`, `node_modules`, `dist`, `coverage`, `.turbo`

## Verdict

The repository does **not** currently run one uniform central Document Core across TPS, Translation, Re-Parole, and EAD.

What exists at runtime is a mixed state:

- TPS: partial Core path for `passport` and `booklet` only, inside `/api/tps/ocr/extract`.
- Translation: optional Core path behind `ONE_BRAIN_CORE_ENABLED`, but it stops at `CanonicalField[]` and does **not** build `CanonicalDocumentResult`.
- Re-Parole: optional Core route for `passport` and `booklet` only; `i94`/`ead`/`dl` still bypass to TPS legacy route.
- EAD: optional Core route, but only when both UI and server flags are enabled.

Also important:

- `readDocumentCore()` exists in `apps/web/src/lib/canonical/core/readDocumentCore.ts` but is **not called by any product route**.
- There is no runtime `DocumentProfile` symbol in the active OCR stack. The real runtime equivalent is `DocTypeSpec` from `apps/web/src/lib/docintel/documentRegistry.ts`, retrieved by `getDocTypeSpec()`.

## Shared Runtime Spine Actually Used

Actual shared OCR spine:

`UI -> route -> preprocessImage -> readDocument -> getDocTypeSpec -> GeminiVisionProvider.readFields -> toCanonicalValue -> ExtractedDocField[]`

Core-enabled routes then continue with:

`ExtractedDocField[] -> docintelToCandidate -> arbitrateDocument -> CanonicalField[] -> product adapter/response`

Notably absent from live product wiring:

- `readDocumentCore()`
- a universal `CanonicalDocumentResult` build for all products
- a single shared adapter contract across all products and document classes

## Product Call Graphs

### 1. TPS

UI entrypoints:

- `apps/web/src/components/tps/DocumentUploadScreen.tsx`
- `apps/web/src/app/[locale]/services/tps-ukraine/start/TPSWizardV2.tsx`

Route:

- `apps/web/src/app/api/tps/ocr/extract/route.ts`

Actual graph when `ONE_CORE_TPS_ENABLED === '1'` and `docHint` maps to `passport|booklet`:

`TPS UI -> /api/tps/ocr/extract -> preprocessImage -> googleVision/docAI OCR for raw text -> readDocument -> getDocTypeSpec -> GeminiVisionProvider.readFields -> toCanonicalValue -> ExtractedDocField[] -> docintelToCandidate -> mrzCandidatesFromText(passport only) -> arbitrateDocument -> CanonicalField[] -> canonicalToTpsModuleResult -> applyContract -> postExtractNormalize -> documentClassPolicy guards -> response`

Actual graph when Core does not apply:

`TPS UI -> /api/tps/ocr/extract -> preprocessImage -> OCR provider -> legacy module switch (runPassportModule | runPassportBookletModule | runI94Module | runEadModule | runDlModule | runI797Module | runMilitaryIdModule | runBirthCertificateModule) -> optional readBookletViaVision / runDualOcrCrossref / runBrain -> applyContract -> postExtractNormalize -> documentClassPolicy guards -> response`

TPS-specific findings:

- Core only maps `passport` and `booklet` through `mapTpsHintToDocintelId()`.
- `military_id` and `birth_certificate` use legacy TPS modules only.
- `i94`, `ead`, `dl`, `i797`, `tps_notice`, `i797_or_ead`, `ead_old` all bypass Core.
- TPS does not build `CanonicalDocumentResult` on the live path; it converts `CanonicalField[]` straight to `TpsModuleResult`.

### 2. Translation

UI entrypoint:

- `apps/web/src/components/services/translation/TranslateWizard.tsx`

Route:

- `apps/web/src/app/api/translation/vision-extract/route.ts`

Legacy/default graph:

`TranslateWizard -> /api/translation/vision-extract -> preprocessImage (per page) -> readDocument -> getDocTypeSpec -> GeminiVisionProvider.readFields -> toCanonicalValue -> merge earliest non-empty field values -> documentClassPolicy guards -> response`

Optional central-brain graph:

`TranslateWizard -> /api/translation/vision-extract -> analyze(central-brain) -> consensus output -> response`

Optional Core graph when `ONE_BRAIN_CORE_ENABLED === '1'`:

`TranslateWizard -> /api/translation/vision-extract -> readDocument (per page) -> getDocTypeSpec -> GeminiVisionProvider.readFields -> toCanonicalValue -> buildCyrillicMap -> docintelToCandidate -> arbitrateDocument -> CanonicalField[] -> toTranslationRows -> documentClassPolicy guards -> response`

Translation-specific findings:

- Translation Core path does **not** construct `CanonicalDocumentResult`.
- Translation uses `CanonicalField[] -> toTranslationRows`, not `CanonicalDocumentResult -> adapter`.
- Translation still has a central-brain route that is parallel to Core, which is a separate decision path.
- Translation doc coverage exceeds live docintel/Core coverage at the UI layer, so many translation document types remain manual or non-Core.

### 3. Re-Parole

UI entrypoint:

- `apps/web/src/app/[locale]/services/re-parole-u4u/start/ReparoleWizardV2.tsx`

Route:

- `apps/web/src/app/api/reparole/ocr/extract/route.ts`

UI route selection:

- `passport|booklet` use `/api/reparole/ocr/extract` only when `NEXT_PUBLIC_ONE_CORE_REPAROLE_ENABLED === 'true'`
- `i94|ead|dl` always use `/api/tps/ocr/extract`

Core graph when both UI and server flags are on:

`ReparoleWizardV2 -> /api/reparole/ocr/extract -> preprocessImage -> readDocument -> getDocTypeSpec -> GeminiVisionProvider.readFields -> toCanonicalValue -> docintelToCandidate -> googleVisionProvider.extractText(passport only, parallel raw MRZ text) -> mrzCandidatesFromText(passport only) -> arbitrateDocument -> CanonicalField[] -> CanonicalDocumentResult -> toReParoleCoreAnswers -> response`

Bypass graph for uncovered slots or flag-off state:

`ReparoleWizardV2 -> /api/tps/ocr/extract -> TPS legacy/Core mix`

Re-Parole-specific findings:

- This is the cleanest `CanonicalDocumentResult` product path among the four.
- It still covers only `passport` and `booklet`.
- `i94`, `ead`, and `dl` are explicit bypasses to TPS route.

### 4. EAD

UI entrypoint:

- `apps/web/src/components/services/ead/EADWizard.tsx`

Route:

- `apps/web/src/app/api/ead/ocr/extract/route.ts`

UI graph when `NEXT_PUBLIC_ONE_CORE_EAD_ENABLED === 'true'`:

`EADWizard -> /api/ead/ocr/extract -> preprocessImage -> readDocument -> getDocTypeSpec -> GeminiVisionProvider.readFields -> toCanonicalValue -> docintelToCandidate -> arbitrateDocument -> CanonicalField[] -> CanonicalDocumentResult -> toEadAnswers -> response`

Flag-off behavior:

- UI upload prefill step is hidden.
- No alternate OCR route inside EAD product replaces it.

EAD-specific findings:

- EAD does build `CanonicalDocumentResult`.
- EAD route supports `passport`, `booklet`, `ead/i766`, `i94`, `i797` in its local hint map.
- There is no MRZ authority injection in EAD route, unlike TPS and Re-Parole.

## Required Chain Check

Required by audit:

`UI -> API route -> preprocess -> OCR/Gemini/Vision -> readDocumentCore/CanonicalDocumentResult -> DocumentProfile -> libraries -> adapter -> response`

Actual result:

- `preprocess`: present in all four OCR routes.
- `OCR/Gemini/Vision`: present in all four routes.
- `readDocumentCore`: not used in live product routes.
- `CanonicalDocumentResult`: used in Re-Parole and EAD, not used in Translation Core path, not used in live TPS Core path.
- `DocumentProfile`: no runtime symbol; replaced in practice by `DocTypeSpec` / `getDocTypeSpec()`.
- `libraries`: partially shared, partially legacy-only.
- `adapter`: present, but product-specific and unevenly wired.

## Runtime Bypasses

### Product-level bypasses

- TPS route bypasses Core for `i94`, `ead`, `dl`, `i797`, `tps_notice`, `i797_or_ead`, `ead_old`, `military_id`, `birth_certificate`.
- Translation bypasses Core when `ONE_BRAIN_CORE_ENABLED !== '1'`; can also take `central-brain` path.
- Re-Parole bypasses Core for `i94`, `ead`, `dl` even when feature flag is on.
- Re-Parole bypasses entire Re-Parole Core route when `NEXT_PUBLIC_ONE_CORE_REPAROLE_ENABLED !== 'true'` or server flag is off.
- EAD bypasses Core entirely when UI/server flags are off.

### Architecture-level bypasses

- `readDocumentCore()` is unused.
- `readCanonicalDocumentFromTps()` is used only by shadow tooling, not live product routing.
- `readCanonicalDocumentFromTranslation()` is test-only.

## Bottom Line

The repo has a real shared substrate:

- `documentRegistry.ts`
- `documentFieldReader.ts`
- `transliterationPolicy.ts`
- `arbitrateDocument()`
- product adapters

But the system is still a hybrid. The source does **not** prove one central Document Core uniformly serving TPS, Translation, Re-Parole, and EAD at runtime.
