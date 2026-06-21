# Vision Arbiter — P1 Proof (N=1, DIRECTION ONLY)

**Date:** 2026-05-27 · **Status:** Core hypothesis PROVEN at N=1. NOT client-validated (needs ≥3 distinct people per v5 §29/§32).
**Harness:** `scripts/vision-arbiter-proof.mjs` · **Image:** owner's own booklet `qa-shots/private/booklet_test_resized.jpg` · **Key:** free-tier, test-only, rotated after.

## Result — Gemini 2.5 Flash reading the IMAGE (pixels)
Latency 6.85s · tokens 565/402 · cost ~$0.0012 (~0.12¢)

| Field | Baseline (prod, Vision→DeepSeek-text) | Gemini vision — Cyrillic | Ground truth (Cyrillic) | Cyrillic verdict |
|---|---|---|---|---|
| family_name | (crossref-only) | Іваненко | Іваненко | ✅ |
| given_name | not extractable booklet-only | Іван | Іван | ✅ |
| patronymic | **Yovych** ❌ | **Іванович** | Іванович | ✅ FIXED |
| date_of_birth | fallback scan | 01 січня 1990 | 01.01.1990 | ✅ |
| place_of_birth | **Prostianets** ❌ | **Тростянець** | Тростянець | ✅ FIXED |

**Cyrillic reading: 5/5 correct.** Both production-critical failures (patronymic suffix-fragment; Т→П city misread) resolved. given_name — previously unextractable for booklet-only users — now read.

## Critical finding — DO NOT trust LLM transliteration
Gemini's Latin output was WRONG even though its Cyrillic was right:
- Іваненко → Gemini "Ivanenko" (direct match) · KMU-55 correct = **Ivanenko**
- Тростянець → Gemini "**Troshchianets**" (hallucinated) · KMU-55 correct = **Trostianets**

**Architecture conclusion (empirically confirms v5 §13):**
> Gemini vision reads the **Cyrillic**; the deterministic **KMU-55 transliterator** (`packages/knowledge/src/transliterate.ts` / dictionaryBridge) produces the **Latin**. Never let the LLM transliterate names. "Gemini eyes + KMU-55 hands."

## What this proves / does not prove
- PROVES: a vision model recovers handwritten Ukrainian Cyrillic that the current OCR-text pipeline mangles. The root cause ("no model sees the image") is correct and addressable. Cost/latency are viable (~0.12¢, ~7s).
- DOES NOT PROVE: client-readiness. This is N=1 (owner's own handwriting). Per v5 §29 need 20+ booklets / §32 10/10 distinct pilots before flag-ON in production.

## Next (per ENGINEERING_PLAN_VISION_ARBITER.md)
- P1 (this): proven. ✅
- P3 wiring: Gemini reads Cyrillic → KMU-55 transliterates → Central Brain → Review Gate; behind `TPS_GEMINI_VISION_ARBITER_ENABLED=false`; fail→fallback; cost-logged.
- P2 gate: collect ≥3 distinct people's booklets + ground truth; measure before/after + manual-review rate.
- Production: PAID tier only (free tier trains on PII).
