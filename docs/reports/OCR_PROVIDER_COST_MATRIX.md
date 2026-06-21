# OCR_PROVIDER_COST_MATRIX — roles, tariffs, integration decision

**Date:** 2026-05-27
**Status:** Decision matrix. Prices are APPROXIMATE (verified family-level, May 2026) — pin exact numbers here before integration and re-verify quarterly. Future-version exact prices (e.g. "Gemini 3.1", "GPT-5.4") from third-party lists are NOT trusted; family ranges used instead.
**Rule:** no provider is "final truth" — all AI/vision output is a *candidate* → Central Brain + Review Gate.

---

## Role assignment (the decision)

| # | Layer / Role | Provider — DECISION | Approx tariff | Why this one |
|---|---|---|---|---|
| 0 | **MRZ parse** (загранпаспорт data page) | Existing deterministic MRZ parser (no AI) | $0 | Machine-readable zone is deterministic + check-digit-validated. Never send to an LLM. |
| 1 | **Base OCR — always-on** (text + word regions for every doc) | **Google DocAI Enterprise OCR** + **Google Vision** (both already wired) | ~$1.50 / 1,000 pages each | Cheapest documented OCR; already integrated; gives word bounding-boxes needed to *crop* handwritten fields for Layer 2. Ukrainian `uk`/`Cyrl` officially supported. |
| 2 | **Vision arbiter — handwriting reader** (booklet identity fields) | **Gemini 2.5 Pro** (hard fields) + **Gemini 2.5 Flash** (volume/cheap) | Flash ≈ $0.30 in / $2.50 out per 1M tok → **<1¢ per field crop**; Pro higher | THE fix. It SEES the pixels (Layer 1 never does). Paid API does **not** train on data. Same Google stack = one auth/billing/residency story. VLMs lead handwriting (OmniAI/aimultiple). Native JSON output fits candidate schema. |
| 3 | **Certificate parser** (printed birth / marriage / divorce / ID) | **Gemini 2.5 Flash** structured-JSON (primary) + **Google DocAI** (secondary) | ≈ 1–3¢ per document | Printed Cyrillic is ~90%+ solvable. Flash is cheap, multilingual, structured-output. DocAI Form Parser ($30/1k) only if structure needs it. |
| 4 | **Text helper** — conflict explainer, agency-name glossary, cheap text extraction | **DeepSeek (DEMOTED, text-only)** | ~$0.14–0.28 / 1M tok | Keep for what it's good at and cheap at. **Remove it as the booklet handwriting solver** — it never saw the image; that was the bug. |
| B | **Benchmark-only candidates** (test, do NOT default) | GPT vision, Claude vision (premium auditor), Mistral OCR ($1–2/1k), Azure DI, ABBYY | varies | Prove-or-reject on OUR Ukrainian docs. Claude = expensive auditor, not default. OpenAI needs its own PII/data-policy review first. |
| X | **Excluded** | AWS Textract | — | Officially supports no Ukrainian text detection. Don't spend time. |

---

## Why Gemini as the default vision arbiter (independent call)

I am running on Claude, and I am still recommending **Gemini**, not Anthropic — that's the point of an independent call:
1. **Stack fit** — Vision + DocAI are already Google; same SDK, billing, data-residency, ADR-009 audit path.
2. **Privacy** — Gemini **paid tier does not use content to improve products** (free tier DOES — never use free tier for PII).
3. **Accuracy** — top-tier OCR, leads handwriting in independent benchmarks.
4. **Cost** — cheapest frontier vision: Flash for volume, Pro only for hard fields.
5. **Output** — native structured JSON → drops straight into the candidate schema.

Claude/GPT stay as benchmark + premium fallback. If the benchmark (P4) shows GPT or Claude meaningfully beats Gemini on OUR handwritten Ukrainian fields, we switch the Layer-2 default — that's exactly what the benchmark is for.

---

## Cost-control design (tiered escalation — don't send everything to the expensive model)

```
Every doc        → Layer 1 (Vision/DocAI)         ~$0.0015/page
Printed cert     → Layer 3 (Gemini Flash JSON)    ~1–3¢/doc
Handwritten only → Layer 2 Flash on field crops   <1¢/field
Weak/low-conf    → Layer 2 Pro on that crop only   few ¢
Conflict/agency  → Layer 4 DeepSeek (text)         fractions of ¢
```

**Estimated cost per full TPS application packet: a few cents to ~10¢.** Negligible against a paid translation/filing service. **Optimize for accuracy + privacy, not price.**

---

## Candidate output schema (Layer 2 vision arbiter)

```json
{
  "field": "patronymic",
  "value": "Тарасович",
  "can_read": true,
  "confidence": 0.0,
  "provider": "gemini-2.5-pro",
  "evidence_region": "crop bbox or page ref",
  "reason": "why this reading",
  "review_required": true
}
```
`review_required` stays `true` for ALL handwritten identity fields regardless of confidence. Vision output is never final — Central Brain + Review Gate decide.

---

## Integration order

1. **P1 (now, ~1–2 days):** Gemini vision arbiter for booklet handwritten fields, candidate-only, behind a feature flag, validated on the existing 5 fixtures. Biggest accuracy gain for least work.
2. **P2 (parallel):** benchmark harness (`scripts/ocr-provider-benchmark.mjs`).
3. **P3:** dataset + ground-truth JSONs (needs Taras — real docs + correct answers).
4. **P4:** run benchmark → lock provider per document type here.
5. **P5:** certificate parsers (Gemini Flash structured) for birth/marriage/divorce.
6. **P6:** provider router + rule/authority consolidation (from `DOCUMENT_RULE_COVERAGE_AUDIT.md`).

---

## Realistic outcome once integrated

| Document | Auto-fill target | Review |
|---|---|---|
| Printed certificates (birth/marriage/divorce) | 85–95% | light spot-check |
| ID / загранпаспорт (MRZ) | 90%+ | minimal |
| Handwritten booklet fields | 50–80% | mandatory |
| Final translation | — | always user-confirmed (8 CFR §103.2(b)(3)) |

**Pin exact prices in this file before each integration. Re-verify quarterly.**
