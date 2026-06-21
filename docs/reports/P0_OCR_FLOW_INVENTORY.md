# P0 — OCR / Document Flow Inventory (forensic, read-only)

**Date:** 2026-06-06. Evidence-based map of EVERY document-recognition flow. No code changed. Purpose: stop
guessing — see which paths exist, which reader/gate each uses, and where a value becomes "final". Frozen:
D0 / ReaderResult / OneBrain / HTR / 2nd provider / SMART / model work, until P0–P2 done.

## The big finding: there is NOT one recognition path — there are SEVERAL, with DIFFERENT safety
1. **Public Translation wizard** — synchronous, no DB. (`TranslateWizard.tsx` → `/api/translation/vision-extract`)
2. **Session Translation flow** — Supabase-backed, async. (`extract` / `ocr-from-storage` → `EvidenceReviewPage` → `render`)
3. **TPS** — multi-module aggregator + optional docintel core. (`/api/tps/ocr/extract` + `tps/brain/merge`)
4. **Re-Parole / EAD** — docintel core. (`reparole|ead/ocr/extract`)
5. **Legacy `/api/ocr/extract`** — OpenAI `gpt-4o-mini` (separate provider, not Gemini).

The anti-fab + self-consistency gates live **inside `readDocument` (docintel)**. So ONLY flows that go through
`readDocument` are gated. The TPS legacy modules and the legacy OpenAI route are **NOT gated**.

## Flow table

| # | flow | UI entrypoint | API route | reader | preprocess | adapter / merge | review gate | final/PDF gate | flags | risk |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Translation (public) | `TranslateWizard.tsx` | `/api/translation/vision-extract` | `readDocument` (Gemini) **only if docType `auto:true`** | `preprocessImage` | `toTranslationRows` / in-route merge | docintel gates (anti-fab/self-consistency) **only when called** | client gate + `/generate-pdf` (`reviewGate`) | `QUALITY_GATE_ENABLED` off, gates on | **birth `auto:false` ⇒ NO call ⇒ 0 fields** (incident) |
| 2 | Translation (session) | `EvidenceReviewPage.tsx` | `/api/translation/extract`, `/[sessionId]/ocr-from-storage`, `/process` | `readDocument`? + own logic | `preprocessImage` | Supabase `extracted_fields` | **own rule: `confidence<0.70 \|\| review_required`** (≠ gate) | `/render` (payment_confirmed + confirmed fields) | — | **two different review semantics vs flow #1** |
| 3 | TPS | `TPSWizardV2.tsx` | `/api/tps/ocr/extract` (+ `/tps/brain/merge`) | **legacy modules** (`runPassportBookletModule`, `runMilitaryIdModule`, `runBirthCertificateModule`, `runI94Module`, `runEadModule`, `runDlModule`, `runI797Module`) **AND** `readDocument`+`arbitrateDocument` | `preprocessImage` | `centralBrain.ts` merge / `toTpsAnswers` | module-specific + (docintel gates only on the core branch) | `/tps/generate-packet` | `ONE_CORE_TPS_ENABLED` | **legacy modules NOT covered by gates** → "<patronymic-suffix-fragment>" truncation, mixed/blank fields; multi-doc aggregation means a birth cert ≠ TPS form doc → many "Не найдено" |
| 4 | Re-Parole | `ReparoleWizardV2.tsx` | `/api/reparole/ocr/extract` | `readDocument` | `preprocessImage`? | `toReParoleCoreAnswers` | docintel gates | packet | `ONE_CORE_REPAROLE_ENABLED` | gated (better) |
| 5 | EAD | `EADWizard.tsx` | `/api/ead/ocr/extract` | `readDocument` | — | `toEadAnswers` | docintel gates | — | `ONE_CORE_EAD_ENABLED` | gated (better) |
| 6 | Legacy OCR | (unknown caller) | `/api/ocr/extract` | **OpenAI `gpt-4o-mini`** | — | — | none observed | — | `OPENAI_VISION_MODEL` | **ungated, different provider, possibly dead — must confirm caller** |
| 7 | Diagnostics | — | `/api/_diag/vision`, `/api/tps/ocr/shape-debug`, `/api/central-brain/health` | — | — | — | — | — | — | dev/diag only |

Supporting routes: `confirm-field`, `correct-field`, `certify`, `review-state`, `manual-review`,
`manual-review-status`, `extraction-status` (session-flow review/correction), `stripe/checkout` + `stripe/webhook`
(payment), `render` + `generate-pdf` + `tps/generate-packet` + `packet/generate` (output).

## Open questions to resolve in P0_FIELD_LIFECYCLE_MAP + ROOT_CAUSE
- Does flow #2 (session) actually call `readDocument` (and thus the gates), or its own extractor? (`extract`
  route shows its own `confidence<0.70` rule — likely NOT the docintel gate.)
- Who calls legacy `/api/ocr/extract` (gpt-4o-mini)? If live, it's an ungated, non-Gemini path — contradicts Gemini-first.
- In TPS, which doc types use legacy modules vs the docintel core? The legacy modules are where "<patronymic-suffix-fragment>" comes from.
- Is `review_required`/`manual_required` preserved identically across vision-extract vs extract vs TPS modules vs adapters vs render?

## Status
PASS for inventory: all upload→OCR→merge→review→PDF flows enumerated; no "unknown upload route" except the
legacy `/api/ocr/extract` caller (flagged). Several flows have DIFFERENT and INCONSISTENT review/final semantics
— that inconsistency is the core incident surface (see P0_ROOT_CAUSE_ANALYSIS.md).
