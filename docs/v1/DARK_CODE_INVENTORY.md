# DARK_CODE_INVENTORY — V1_COMPLETION phase 2 (PREPARED EVIDENCE)

> **Status:** prepared evidence, produced while phase 1 (STAGING_CONTROL_PLANE) is
> the active phase. The V1 program state is **unchanged** — this report does NOT
> advance the pipeline; it is the static inventory phase 2 needs, ready to slot in
> once phase 1 is merged. Read-only audit (2 sub-agents + spot re-verification).
> No code changed. No provider/Stripe calls. PR #119 untouched.

## ⚠️ Corrections to earlier audits (re-verified in code)
- **`TPS_AI_BRAIN_ENABLED` is effectively ON in production**, not OFF. `isBrainEnabled()` (`apps/web/src/lib/tps/ai/documentBrain.ts:189`) returns true whenever `DEEPSEEK_API_KEY` is set and `TPS_AI_BRAIN_ENABLED !== '0'`. DeepSeek is a core dependency, so the **paid DeepSeek TPS fallback is live** (only when the rule module is sparse/failed).
- **`DUAL_OCR_CROSSREF` is ON by default** (`route.ts:361,669`: `!== 'false'`) → the **paid Gemini booklet cross-reference is live** in the TPS path.
- `CONFIRMED_VALUE_GUARD_MODE` default = `shadow` (validate+log, no block) — confirmed.
- `certifier_override_audit` table has **no INSERT writer** (only a SELECT in `lib/admin/statusDashboardData.ts:84`) — created-but-dark.

## A. Feature-flag inventory (what is OFF/non-default + can it be trialed on STAGING)

**Legend:** paid = calls a billable provider (Gemini/Vision/DeepSeek).

### SAFE to trial on staging — zero provider cost, review/log-only
| flag | default | what | paid | test |
|---|---|---|---|---|
| KNOWLEDGE_BRAIN_ENABLED | **ON** (`!=='0'`) | D2 dictionary authority (oblast/agency/patronymic/KMU-55); conflicts → review, never silent | no | yes |
| SMART_NORMALIZE_ENABLED | OFF | patronymic reconcile + authority registry; review-only | no | yes |
| ANTI_FABRICATION_GATE_ENABLED | OFF | force review on handwritten-risk identity fields; never changes values | no | yes |
| QUALITY_GATE_ENABLED | OFF | reject too-small images before spending Vision budget | no | yes |
| GUARD_BLOCK_METRICS_ENABLED | OFF | PII-free guard-block logging (calibration) | no | yes |
| DOCUMENT_CLASS_METRICS_ENABLED | OFF | PII-free doc-class logging | no | yes |
| MRZ_TRANSLATION_ENABLED | OFF | MRZ→authoritative passport fields; fail-open | no | (integration) |
| MIRROR_PDF_ENABLED | OFF | render structured English mirror when schema exists | no | yes |
| PASSPORT_SCHEMA_DUAL_RENDER_ENABLED | OFF | legacy+mirror parity logging | no | yes |
| ONE_BRAIN_SHADOW | OFF | observe-only canonical parity log | no | yes |
| CANONICAL_MODE_* | shadow | per-product canonical persistence; enforce only via product-scoped env | no | yes |
| CONFIRMED_VALUE_GUARD_MODE | shadow | server-side value validation (shadow=log only) | no | yes |

### NEEDS budget approval — paid provider calls (gate behind providerBudget + OCR cache)
| flag | default | paid provider | note |
|---|---|---|---|
| AUTO_ORIENT_ENABLED | OFF | Gemini Vision | rotation pre-pass per image; **also had a regression** (wrong rotation direction) — needs corpus proof |
| ENSEMBLE_DATE_ENABLED | OFF | Gemini Vision | zoomed date re-read on handwritten-risk docs |
| TPS_GEMINI_VISION_ARBITER_ENABLED | OFF | Gemini Vision (client PII) | booklet arbitration; privacy + budget review |
| **TPS_AI_BRAIN_ENABLED** | **ON if DEEPSEEK_API_KEY** | DeepSeek | **already live in prod** — must be covered by the cost ceiling |
| **DUAL_OCR_CROSSREF** | **ON** (`!=='false'`) | Gemini Vision | **already live in prod** — must be covered by the cost ceiling |

### RISKY / DO NOT enable without a regression suite
| flag | default | why risky |
|---|---|---|
| RU_TRANSLIT_ENABLED | OFF | reverted 2026-06-12 — amplified Russified reads on real Ukrainian docs |
| OCR_FIELD_SAFETY_ENABLED (C3) | OFF | rolled back after a false-positive incident; strongest gate but needs new validation |
| SELF_CONSISTENCY_GATE_ENABLED | OFF | requires ANTI_FABRICATION; 2–4× re-reads (latency; provider-neutral if same image) |
| CERTIFIER_OVERRIDE_ENABLED | OFF | ADR-021; "remain OFF until explicit activation" |
| REFUND_AUTOTICKET_ENABLED | OFF | operational policy; needs finance/product approval |

## B. Dead / superseded code (removal DEFERRED — inventory only)
| rank | item | evidence | risk | action |
|---|---|---|---|---|
| 1 | `apps/web/src/data/formIntelligence/i131.ts` | header `⚠️ DEPRECATED`; 0 runtime imports; real logic in `reparole/` | LOW | remove (later phase) |
| 2 | `/api/review` → `reviews` table | no migration creates `reviews`; route insert fails silently → user feedback lost | MED | create table or remove route |
| 3 | `lib/canonical/core/readDocumentCore.ts` | imported only in `__tests__`; routes assemble pipeline manually | LOW | quarantine |
| 4 | `certifier_override_audit` table | hardened (triggers/RLS) but **0 INSERT writers** | (decide intent) | confirm ADR-021 intent before relying on it |
| 5 | `shadow.ts` / `liveShadow.ts` | behind `ONE_BRAIN_SHADOW=OFF`; observe-only | LOW | keep (dormant infra) |
| 6 | `form_sessions` / `form_answers` | only in generated types; 0 runtime refs (superseded by `wizard_sessions`/`manual_answers`) | LOW | drop tables if confirmed unused |
| — | `generateTranslationHTML.ts` transliterator | **CORRECTION: it IS used** (internal HTML-gen path), not dead | — | keep |

## C. Actionable output for the pipeline
1. **Cost ceiling is urgent, not optional**: TPS_AI_BRAIN (DeepSeek) and DUAL_OCR_CROSSREF (Gemini) are **already live and paid** in prod. `providerBudget` caps + OCR cache must cover the live paths, not only future benchmarks.
2. **Staging trial batch (zero-cost)**: the 12 "safe" flags above can be enabled together on staging for measurement once staging exists.
3. **Paid flags**: enable on staging only behind `providerBudget` (default-deny) + OCR cache + explicit per-run/daily/monthly caps.
4. **Do not enable** RU_TRANSLIT / OCR_FIELD_SAFETY without a printed-Cyrillic regression corpus (phase 4/5).
5. **Dead-code removal** stays deferred to its own gated step; `/api/review` silent-loss and `certifier_override_audit` dark-table are the two worth an explicit decision.

*Prepared 2026-06-14 from read-only static analysis + spot re-verification. No runtime change; program remains on phase 1 (STAGING_CONTROL_PLANE).*
