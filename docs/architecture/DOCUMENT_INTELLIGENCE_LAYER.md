# Document Intelligence Layer (`lib/docintel`)

**Status:** Foundation shipped 2026-05-27. Permanent shared spine — not a crutch.
**Purpose:** ONE canonical pipeline that reads a Ukrainian document → produces verified, provenance-tracked, KMU-55-transliterated fields → consumed by **TPS, ReParole, EAD, and Translation alike**. Replaces per-product OCR point-solutions.

---

## Why this exists
Prior audits (`DOCUMENT_RULE_COVERAGE_AUDIT.md`, `TRANSLATION_ENGINE_REALITY.md`) found the system fragmented: TPS modules and Translation modules were parallel implementations, authority/transliteration logic scattered, and no canonical document registry. Every product re-solved "read a document." This layer is the single base they unify on.

## The pieces (all under `apps/web/src/lib/docintel/`)
| File | Role |
|---|---|
| `types.ts` | Canonical types: `DocTypeSpec`, `DocFieldSpec`, `FieldKind`, `VisionProvider`, `ExtractedDocField`, `DocumentReadResult`. |
| `documentRegistry.ts` | **The permanent config.** Declares every UA document type (booklet, international passport, birth/marriage/divorce certificate, ID card), its fields, and which products (`tps`/`reparole`/`ead`/`translation`) consume it. Add a doc/field = edit here only. |
| `transliterationPolicy.ts` | **The single transliteration authority.** Cyrillic→Latin by field kind: names/city → KMU-55, oblast → nominative + "Oblast", date → ISO, doc_number → preserved. Strips settlement prefixes (смт/с.м.т./м.) so the form gets the bare city. **The LLM NEVER transliterates names** (v5 §13; it returned "Troshchianets"/"s.m.t. Trostianets" — corrected here). |
| `providers/geminiVisionProvider.ts` | Vendor-agnostic `VisionProvider` impl. Builds the prompt FROM the doc spec, reads Cyrillic from the image, retries 503/429 with model fallback + timeout. Swap/inject to change vendor (v5 "vision provider remains pluggable"). |
| `documentFieldReader.ts` | The one entry point: `readDocument(image, mime, docTypeId)` → registry → provider → transliteration → `ExtractedDocField[]` with provenance, confidence, review flags + `anchor_read`. |

## Data flow
```
image + docTypeId
  → DocumentRegistry.getDocTypeSpec(docTypeId)
  → VisionProvider.readFields(image, spec)        # Cyrillic reads (pixels)
  → transliterationPolicy.toCanonicalValue(kind)  # KMU-55 / ISO / strip prefix
  → ExtractedDocField[] (value, raw_cyrillic, confidence, review_required)
  → consumed by TPS form-fill | Translation render | ReParole | EAD
```

## Guarantees
- **Provider-agnostic.** Gemini today; GPT/Claude/Azure can implement the same interface and be benchmarked without touching consumers.
- **Cyrillic read by vision; Latin produced by deterministic KMU-55.** One place, never the LLM. Empirically proven (Ivanenko / Tarasovych / Trostianets correct; LLM's own "Troshchianets" rejected).
- **Candidate-only.** Handwritten fields always `review_required=true`; printed fields below 0.95 confidence too. The consuming product's Review Gate makes values final.
- **Never throws / never blocks.** Provider failure → `ok:false` with status; caller falls back.
- **`raw_cyrillic` preserved** so translation can re-add settlement type ("urban-type settlement") while the form gets the bare city.

## How each product uses it
- **TPS booklet** (live, flag-gated): `lib/tps/ai/geminiVisionArbiter.ts` is now a thin facade over this spine; the OCR route calls it. KMU-55 output → `TpsExtractedField`.
- **Translation** (next): call `readDocument(image, 'ua_birth_certificate')` etc.; map `ExtractedDocField[]` into the bureau-style renderer + certification.
- **ReParole / EAD** (next): same `readDocument`, adapt to their forms. Registry already declares which doc types they consume.

## Validation
- Unit: `docintel/__tests__/docintel.test.ts` — registry integrity, transliteration (incl. settlement-prefix variants), orchestration with a mock provider.
- Live (self-skips in CI; `RUN_LIVE_VISION=1`): `geminiVisionArbiter.live.test.ts` — real Gemini on owner booklet through the spine → Ivanenko / Taras / Tarasovych / 1990-01-01 / Trostianets / Vinnytsia Oblast.

## Status / limits
- Booklet path validated live (N=1, owner). Other doc types declared + structurally tested with a mock provider; need real fixtures + ground truth (≥3 distinct people per v5 §29/§32) before any production enablement.
- Production requires PAID Gemini tier (free trains on PII — v5 §30).
- Enabled only behind `TPS_GEMINI_VISION_ARBITER_ENABLED` (default OFF).
