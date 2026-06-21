# ADR-008: TPS Translation Pipeline — Provider Architecture
Status: Accepted
Date: 2026-05-27

## Context

The TPS Translation Pipeline uses multiple external and internal providers for OCR, text analysis, and controlled rendering. Previous sessions had ambiguous provider roles. This ADR fixes the canonical stack to prevent provider scope creep and data policy violations.

## Decision: Provider Stack (LOCKED)

### Google Vision API
- Role: **Primary OCR** — extracts raw text from document images
- Input: image bytes only (JPEG/PNG/PDF page renders)
- Output: raw OCR text, bounding boxes
- Status: ACTIVE — production default
- Module: `apps/web/src/lib/ocr/providers/google-vision.ts`
- Data policy: image bytes only; no PII fields sent as structured data

### Google DocAI
- Role: **Optional structured extraction** — alternative OCR with field detection
- Input: image bytes only
- Output: structured field key/value pairs
- Status: **AVAILABLE BEHIND FLAG / NOT DEFAULT**
  - Flag: `isDocAIEnabled()` in `apps/web/src/lib/docai/client.ts`
  - DO NOT enable as default until benchmark proof (P2.5) confirms accuracy improvement
- Data policy: same as Vision — image bytes only

### DeepSeek (text-only)
- Role: **Text helper** — assists rule modules with ambiguous text patterns
- Input: raw OCR text strings ONLY
- Output: structured field candidates
- Status: ACTIVE — feature-flagged (`TPS_AI_BRAIN_ENABLED`)
- Modules:
  - `apps/web/src/lib/tps/ai/documentBrain.ts` — field extraction helper
  - `apps/web/src/lib/tps/ai/dualOcrCrossref.ts` — Vision+DocAI cross-reference
- Data policy constraints (HARD RULES):
  - NEVER send image bytes to DeepSeek
  - NEVER send raw PII field values as structured inputs (structured OCR text is acceptable)
  - Privacy disclosure REQUIRED before production enable

### Central Brain
- Role: **Single decision layer** — merges all extraction candidates, resolves conflicts, assigns confidence
- Input: field candidates from all rule modules + DeepSeek helpers (PARALLEL, not sequential)
- Output: `CentralBrainResult` with `merged: Record<string, MergedField>`
- Status: ACTIVE
- Module: `apps/web/src/lib/tps/centralBrain.ts`
- Principle: Central Brain is the ONLY module that produces final field values for forms
- CRITICAL: For **Translation Mode**, Central Brain result feeds `translationExtractor.ts` (not the form contract path)

### KMU-55 + dictionaryBridge
- Role: **Controlled transliteration** — name/patronymic romanization per CMU-55 standard
- Input: Cyrillic name strings
- Output: Latin transliteration
- Status: ACTIVE
- Module: `apps/web/packages/knowledge/` (single source of truth)
- HARD RULE: Names and patronymics MUST use KMU-55. NEVER use LLM for name transliteration.

### Controlled Translation Renderer
- Role: **Deterministic HTML generator** — NOT a translator. Applies KMU-55 + glossary + rules to produce USCIS-format translation
- Input: `translationExtractor.ts` output (all fields for translation, not just form fields)
- Output: Translation HTML + Certification HTML + forbidden_phrase_violations[]
- Status: CODE EXISTS — needs post-wire proof per P0
- Module: `apps/web/src/lib/tps/translationBridge.ts` + `apps/web/src/lib/translation/templates/passportBooklet.template.ts`

### Review Gate
- Role: **Certification boundary** — mandatory user checkpoint before translation enters ZIP
- Legal basis: 8 CFR §103.2(b)(3) — translator must certify competence + accuracy
- Status: **NOT BUILT** — P3 BLOCKER. No translation may be delivered as final without this gate.
- Principle: `reviewConfirmed: true` required in `packetBuilder.ts` before ZIP assembly

## Pipeline Sequence (STRICT)

```
Google Vision OCR (image bytes → raw text)
    ↓
[PARALLEL]:
  Rule Modules (regex/label parsing) + DeepSeek text helpers
    ↓
Extraction candidates
    ↓
Central Brain (merge, conflict resolution, confidence scoring)
    ↓
TranslationCandidateSafetyGuard (forbidden phrases, garbage filter)
    ↓
[FORK]:
  Form path: CB contract (strict field allowlist per document type)
  Translation path: translationExtractor.ts (all available fields)
    ↓ (translation path)
Controlled Translation Renderer (KMU-55 + glossary + deterministic rules)
    ↓
Translation Review Gate (reviewConfirmed: true required)
    ↓
PacketBuilder → ZIP/PDF
```

## Rejected alternatives

**DeepL**: OUT OF SCOPE. Not referenced in any codebase module. KMU-55 produces correct name transliteration; DeepL would break it. No DeepL code, ADR phases, roadmap items, or future hooks.

**LLM for name transliteration**: REJECTED. Names and patronymics use KMU-55 exclusively. LLM output is non-deterministic and unacceptable for legal identity documents.

**DocAI as default**: REJECTED until P2.5 benchmark proof shows measurable accuracy improvement over Vision on real Ukrainian booklets (minimum 5 samples).

## Consequences

- P0.5 BLOCKS P1: all P1 runtime code changes must comply with this provider stack
- Translation Mode and Form Mode are separate code paths after Central Brain
- Review Gate absence means system is NOT production-ready until P3 completes
