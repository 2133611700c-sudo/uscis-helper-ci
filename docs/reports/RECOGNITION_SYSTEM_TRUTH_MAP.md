# Recognition System — Truth Map (LIVE / PARKED / LEGACY / TARGET)

**Date:** 2026-06-05. Evidence-first, read-only. A component is **LIVE** only if it is actually called on the
current production path; **PARKED** if it exists with 0 live callers; **LEGACY** if an older flow still
reaches it; **TARGET** if it is planned but not built. Caller counts verified by grep (relative-import note:
`antiFabricationGate`/`selfConsistency` are imported by `documentFieldReader` via relative path — LIVE behind
flags, not 0).

## The one live spine (what prod runs today, sha 951d4f6)

`route → readDocument (Gemini) → toCanonicalValue/post-passes → arbitrateDocument → gates → product adapter → review UI → PDF`

| Layer | Component | File | Status | Evidence | Risk | Next action |
|---|---|---|---|---|---|---|
| Door | `readDocument` | `lib/docintel/documentFieldReader.ts` | **LIVE** | 4 product routes call it (tps/translation/reparole/ead) | single point — but that's the goal | keep as the one door |
| D1 reader | Gemini vision provider | `lib/docintel/providers/geminiVisionProvider.ts` | **LIVE** | only caller = readDocument; model `gemini-3.1-pro-preview` | single reader, no cross-check | D1 ReaderResult contract (Phase 3) |
| D2 transliterate | KMU-55 / toCanonicalValue | `lib/canonical/vision/transliterationPolicy.ts` | **LIVE** | called per-field in readDocument | applied after read | keep |
| D2 dict (signal) | dictionaryBridge / snapCity / patronymic / authority | `lib/tps/dictionaryBridge.ts` (+ knowledge pkg) | **LIVE behind `SMART_NORMALIZE_ENABLED` (OFF in prod)** | 3 callers; flag OFF → signal only, no rewrite | none while OFF | keep OFF (DO_NOT_ENABLE) |
| Arbitration | arbitrateDocument | `lib/canonical/core/arbitration.ts` | **LIVE** | called by product routes after readDocument | — | keep |
| Gate | anti-fabrication | `lib/docintel/antiFabricationGate.ts` | **LIVE — flag ON in prod** | wired in readDocument (relative import); prod-runtime-observed 8/10 | coarse precision (all birth certs) | monitor false-positive review |
| Gate | self-consistency | `lib/docintel/selfConsistency.ts` | **LIVE — flag ON in prod** | wired in readDocument; mismatch caught live | N=2 reads cost on hard-case | monitor latency/cost |
| Metric | document_class_metric | `lib/docintel/documentClassMetric.ts` | **LIVE — flag ON** | emits on real prod extractions | PII-free by design | keep |
| Review gate | reviewGate / generate-pdf block | `lib/translation/reviewGate.ts`, `app/api/translation/generate-pdf/route.ts` | **LIVE** | 2 callers; blocks PDF on unresolved review | — | generalize across products (Phase 8) |
| D5 review UI | EvidenceReviewPage / TranslateWizard / OcrFieldEditModal | `app/.../review/EvidenceReviewPage.tsx`, `components/services/translation/TranslateWizard.tsx` | **LIVE** | surfaces review, correction, pay/PDF block | translation-specific | generalize component (Phase 8) |
| TPS merge | TPS central brain | `lib/tps/centralBrain.ts` | **LIVE (separate TPS plane)** | 3 callers — TPS merge/answers, NOT the docintel door | a second plane — naming confusion | document; do not duplicate |

## PARKED (exists, 0 live callers — do NOT treat as live)

| Component | File | Evidence | Note |
|---|---|---|---|
| OneBrain decideField | `lib/docintel/oneBrain/decideField.ts` | 0 callers; PARKED header; placeholder thresholds | revisit at GT ≥ ~50 fields / diff people (ADR-016) |
| consensus (multi-reader) | `lib/engine/consensus.ts` | 0 non-test callers | the "true consensus" brain — not built/wired |
| HTR | `lib/engine/htr.ts` | 0 callers; Transkribus auth blocked | research only, not a prod commitment |

## LEGACY BUT CALLABLE (older flows still reachable — touch with care)

| Component | File | Evidence | Note |
|---|---|---|---|
| central-brain + orchestrator | `lib/central-brain/index.ts`, `lib/engine/orchestrator.ts` | translation route has a `CENTRAL_BRAIN_TRANSLATION` branch, gated OFF in prod by `ONE_BRAIN_CORE_ENABLED=1` | dormant in prod; do not revive separately |
| GPT-4o / engine models | `lib/engine/models.ts` | referenced by legacy `app/api/ocr/extract/route.ts` + consensus | GPT-4o exists here, NOT on the live docintel path |
| legacy `/api/ocr/extract` | `app/api/ocr/extract/route.ts` | old OCR route | superseded by per-product extract routes |
| TPS product-specific OCR modules | `lib/tps/modules/*` (militaryId, passportBooklet, visionBridge) | reachable via TPS paths | the pre-docintel era; keep until fully migrated |

## TARGET (planned, not built) — see `docs/architecture/RECOGNITION_TARGET_ARCHITECTURE_D0_D6.md`
D0 quality/reshoot · D1 readers — **Gemini-first** (top Gemini versions near-term; a provider-agnostic DISABLED
slot for a future independent reader — GPT-4o/Claude/HTR are NOT near-term) via a ReaderResult contract · OneBrain
decideField wired (shadow-first) · D2 knowledge as signal · D3 translation lock · D4 validators · D5 generalized
review · D6 PDF · Auditor/provenance + correction→GT loop.

## One-line truth
Today = **a safety wrapper around one Gemini reader**, with review/PDF gating that works. The multi-reader
brain (OneBrain/consensus/HTR/GPT-4o) is **not built**. Build order: map → D0 → reader contract → shadow brain
→ validators → auditor. See `RECOGNITION_BUILD_PLAN_PHASES.md`.
