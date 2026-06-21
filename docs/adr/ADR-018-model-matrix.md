# ADR-018 — Iron Model Matrix (which model does what, permanently)

Date: 2026-06-10
Status: ACCEPTED (owner-directed)
Supersedes: model-choice ambiguity left open by ADR-017
Related: ADR-017 (one Gemini brain), ADR-011 (no single AI truth source), ADR-016 (hard-case human review)

## Decision

One fixed matrix of model-to-operation assignments. This is the reference;
any deviation is a bug, not a tuning option.

### Models

| Model / service | Role | Status |
|---|---|---|
| **gemini-3.1-pro-preview** | THE document reader (D1) — all products, all doc classes | PROD primary (`GEMINI_MODEL`, clean value, smoke PASS 2026-06-10) |
| gemini-3.5-flash | Fallback #1 in provider chain only | Never primary. Fallback read of a non-Latin doc ⇒ ALL fields forced review (`fallback_model_used`) |
| gemini-2.5-flash | Fallback #2 (last resort) | **DISQUALIFIED for certificate docs** (2026-06-02 adjudication: read a DIFFERENT person). Same forced-review rule |
| gemini-2.0-flash(-lite) | — | DEPRECATED, HTTP 404, removed from chain |
| gemini-3-pro-preview | — | 404 on generation calls (listed but unusable) |
| **Google Vision** (DOCUMENT_TEXT_DETECTION via SA) | Technical eye: raw OCR signal, presence confirmation, future bbox/crop. MRZ parsed by deterministic code | NEVER a final reader |
| **DeepSeek** | (a) prose translation (D3); (b) legacy TPS text-structuring gap-fill on Vision OCR *text* (never sees the image) | Its claimed `final_value` is NEVER trusted — deterministically overwritten from `source_value` via toWinAnsiSafe/KMU-55 (`documentBrain.ts` sanitizer). No Cyrillic decisions, no identity/date/number authority |
| GPT/OpenAI | — | REMOVED from codebase (Phase 2.6) |

### Operations

| Op | What runs it |
|---|---|
| D0 image quality | code (sharp / size checks) — no model |
| D1 document reading | gemini-3.1-pro-preview (provider chain, fallback ⇒ forced review on non-Latin) |
| D1 raw OCR / MRZ | Google Vision + deterministic MRZ parser |
| D1.5 raw_cyrillic preserve | code (adapter/Core, Phase 2.0) |
| D2 dictionaries / KMU-55 / gazetteer / patronymic / authority | deterministic code — no model |
| C3 final gate (`finalValue` single writer) | deterministic code (Phase 3) — no model |
| D3 prose translation | DeepSeek |
| D4 validators | deterministic code |
| D5 client review | UI + user confirmation (re-enters C3) |
| D6 PDF / payment | code (pdf-lib, Stripe) — reads `finalValue` only |
| Audit | provenance log — code |

## Enforcement in code (verified 2026-06-10)

1. `geminiVisionProvider.ts` — `primaryGeminiModel()` exported; chain = `[primary, 3.5-flash, 2.5-flash]`.
2. `documentFieldReader.ts` — **deterministic, flag-free guard**: `spec.script !== 'latin'` AND `read.model !== primaryGeminiModel()` ⇒ every field `review_required=true` + reason `fallback_model_used`. A fallback read of Cyrillic/mixed docs can never silently become a candidate-final.
3. Latin-only US forms (us_ead / us_i94 / us_i797) are exempt — flash was never disqualified on Latin print.
4. Tests: `docintel/__tests__/fallbackModelReview.test.ts` (5 cases incl. confidence-0.99-still-reviewed).
5. DeepSeek sanitizer: `tps/ai/documentBrain.ts` — `final_value` overwritten from `source_value`; Cyrillic in output = hard fail.

## Why

- Bench 2026-06-09 (owner GT docs): 2.5-flash fabricated a different person on a handwritten birth certificate; pro = best (19/22). No model is safe on handwritten birth certs ⇒ always-review stays mandatory regardless of model.
- The fallback chain existed for availability but silently traded safety for it on exactly the doc classes where flash is disqualified. This ADR makes the trade explicit: availability is kept (flash may still read), safety is kept (the read is never released without human review).

## Not allowed without a new ADR + owner GT benchmark

- Promoting any flash model to primary for any doc class.
- Letting DeepSeek see images or decide Cyrillic/names/dates/numbers.
- Using Google Vision output as a final field value.
- Removing the fallback forced-review guard.
