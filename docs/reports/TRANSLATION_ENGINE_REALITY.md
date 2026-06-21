# TRANSLATION_ENGINE_REALITY — what is actually built vs wired

**Date:** 2026-05-27
**Mode:** READ-ONLY assessment. No code changed. Claims verified at file:line; the urgent finding (§1) was re-verified by me directly, not taken from a sub-agent.
**Why this matters:** The document translator — Cyrillic → professional English — is the main profit product (needed across TPS, ReParole, EAD: every filing attaches translated passport/birth/marriage certs). It is far more built than prior audits assumed, but has one live liability and two launch blockers.

---

## 1. 🔴 URGENT — live integrity/liability risk (verified directly)

The standalone page `/[locale]/services/translate-document`:
- **Is promoted and reachable** — linked from `pricing/page.tsx` (8 CTA hrefs), `sitemap.ts:29`, i-94-guide, attorney-directory, tps-status, uscis-case-status, and the TPS wizard (`TPSWizardV2.tsx:393,613`).
- **Takes real Stripe payments** ($14.99 / $19.99 / $29.99).
- **Does NOT process the user's uploaded document.** `TranslateWizard.tsx:506-518` injects hardcoded review data (ШЕВЧЕНКО/ТАРАС/09.03.1814). The flow never calls upload/extract/classify; it calls the legacy `/api/translation/generate-pdf`.
- **`generate-pdf/route.ts` has no payment verification** — line 83 hardcodes `payment_confirmed: true`, takes `profile` from the request body, generates a PDF and emails it (Resend). `session_id` is optional, defaults to `'legacy'`.

**Net:** a promoted, paid page for immigration documents takes money and returns a translation not derived from the user's document. **Not confirmed: whether the page is currently enabled in production** (may be behind a page-level gate). FIRST ACTION: confirm prod reachability; if live, gate/unlink immediately. This is a legal + reputational risk for a USCIS-document service.

---

## 2. 🟢 What is genuinely built (and well-engineered)

The translation BACKEND is serious, not scaffolding:

| Component | Files | State |
|---|---|---|
| Per-certificate extraction prompts (birth/marriage/divorce) | `extraction/*ExtractionPrompt.ts` | Excellent: patronymic-safe, ЗАГС/РАЦС preserved (no ДРАЦС modernization), nominative-case restoration, UA genitive months. ⚠️ may not be wired into live extract route (verify). |
| Document modules + classifier | `modules/*.module.ts`, `classifier.ts`, `registry.ts` | Real. Birth/marriage/divorce/death/passport/ID + manualReview. All certs `status:'draft'` → route to manual review (auto-PDF off). |
| Handwriting/numeric validators | `numericAccuracy/digitShapeComparator.ts` (0↔O,1↔I,6↔9), `monthMapValidator.ts`, `dateFieldLockValidator.ts`, `passportPerforationValidator.ts` | Real quality gates, not stubs. |
| Manual-review human-in-the-loop | `manualReview/*` | **Production-grade.** Tickets in `manual_review_queue`, events log, notifications to user + operator + Telegram (Resend), 11 routing rules, idempotent, **hard render-gate that cannot be bypassed**. |
| Bureau-style templates + certification | `templates/*.template.ts`, `bureauStyleRenderer.ts`, `certificationRecord.ts` | USCIS 8 CFR 103.2(b)(3) compliant; forbidden-phrase guards; patronymic enforced. |
| Real API routes | `upload`, `classify`, `extract` (DeepSeek), `render` (4 gates), `certify`, `[sessionId]/ocr-from-storage` (real Google Vision) | Wired for the TPS path. |
| Standards research | `TRANSLATION-STANDARDS.md` | Thorough: USCIS reqs, Soviet-era doc rules, competitor pricing ($10–25/pg), target market (510k+ Ukrainians). |

---

## 3. 🟠 The two launch blockers

**B1 — Backend and public UI are disconnected.** The smart pipeline (ocr-from-storage → extract → validate → render → certify) is wired for TPS. The standalone `translate-document` UI bypasses it (mock data + legacy generate-pdf). The halves aren't connected.

**B2 — Certificate modules are `status:'draft'`** → every birth/marriage/divorce upload routes to manual review; no auto-PDF. The sophisticated extraction prompts are defined but possibly not invoked by the live `extract` route (the route uses a generic prompt). Needs verification + real-fixture E2E before promotion.

---

## 4. Shared root weakness (same as TPS)

**No model ever sees the image.** Translation path = Google Vision → DeepSeek **text** (`field-mapper.ts:11` explicitly: "Do NOT use DeepSeek Vision"). When Vision misreads handwritten Cyrillic, the text mapper inherits the error and cannot recover it. **The Gemini vision arbiter (Phase 1) fixes BOTH products at once.** The translation path is, however, operationally more robust than TPS: real numeric validators + a real manual-review fallback already exist.

The memory constitution ("Review Gate: NOT BUILT") is **stale** — render gates and a manual-review system both exist in code.

---

## 5. Independent strategic read — the path to launch is SHORT

Because so much exists, a real translator is close — and it can launch HONESTLY today, because the human manual-review system is real:

1. **NOW (liability):** confirm if `translate-document` is live; if so, gate/unlink it OR convert it to the honest flow below. Do not keep taking money for mock output.
2. **Honest launchable v1:** route uploads through the EXISTING manual-review system → "AI draft + human review → certified PDF". The infrastructure (tickets, notifications, render gate, certification) is already built. This is a defensible product on day 1, no new tech needed.
3. **Wire the real pipeline** into the standalone UI (upload → ocr-from-storage → extract prompts → validate → render → certify). Kill the legacy mock generate-pdf path.
4. **Add the Gemini vision arbiter** (Phase 1) — fixes handwritten Cyrillic for translation AND TPS.
5. **Printed certificates first:** birth/marriage/divorce are mostly printed → promote modules from draft after real-fixture E2E. Handwritten/Soviet-era → manual review (already honest).
6. **Reuse readinessPolicy discipline:** one source of truth, no parallel gates.

**Realistic product:** printed certs → high auto-fill + light review; handwritten/old → real human review → certified. Both already have the infrastructure.

---

## 6. What needs verification next (cheap, high-value)
- Is `translate-document` enabled in production right now? (gate decision hinges on this)
- Are the per-certificate extraction prompts actually called by `/api/translation/extract` or is a generic prompt used? (determines if extraction intelligence is dormant)
- Does the TPS-side `ocr-from-storage` real pipeline produce acceptable output on a real printed certificate? (the first auto-PDF candidate)

*Read-only. No code changed. §1 re-verified directly: TranslateWizard.tsx:506-518 (mock data), generate-pdf/route.ts:83 (payment_confirmed hardcoded), pricing/page.tsx + sitemap.ts (page is linked/promoted).*
