# D0 — Document Image Quality / Reshoot (implemented behind flag OFF)

**Date:** 2026-06-05. First real "brick" of the recognition pipeline (Phase 1 / Gate 1). A bad photo breaks
everything downstream, so D0 decides — before any model spend — whether a photo is usable or needs a retake.
**Flag `QUALITY_GATE_ENABLED` default OFF → prod behavior byte-identical.** No model call, no PII, no provider/HTR/OneBrain change.

## What was implemented
- **Pure decision module** `apps/web/src/lib/docintel/quality/documentImageQuality.ts`:
  - `decideImageQuality(metrics) → { decision, signals[], review_required, reshoot_required, user_message_key, algorithm_version }`.
  - `decision ∈ { ACCEPT, DEGRADED_REVIEW, RESHOOT_REQUIRED }`.
  - Reuses the metrics already produced by `lib/ocr/image-preprocess` (brightness, blurScore, width, height) —
    **does not duplicate** extraction. `metricsFromPreprocess()` adapts the existing `PreprocessResult.quality`.
  - `isQualityGateEnabled()` (flag, default OFF). `RESHOOT_MESSAGES_RU` = large-print reshoot copy.
- **Inert wiring** in `app/api/translation/vision-extract/route.ts`: a guarded block right after preprocess.
  **Flag OFF ⇒ the block is skipped ⇒ byte-identical.** Flag ON ⇒ a `RESHOOT_REQUIRED` photo returns a reshoot
  instruction (HTTP 200, `status:'reshoot_required'`, `message_key`) **before** OCR.

## Thresholds (documented, calibratable — not magic)
Consistent with existing preprocess (`too_dark<40`, `overexposed>245`, `too_small<600`):
- blur (Laplacian stdev): fail `<5`, warn `<12`.
- brightness: fail `<40` or `>245`; warn `<70` or `>235`.
- min dimension: fail `<600`, warn `<900`.
- crop_bounds / contrast / orientation / document_visibility: **not measured yet** → emitted as `ok / not_measured`
  placeholders; they never force a verdict. (Future D0 work.)

## Hard rule honored
**Blur (or any quality signal) is NEVER an anti-fabrication signal.** The result carries no fabrication field;
a test asserts the output contains no `fabricat*` / `anti_fab` / `identity` text. Quality = image usability only.

## Evidence
- `tsc --noEmit`: **0 errors**.
- D0 unit tests: **16 passed** (`documentImageQuality.test.ts`).
- Full web suite: **2875 passed / 4 skipped** (was 2859 + 16 new) — **flag OFF = no existing test broke** =
  byte-identical default behavior.
- Decision examples (synthetic metrics, no PII):
  - `{blur 40, bright 130, 2000×1500}` → ACCEPT.
  - `{blur 3}` → RESHOOT_REQUIRED, `photo_blurry`.
  - `{bright 30}` → RESHOOT_REQUIRED, `photo_dark`.
  - `{500×400}` → RESHOOT_REQUIRED, `photo_low_resolution`.
  - `{blur 9}` / `{bright 60}` → DEGRADED_REVIEW (continue + review).

## Confirmations
- **No prod flag enabled.** `QUALITY_GATE_ENABLED` is unset in prod; default OFF.
- No model/provider/HTR/OneBrain/SMART change. No prod env/deploy change. No PII. qa-private not touched.

## Limitations / next
- Only blur/brightness/resolution are measured today; crop_bounds/contrast/orientation/document_visibility are
  placeholders for the next D0 increment.
- UI reshoot copy exists as keys + RU strings; **full locale/UI wiring is a small follow-up** (not overbuilt now).
- The inert hook is wired only into the Translation `vision-extract` route; generalizing to TPS/Re-Parole/EAD
  intake is a follow-up once the verdict shape is validated.
- **Next (Gate 2):** ReaderResult interface. Then OneBrain shadow-only. Enabling `QUALITY_GATE_ENABLED` in prod
  is a separate owner decision after a local/browser proof.
