# OCR_PROVIDER_BENCHMARK_PLAN — Cyrillic / Ukrainian Document OCR

**Date:** 2026-05-27
**Mode:** Research + plan. No runtime code changed, no provider integrated yet, no commit.
**Stance:** Independent. Every market claim below is verified against a primary source (cited). I did not trust the pasted analysis — where it is wrong or incomplete, I say so. Sources are listed at the end.

---

## 0. Verdict

**Cyrillic OCR is a solved problem for PRINTED documents and a manageable problem for HANDWRITTEN ones. The service is viable.** My earlier framing ("OCR can't read the booklet") was about *handwritten* booklet fields with *one* engine — not about Cyrillic in general. Birth/marriage/divorce certificates are mostly **printed** Cyrillic and are highly automatable. The strategic error was never "Cyrillic is impossible" — it was **running a single 2015-era pipeline (Google Vision + a text-only DeepSeek arbiter) and never letting a strong model look at the actual image.**

The single most important finding in this whole research is codebase-specific, not market-specific — see §3.

---

## 1. Market reality (verified, with the caveat that matters most)

| Provider | Ukrainian printed | Ukrainian handwriting | General accuracy* | Cost / 1,000 pages | Tested on UA Cyrillic publicly? |
|---|---|---|---|---|---|
| **Google Cloud Vision** | ✅ Supported (`uk`, `Cyrl`) | ⚠️ Weak (~63% cursive, general) | mid | ~$1.50 | ❌ No |
| **Google Document AI (Enterprise OCR)** | ✅ Yes | ⚠️ ~50 handwriting langs; UA not explicitly confirmed | ~83% (OmniAI/Mistral cite) | ~$1.50–$30** | ❌ No |
| **Azure AI Document Intelligence** | ✅ Yes (printed) | ❌ **Ukrainian NOT in handwriting list** (has RU, AR, TH + 9 majors) | ~89%, best structured output (~1.8% CER) | ~$1.50–$10 | ❌ No |
| **AWS Textract** | ❌ **No Ukrainian text detection** | ❌ English handwriting only | n/a for us | — | ❌ Exclude |
| **Mistral OCR** (Mar 2025) | ✅ Claims broad scripts | ⚠️ self-claimed; RU tested, UA not explicit | self-claimed 94.9% (beats DocAI 83.4%, Azure 89.5%) | **$1–$2** | ❌ No |
| **Gemini 2.5 Flash / Pro / 3** | ✅ Strong multilingual | ✅ **VLMs now LEAD handwriting** | top tier (Gemini 2.5 Pro top-3 OCR) | Flash ~$0.30/1M in, $2.50/1M out (≈ cents/page) | ❌ No |
| **GPT-4o / GPT-5** | ✅ Strong | ✅ GPT-5 top handwriting; GPT-4.1 ~85% clean | top tier | token-priced | ❌ No |
| **Claude (Sonnet/Opus vision)** | ✅ Strong | ✅ Claude Sonnet 4.5 top-3 OCR | top tier | token-priced | ❌ No |
| **ABBYY FineReader / Cloud OCR SDK / Vantage** | ✅ Historically strong Cyrillic | ⚠️ printed strong; handwriting weaker | high on printed | ~$0.02–$0.10/page | ❌ No |

*\*General accuracy = English/mixed benchmarks (OmniAI, third-party). NOT Ukrainian.*
*\*\*DocAI price varies by processor tier.*

### The caveat that changes everything
**No public benchmark tests Ukrainian Cyrillic — printed or handwritten.** OmniAI (1,000 docs, the most-cited independent benchmark) is English-document-focused. Mistral's 94.9% is self-reported and tests French/Russian/German/Chinese, not Ukrainian. Every number above is a proxy.

**Consequence:** we literally cannot pick a provider from public data. A real own-dataset benchmark is not optional — it is the only way to get a true answer. This is the one place the pasted analysis is 100% right.

---

## 2. The two document classes need two different strategies

This distinction is missing from how the system is built today (one pipeline for everything):

### Class A — PRINTED Cyrillic (birth / marriage / divorce certificates, ID cards, загранпаспорт data page)
- Modern OCR reads printed Cyrillic at 90%+.
- **Realistic target: 85–95% auto-fill** with confidence + light review.
- Best candidates: Google DocAI, Azure (best structured output), Mistral OCR, or a VLM (Gemini/GPT/Claude).
- This is the **easy, high-ROI win** and should be the first thing made to work end-to-end, because it's where the translation product makes money.

### Class B — HANDWRITTEN Cyrillic (old passport-booklet fields: surname, patronymic, place of birth)
- Hard. This is where "Yovych" and "Prostianets" come from.
- **Realistic target: 50–80% auto-fill + MANDATORY review.** Not 100%, ever, with any provider.
- Best candidate: a **frontier VLM that SEES THE IMAGE** (Gemini 2.5 Pro / GPT-5 / Claude Opus vision), not text-arbitration.
- Honest product framing: "we read what's reliably legible; you confirm the rest." That is a normal, defensible document-automation model — not a failure.

---

## 3. 🔴 The killer codebase-specific finding (the pasted analysis missed this)

**Today, no strong model ever looks at the actual document image.** The current booklet pipeline is:

```
image → Google Vision (text A) → DocAI (text B) → DeepSeek arbitrates text A vs text B → field
```

`runDualOcrCrossref()` (`dualOcrCrossref.ts`) sends **only the two OCR TEXT strings** to DeepSeek. DeepSeek is **text-only — it never sees the pixels.** So when both Vision and DocAI misread the handwritten "Тарасович" as "...йович" and "Тростянець" as "Простянець", the arbiter is choosing between two wrong text reads and **cannot recover what neither OCR saw.** That is the mechanical root cause of the name errors you keep hitting — not a missing rule, not a bad contract.

**The highest-impact single change in the entire system:** replace/augment the text-only DeepSeek arbiter with a **vision LLM that receives the actual image crop** (Gemini 2.5 Pro / GPT-4o / Claude vision) and is asked to read the field directly, with the two OCR texts as *hints*. A model that sees the pixels will read handwriting far better than a model arbitrating two bad transcriptions. This alone likely fixes the majority of booklet name errors.

This reframes "OCR provider benchmark" into something more precise: **benchmark text-OCR for printed docs, and benchmark vision-LLMs for handwritten docs — they are different competitions.**

---

## 4. Critique of the pasted plan

| Pasted claim | My verdict |
|---|---|
| "Build OCR Provider Benchmark + router per document type" | ✅ **Correct and necessary.** No public data on UA Cyrillic → must measure ourselves. |
| "Exclude AWS Textract (no Ukrainian)" | ✅ **Correct.** Verified — Textract supports no Ukrainian. |
| "Azure not guaranteed for handwriting" | ✅ **Correct.** Verified — Ukrainian absent from Azure handwriting list. |
| "Google DocAI as primary candidate" | ⚠️ **Outdated.** DocAI ~63% on cursive handwriting. For Class B, a frontier VLM beats it. DocAI is a strong *Class A* candidate, not the handwriting answer. |
| "ABBYY as premium Cyrillic candidate" | ⚠️ **Worth benchmarking for printed, but don't assume.** ABBYY's edge was the desktop era; on handwriting, 2025 VLMs lead. Benchmark it for Class A only. |
| Whole framing = "classic OCR provider selection" | ❌ **Incomplete.** Ignores that VLMs (Gemini/GPT/Claude/Mistral OCR) overtook traditional OCR on exactly our hard case (handwriting). This is the biggest 2025-2026 market shift. |
| "Legal Rule Auditor as deterministic script (not runtime LLM)" | ✅ **Correct** — matches my architecture audit. |
| Ground-truth dataset + per-field metrics | ✅ **Correct and essential.** OCR returns pretty garbage without ground truth to score against. |

**Net:** the pasted plan's *process* (benchmark → router → rules) is right. Its *provider shortlist* is a generation behind. The winning shortlist must include vision LLMs, and for Class B they are the favorites.

---

## 5. Recommended shortlist to benchmark (by class)

**Class A — printed certificates / ID:**
1. Google Document AI (already wired — free to test)
2. Gemini 2.5 Flash (cheap, structured output, strong multilingual)
3. Azure Document Intelligence (best structured/layout output)
4. Mistral OCR (cheapest at $1–2/1k, strong self-reported)
5. (optional) ABBYY Cloud OCR SDK trial

**Class B — handwritten booklet fields:**
1. Gemini 2.5 Pro (vision, sees image)
2. GPT-4o / GPT-5 (vision)
3. Claude Opus/Sonnet (vision)
4. Current Vision+DocAI+DeepSeek text pipeline (as the baseline to beat)

**Exclude:** AWS Textract (no Ukrainian).

---

## 6. Privacy / compliance — non-negotiable for immigration PII

These are immigration documents (names, DOB, passport numbers, A-numbers). This constrains provider choice as much as accuracy:

- Use **API / enterprise tiers only** — they do NOT train on your data by default (verified: OpenAI API, Azure OpenAI, Google Vertex, Mistral La Plateforme Scale). Consumer chat tiers DO train by default — never use those.
- Prefer providers offering a **DPA / no-training contractual guarantee** (toggles "reduce probability"; only contracts guarantee zero training).
- Azure OpenAI and Google Vertex are the strongest on data-residency + BAA-style agreements if that's ever needed.
- **Already in your ADR-009** (provider data policy) — any new provider must pass the same image-retention audit. Add this as a gate in the benchmark: a provider that won't sign a no-training DPA is disqualified regardless of accuracy.

---

## 7. Cost reality (order-of-magnitude, per document ≈ 1–3 pages)

- Gemini 2.5 Flash: ~**cents** per document. Cheapest viable VLM.
- Mistral OCR: **$1–2 / 1,000 pages** = ~0.1–0.6¢/doc. Cheapest OCR-specific.
- Google Vision / DocAI base OCR: ~$1.50 / 1,000 pages.
- GPT-4o / Claude vision: token-priced, typically a few cents/doc.
- ABBYY: $0.02–0.10/page (most expensive).

**Implication:** cost is NOT the deciding factor at your volume. A few cents per document is negligible against a paid translation service. **Optimize for accuracy and privacy, not price.**

---

## 8. The benchmark harness — what to build (concrete)

**`scripts/ocr-provider-benchmark.mjs`** — runs each document through every shortlisted provider, scores against ground truth, emits a sanitized metrics table. No PII in output.

**`qa-shots/private/ukrainian-documents/`** (git-ignored) — real documents:
- 5+ passport booklets (Class B)
- 5+ birth certificates (Class A)
- 5+ marriage certificates (Class A)
- 3+ divorce certificates (Class A)
- 3+ ID / загранпаспорт
- Start with 5–7 per type honestly labeled "small benchmark" if 20 isn't available yet.

**Ground truth** — per document, a hand-verified JSON of expected fields (the only way to score; OCR returns plausible-looking garbage).

**Metrics per (document × provider × field):** detected (y/n), correct (y/n), confidence, normalization ok (y/n), review_required, failure_reason (using the unified taxonomy from the architecture audit). Aggregate to **field-level accuracy per provider per document type**.

**Decision output** — per document type: primary provider, secondary, fields safe for auto-fill (≥X% accuracy), fields requiring review, fields not yet supported.

I can scaffold this, but running it needs: (a) API keys for Gemini/Mistral/Azure, (b) the real document fixtures, (c) ground-truth JSONs. Items (b) and (c) require you — the documents and the correct answers.

---

## 9. Phased plan (integrated with the architecture audit)

This plan merges with `DOCUMENT_RULE_COVERAGE_AUDIT.md` — same P0 freeze.

- **P0 — Freeze features.** No TASK-04/05/06, no new pages. (Agreed across both reports.)
- **P1 — Quick win, no benchmark needed (~1 day):** add a **vision-LLM arbiter** to the booklet pipeline (Gemini 2.5 Pro or Claude vision) that sees the image crop, replacing the text-only DeepSeek arbitration for handwritten fields. This is §3 — likely the biggest accuracy jump for the least work. Validate on your existing booklet fixtures before benchmarking everything.
- **P2 — Build the benchmark harness** (`ocr-provider-benchmark.mjs` + dataset README + ground-truth schema). Sanitized output only.
- **P3 — Assemble the dataset + ground truth** (needs you — real docs + correct answers).
- **P4 — Run the benchmark**, produce the accuracy/cost/privacy table per document type.
- **P5 — Build the Provider Router**: document-type → best provider, with Class A (printed) and Class B (handwritten) paths. Reuse the existing provider abstraction (`googleVisionProvider`/`docAIProvider` already show the pattern).
- **P6 — Per-document extractors** for the new certificate types (marriage/birth/divorce) with their own field sets (spouse_1, spouse_2, act_record_number, registry_office, etc.), governed by the contract + Legal Rule Auditor from the architecture audit.
- **P7 — Translation templates + Review Gate** per document type (controlled templates + glossary, never raw machine translation for legal text).

---

## 10. Honest expectations to set (so week 5 isn't week 4)

| Document class | Realistic auto-fill | Review needed |
|---|---|---|
| Printed certificates (birth/marriage/divorce) | **85–95%** | light, spot-check |
| Printed ID / загранпаспорт MRZ | **90%+** (MRZ is machine-readable) | minimal |
| Handwritten booklet fields | **50–80%** | **mandatory** |
| Final translation (any) | — | **always user-confirmed** (legal requirement, 8 CFR §103.2(b)(3)) |

This is a **normal, mature document-automation model.** "100% hands-off for handwritten Cyrillic" is not achievable by any provider on the market — and chasing it is what keeps the goal permanently one fix away. Ship the printed-document automation (where the money is), make handwriting fail honestly with a clear prompt, and the product is real.

---

## Sources
- [Google Cloud Vision — OCR language support](https://docs.cloud.google.com/vision/docs/languages) — Ukrainian `uk`/`Cyrl` Supported
- [Google Document AI — Enterprise Document OCR](https://docs.cloud.google.com/document-ai/docs/enterprise-document-ocr) — 200+ langs, ~50 handwriting
- [Azure AI Document Intelligence — OCR language/locale support](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/language-support/ocr) — handwriting language list (Ukrainian absent)
- [Mistral OCR announcement](https://mistral.ai/news/mistral-ocr) + [VentureBeat coverage](https://venturebeat.com/ai/mistral-releases-new-optical-character-recognition-ocr-api-claiming-top-performance-globally) — self-reported 94.9%, pricing
- [OmniAI OCR Benchmark](https://getomni.ai/blog/ocr-benchmark) + [dataset](https://huggingface.co/datasets/getomni-ai/ocr-benchmark) — VLMs match/exceed traditional OCR; English-focused
- [aimultiple — Handwriting recognition: LLMs vs OCR](https://aimultiple.com/handwriting-recognition) — frontier VLMs lead handwriting
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) — Gemini 2.5 Flash costs
- [AWS Textract supported languages](https://docs.aws.amazon.com/textract/latest/dg/how-it-works-language.html) — no Ukrainian
- [ABBYY Cloud OCR SDK pricing](https://www.abbyy.com/cloud-ocr-sdk/licensing-and-pricing/)
- [OpenAI enterprise privacy](https://openai.com/enterprise-privacy/) / [Azure OpenAI data retention](https://char.com/blog/azure-open-ai-data-retention-policy/) — API tiers don't train by default

*Read-only research. No runtime code changed. No public benchmark tests Ukrainian Cyrillic — own benchmark required before any provider decision.*
