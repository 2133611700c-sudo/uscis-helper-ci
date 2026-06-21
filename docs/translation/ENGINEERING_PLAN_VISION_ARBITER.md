# Engineering Plan — Vision Arbiter for Ukrainian Cyrillic Documents

**Status:** APPROVED FOR EXECUTION · 2026-05-27
**Owner:** Taras (product) · Engineering: Claude (acting)
**Supersedes debate in:** DOCUMENT_RULE_COVERAGE_AUDIT.md, OCR_PROVIDER_BENCHMARK_PLAN.md, OCR_PROVIDER_COST_MATRIX.md, EXECUTION_PLAN_OCR_STABILIZATION.md, TRANSLATION_ENGINE_REALITY.md
**Conforms to:** Translation Engine v5.0 Final Standard (controlled autonomy; §1, §4 Stage 3, §33 roadmap, "Vision provider remains pluggable").

---

## 1. Working backwards — the customer outcome

> A 35–80-year-old Ukrainian uploads a photo of a handwritten internal passport (or a printed birth/marriage/divorce certificate). Within ~15 seconds they see each extracted field next to a crop of where it came from. Names like **Тарасович** and cities like **Тростянець** are read correctly — not mangled into "Yovych" or "Prostianets". Anything the system is unsure about is shown blank and flagged for them to confirm. They verify, pay, sign the certification, and download a bureau-style certified English translation accepted for USCIS-style submission.

The single thing standing between today and that outcome: **no model has ever looked at the image.** Today's pipeline is Google Vision (OCR text) → DeepSeek (text-only). When Vision misreads handwriting, nothing downstream can recover it. This plan inserts a vision model that reads the pixels.

## 2. Tenets (decision tie-breakers, in priority order)
1. **Factual accuracy over coverage.** A blank flagged field beats a confident wrong one.
2. **The image is ground truth.** Never guess, never infer from prior drafts or model memory.
3. **Candidate, not verdict.** Vision output is a candidate → Central Brain → human Review Gate. Never final.
4. **Controlled autonomy (v5 §1).** Automate the repetitive; humans certify the critical. Reject the "100% autonomous" fantasy.
5. **Measure before believing.** No "success" claim without ground truth on ≥3 distinct people.
6. **Don't fork; consolidate.** Reuse existing provider abstraction, Central Brain, Review Gate, manual-review system.

## 3. Problem statement (grounded in code)
- Booklet path: `route.ts:484` calls `runDualOcrCrossref()` → DeepSeek arbitrates two TEXT OCR outputs. `field-mapper.ts:11` explicitly: "Do NOT use DeepSeek Vision." → handwriting misreads are unrecoverable.
- Translation path: same weakness (Google Vision → DeepSeek text).
- Result in production: `middle_name="Yovych"` (suffix fragment of Тарасович), `city_of_birth="Prostianets"` (Т misread as П).
- v5 spec already anticipates the fix: **"Vision provider remains pluggable"** (p.1). This is not a deviation — it's exercising a designed seam.

## 4. Goals / Non-goals
**Goals**
- G1. A `geminiVisionProvider` that reads named fields from an image crop and returns candidate JSON with confidence + can_read.
- G2. Behind feature flag `TPS_GEMINI_VISION_ARBITER_ENABLED` (default OFF).
- G3. Before/after proof on the owner's booklet (Тарасович, Тростянець).
- G4. Cost + latency instrumented, logged to `tps_ocr_audit` (extend, don't fork).
- G5. Fits both products (TPS booklet + standalone translator) via one provider.

**Non-goals (explicit)**
- N1. NOT making Gemini the OCR layer — Google Vision/DocAI stay for layout/bbox.
- N2. NOT enabling in production this iteration.
- N3. NOT claiming client-ready accuracy from N=1 (owner-only) data.
- N4. NOT using free-tier key for any real client PII (test only, owner's own doc, key rotated after).
- N5. NOT touching Stripe/payment, NOT touching the mock translate-document page in this iteration (separate gate decision).

## 5. Success metrics (from v5 §28 / §32)
| Metric | Target | This iteration's bar |
|---|---|---|
| Critical-field accuracy | ≥99.5% (names/dates/ids/agency) | Proof: Тарасович + Тростянець correct on owner doc |
| Numeric accuracy | ≥99.9% | DOB read correct |
| Unjustified guess rate | 0; every low-conf flagged | can_read=false when illegible |
| Source-trace coverage | 100% critical | every field carries evidence_region |
| Manual-review rate | high in pilot, reduce only after proven | measured, not assumed |
| Latency | <15s total OCR budget | per-call timeout 8s, parallel |

## 6. Architecture — where it slots
v5 §4 Stage 3 (Extraction). The arbiter is invoked AFTER base OCR (which provides text + word bboxes for cropping) and BEFORE normalization/Central Brain.

```
image → Google Vision/DocAI (text + bboxes)            [Stage 3a, exists]
      → crop field/identity zone via bbox + sharp        [new util]
      → geminiVisionProvider.readFields(crop, hints)      [NEW — sees pixels]
      → CandidateField[] (candidate-only)                 [new contract]
      → Central Brain (decision) → Review Gate (final)    [exists]
```
- Provider-agnostic: `VisionArbiterProvider` interface; Gemini is impl #1; GPT/Claude are benchmark impls behind the same interface.
- Reuses: `sharp` (already imported), `tps_ocr_audit` (cost log), Central Brain, Review Gate, manual-review.

## 7. Interface contract (candidate output)
```json
{
  "field": "patronymic",
  "cyrillic_value": "Тарасович",
  "latin_value": "Tarasovych",
  "can_read": true,
  "confidence": 0.0,
  "evidence_region": "identity-zone crop ref",
  "model_tier": "gemini-2.5-flash",
  "reason": "full handwritten word legible",
  "review_required": true
}
```
`review_required=true` ALWAYS for handwritten identity fields, regardless of confidence (v5 §19 critical-field gate: confidence <0.95 → human confirm; handwriting → always confirm).

## 8. Cost & latency (verified prices, May 2026)
- gemini-2.5-flash: **$0.30 in / $2.50 out per 1M tok**. A field crop ≈ 258 img tokens + ~400 prompt + ~50 out ≈ **~$0.00025/field**; ~10 fields ≈ **~0.25¢/doc**.
- gemini-2.5-pro (escalation, low-conf only): higher; used sparingly.
- Cost-control: Flash first; Pro only on can_read=false or confidence<threshold; crop not full page; max 6 calls/doc, max 2 Pro/doc.
- Per-doc cost roughly NEUTRAL vs today (today's booklet path already pays DocAI + DeepSeek ≈0.33¢).

## 9. Privacy / security (non-negotiable)
- **Free-tier key = TEST ONLY**, owner's own documents only, key rotated after. Free tier trains on data (v5 §30) → forbidden for client PII.
- **Production requires paid tier** (Vertex or billing-enabled AI Studio; no-train).
- Key only in `.env.local` (gitignored) + Vercel env for prod. **Never committed**, never in logs/reports.
- No image bytes or PII in logs; cost-log metadata only.
- ADR-009 image-retention audit applies to the new provider before prod enable.

## 10. Phased delivery (aligned to v5 §33)
- **P0 — DONE (committed 43f2080):** single `readinessPolicy` (kills 3 conflicting gates).
- **P1 — THIS ITERATION:** geminiVisionProvider + crop util + live before/after proof on owner booklet. Flag OFF. De-risk the core hypothesis.
- **P2 — Eval (needs data):** 20+ distinct booklets + 20+ birth certs (v5 §29) with ground-truth JSON; before/after table; manual-review-rate measured. Gate to flag-ON.
- **P3 — Wire to TPS booklet route** behind flag; replace DeepSeek-text crossref internals when flag ON.
- **P4 — Translation product:** kill mock translate-document UI (violates v5 §21/§23/§31); wire real pipeline (upload→ocr-from-storage→extract→validate→render→certify); promote birth/marriage/divorce modules from draft after real-fixture E2E.
- **P5 — Provider router + benchmark** GPT/Claude/Azure/ABBYY as escape hatches only if Gemini underperforms on the eval set.

## 11. Testing & eval
- Proof harness: `scripts/vision-arbiter-proof.mjs` — loads an image, calls Gemini, prints structured fields. Run live on owner booklet.
- Eval set (v5 §29): 20+ per type; every fixed production error becomes a regression test.
- Acceptance to enable flag in prod (v5 §32): ≥3 distinct people, accuracy up vs baseline, 0 fabricated critical fields, costs recorded, review enforced, owner approval.

## 12. Rollout & rollback
- Feature flag default OFF; enable per-environment.
- Kill switch: flag → instantly reverts to current DeepSeek-text path.
- Gemini failure (timeout/error/rate-limit) → fall back to current OCR value + review_required; never block/hang (we just removed a hang this week — do not reintroduce).

## 13. Risks & mitigations
| Risk | Mitigation |
|---|---|
| Gemini hallucinates a plausible wrong name | candidate-only + Review Gate + can_read=false on doubt + show blank not guess |
| N=1 self-deception | label proof N=1; require ≥3 people before flag-ON |
| Latency hang returns | parallel calls, 8s timeout, fail→fallback |
| Free-tier PII leak | test on owner doc only; paid tier for prod; rotate key |
| Cost blowup | crop-only, Flash-first, call caps, cost logger |
| Forking a parallel system | reuse provider abstraction, Central Brain, Review Gate |

## 14. Open decisions (need owner)
- D1. Reconcile canon: TPS Translation Constitution v3 (memory) vs Translation Engine v5 (this spec) — which governs which scope?
- D2. Mock translate-document page: gate/unlink now, or convert to honest manual-review flow?
- D3. Paid Gemini tier provisioning for production (Vertex vs AI Studio billing).

---
*Execution begins with P1 proof. No production behavior changes until P2 acceptance on real multi-person data.*
