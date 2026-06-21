# MESSENGINFO FULL STATUS AUDIT
**Generated:** 2026-05-08  
**Auditor:** Claude (evidence-based, no code modified)  
**Project root:** `/Users/sergiiivanenko/work/uscis-helper`  
**Branch:** `main`

---

## EXECUTIVE SUMMARY

| Question | Answer |
|---|---|
| Overall status | 🔴 RED |
| Can user complete paid translation today? | **NO** — live pages return 403 |
| Can real PDF be generated today? | **NO** — only HTML email |
| Is OCR real? | **PARTIAL** — endpoint real, wizard may use mock |
| Is Stripe working? | **BLOCKED** — env vars missing locally; unknown on prod |
| Is private data safe? | **VERIFIED** — no private files in git |

---

## PHASE 1 — ENVIRONMENT + GIT

| Item | Status | Evidence |
|---|---|---|
| Branch | main | `git branch --show-current` |
| Uncommitted changes | 1 file | `supabase/migrations/20260508000001_fix_translation_orders_schema.sql` — not staged |
| Package manager | pnpm | `pnpm-lock.yaml` present |
| Private files in git | VERIFIED clean | `git ls-files` grep found only `tps-ukraine.png` (public asset) |

**Last 10 commits:**
```
a079b79 feat(translate.html): full site header — real logo, dark theme toggle
ed1a0cb fix(translate.html): match main site header
fc052c1 fix: invalid JS object key 'pages.length' → 'pageCount'
db1f792 fix: Ukrainian apostrophe in JS string
59c9807 feat: translation wizard v13 prototype — multi-page upload, per-page pricing
38cf804 fix: selected plan card text contrast + progress bar
9338907 fix(cards): uniform card height — gradient banner
ad82a08 feat(wizard): price-first flow + OCR name auto-extract
60518e2 chore: remove diagnostic logging from checkout route
```

⚠️ Most recent commits are to `translate.html` (public static prototype) — not to the Next.js app routes.

---

## PHASE 2 — PROJECT STRUCTURE

| File / Route | Status | Path |
|---|---|---|
| Translation landing page | VERIFIED | `apps/web/src/app/[locale]/services/translate-document/page.tsx` |
| Translation wizard (App Router) | VERIFIED | `apps/web/src/app/[locale]/services/[slug]/wizard/` |
| Checkout page | VERIFIED | `apps/web/src/app/[locale]/services/translate-document/checkout/` |
| OCR extract endpoint | VERIFIED | `apps/web/src/app/api/ocr/extract/route.ts` |
| OCR translate endpoint | VERIFIED | `apps/web/src/app/api/ocr/translate/route.ts` |
| PDF generate endpoint | PARTIAL | `apps/web/src/app/api/translation/generate-pdf/route.ts` |
| Stripe checkout endpoint | VERIFIED | `apps/web/src/app/api/stripe/checkout/route.ts` |
| Stripe webhook endpoint | **MISSING** | Not found anywhere in codebase |
| pdf-lib PDF generator | PARTIAL | `apps/web/src/lib/packet/pdf.ts` — exists, NOT wired |
| Mock OCR | ⚠️ EXISTS | `apps/web/src/lib/translation/mockOCR.ts` |
| **TranslateWizard.tsx** | ⚠️ DUPLICATE | 1,345 lines |
| **TranslationWizard.tsx** | ⚠️ DUPLICATE | 2,581 lines — **WHICH ONE IS ACTIVE?** |
| doc_templates/ | **MISSING** | Not found anywhere |
| KZU files | **MISSING** | Not found anywhere |
| Test files (.test.*, .spec.*) | **MISSING** | Zero test files in entire project |
| translate.html (orphan) | ⚠️ EXISTS | `apps/web/public/translate.html` — static prototype still present |

**Critical finding:** Two wizard components coexist. No evidence of which one is wired to the actual route. `mockOCR.ts` exists — risk that wizard still uses fake data path.

---

## PHASE 3 — LIVE SITE AUDIT

| URL | HTTP Status | Status |
|---|---|---|
| `https://messenginfo.com/en/services/translate-document` | **403 FORBIDDEN** | ❌ FAILED |
| `https://messenginfo.com/en/services/translate-document/start` | **403 FORBIDDEN** | ❌ FAILED |
| `https://messenginfo.com/translate-wizard.html` | 308 → redirects to `/en/services/translate-document/start` | ⚠️ PARTIAL |

**P0 FINDING:** Both main translation pages return HTTP 403 from Cloudflare. Real users cannot access the product today. Cause: likely Cloudflare WAF rule, Vercel middleware auth, or deployment failure.

---

## PHASE 4 — TRANSLATION WIZARD AUDIT

| Required Step | Status | Evidence |
|---|---|---|
| 1. Select doc type BEFORE upload | UNKNOWN | Can't verify — live page 403 |
| 2. Upload / take photos | UNKNOWN | Can't verify — live page 403 |
| 3. Count pages | PARTIAL | Code references `pageCount` field (fixed in fc052c1) |
| 4. Validate document | UNKNOWN | No validation route found |
| 5. Pricing: 3 pages + $3/extra | PARTIAL | Wizard v13 has per-page pricing UI; server does NOT verify |
| 6. Checkout collects profile once | PARTIAL | `generate-pdf` payload has profile fields |
| 7. Review extracted fields | PARTIAL | OCR route returns fields; wizard review screen unknown |
| 8. Certification + e-signature | PARTIAL | `signatureDataUrl` in payload; `signatureMethod` present |
| 9. Generate real PDF packet | **FAILED** | Only HTML email sent |

**Additional findings:**
- `mockOCR.ts` still in codebase — unknown if wizard bypasses real OCR endpoint
- `translate.html` is a static prototype (v13) still live in public/ — confusing
- Two wizard components — likely one is dead code, but no confirmation

---

## PHASE 5 — OCR / AI AUDIT

| Item | Status | Evidence |
|---|---|---|
| OCR endpoint | VERIFIED | `POST /api/ocr/extract` — real implementation |
| Primary provider | VERIFIED | DeepSeek-V3 (`deepseek-chat`) text parse from Tesseract.js raw_text |
| DEEPSEEK_API_KEY | VERIFIED | Present in `.env.local` |
| Secondary provider | PARTIAL | OpenAI vision — gated by `ENABLE_OPENAI_VISION=true` (not set) |
| OPENAI_API_KEY | MISSING | Commented out in `.env.local` |
| Confidence scoring | VERIFIED | Returns `confidence` (0–1), warns if < 0.4 |
| Low-confidence flagging | VERIFIED | `warnings` array in response |
| Privacy — image to cloud | VERIFIED SAFE | Base64 only sent to OpenAI if flag set; DeepSeek gets text only |
| OCR translate endpoint | VERIFIED | `POST /api/ocr/translate` — ICAO transliteration via DeepSeek |
| Supabase quality logging | VERIFIED | `translation_quality_log` table, fire-and-forget |
| mockOCR.ts active in wizard | **UNKNOWN** | File exists; needs wizard code trace to confirm |
| Rate limiting | VERIFIED | 15 req/min per IP |

**PARTIAL finding:** Real OCR pipeline is well-built. Main risk: wizard may still call `mockOCR.ts` instead of the real endpoint. Needs tracing.

---

## PHASE 6 — PDF GENERATOR AUDIT

| Item | Status | Evidence |
|---|---|---|
| Real downloadable PDF | **FAILED** | `generate-pdf/route.ts` line 1: "PDF is currently delivered as HTML email attachment" |
| pdf-lib installed | VERIFIED | `lib/packet/pdf.ts` imports `pdf-lib` |
| pdf-lib wired to route | **FAILED** | `generate-pdf/route.ts` does NOT call `generateTranslationPDF()` |
| Output: summary page | FAILED | No PDF generated at all |
| Output: original pages included | FAILED | Not implemented |
| Output: e-signature in PDF | PARTIAL | `signatureDataUrl` saved but only in HTML email |
| "CERTIFIED COPY" watermark | ❌ **P0 LEGAL** | `generate-pdf/route.ts:57` — `<div class="watermark">CERTIFIED COPY</div>` |
| Email delivery | PARTIAL | HTML sent via Resend, no PDF attachment |
| User downloads PDF | **FAILED** | No PDF file is ever created |

**Verdict: FAILED — PDF generation is not production-ready.**  
`lib/packet/pdf.ts` is dead code. Route sends HTML email and asks user to print-to-PDF manually.

---

## PHASE 7 — STRIPE / CHECKOUT AUDIT

| Item | Status | Evidence |
|---|---|---|
| `stripe/client.ts` | VERIFIED | Properly structured, null-safe |
| `STRIPE_SECRET_KEY` locally | **MISSING** | Not in `.env.local` |
| `STRIPE_PRICE_ID_TRANSLATION_BASIC` | **MISSING** | Not in `.env.local` |
| `STRIPE_PRICE_ID_TRANSLATION_PLUS` | **MISSING** | Not in `.env.local` |
| `STRIPE_PRICE_ID_TRANSLATION_PREMIUM` | **MISSING** | Not in `.env.local` |
| Stripe on Vercel (prod) | UNKNOWN | Cannot verify without dashboard access |
| Webhook route | **MISSING** | No `api/stripe/webhook` route found |
| Page-based dynamic pricing | **FAILED** | Server uses static `priceId` — client can't pass extra-page count |
| Client price tampering risk | ⚠️ YES | `plan` sent from client body, no server-side page count verification |
| Success/cancel URLs | VERIFIED | Properly set in checkout route |
| Order status update post-payment | **FAILED** | No webhook handler = no order confirmation |

**Verdict: BLOCKED locally. UNKNOWN on production. No webhook = no order fulfillment loop.**

---

## PHASE 8 — EMAIL / RESEND AUDIT

| Item | Status | Evidence |
|---|---|---|
| `RESEND_API_KEY` | VERIFIED | Present in `.env.local` |
| PDF attached to email | **FAILED** | Only HTML body sent |
| User receives PDF | **FAILED** | User receives HTML email only |
| Admin notification | VERIFIED | Admin email in commit `ad82a08` (2133611700uscis@gmail.com) |
| Disclaimer in email | VERIFIED | "not a law firm" present in HTML template |
| "CERTIFIED COPY" in email HTML | ❌ **P0** | Watermark div present in buildCertHtml() |

---

## PHASE 9 — SUPABASE / DATABASE AUDIT

| Item | Status | Evidence |
|---|---|---|
| Supabase env vars | VERIFIED | All 4 keys present in `.env.local` |
| Migration files | VERIFIED | 12 migration files, latest 2026-05-08 |
| `translation_orders` table | VERIFIED | Migration `20260507235900_translation_orders.sql` |
| `translation_quality_log` | VERIFIED | Migration `20260507073801` |
| `audit_log` | VERIFIED | Referenced in checkout route |
| `manual_review_queue` | VERIFIED | Migration `20260505000001` |
| Uncommitted migration | ⚠️ | `20260508000001_fix_translation_orders_schema.sql` not staged |
| Uploaded originals stored | UNKNOWN | No storage bucket confirmed in code review |
| Retention / delete policy | UNKNOWN | No evidence found |
| PII minimization | UNKNOWN | Schema not fully audited |

---

## PHASE 10 — DOCUMENT TEMPLATE / KZU AUDIT

| Item | Status |
|---|---|
| `doc_templates/` folder | **MISSING** |
| `ua_birth_certificate_modern` KZU | **MISSING** |
| `ua_passport_booklet_1994` KZU | **MISSING** |
| `schema.json` | **MISSING** |
| `labels.en.json` | **MISSING** |
| `labels.es.json` | **MISSING** |
| `renderer_rules.json` | **MISSING** |
| `validation_rules.json` | **MISSING** |
| `qa_checklist.md` | **MISSING** |
| `test_cases/` | **MISSING** |
| KZU used by wizard or PDF | **MISSING** |

**Verdict: KZU work exists only in planning documents and conversation. Zero implementation in codebase.**

---

## PHASE 11 — PRIVATE DOCUMENT ANALYSIS OUTPUT AUDIT

| File | Status |
|---|---|
| `inventory/document_inventory.csv` | VERIFIED ✅ |
| `inventory/document_inventory.json` | VERIFIED ✅ |
| `grouped/document_groups.json` | **MISSING** |
| `reports/duplicates_review.md` | **MISSING** |
| `reports/missing_pages_report.md` | **MISSING** |
| `reports/conflicts_report.md` | **MISSING** |
| `reports/rejected_documents.md` | **MISSING** |
| `reports/KZU_READINESS_REPORT.md` | **MISSING** |
| `logs/privacy_check.md` | **MISSING** |
| Private docs in git repo | VERIFIED CLEAN ✅ |
| SAFE folder outside repo | VERIFIED ✅ |

Only 2 of 10 required Phase 2 outputs exist. Visual classification of 158 documents not completed.

---

## PHASE 12 — LEGAL / COPY AUDIT

| Finding | Risk | File | Line |
|---|---|---|---|
| `<div class="watermark">CERTIFIED COPY</div>` | ❌ **P0 LEGAL** | `generate-pdf/route.ts` | 57 |
| `'Download Certified Translation (.html)'` | ⚠️ P1 | `TranslationWizard.tsx` | 434 |
| `'Certified Translation'` (label) | ⚠️ P1 | `TranslationWizard.tsx` | 455, 846, 849 |
| `<title>Certified Translation — ...` | ⚠️ P1 | `TranslationWizard.tsx` | 846 |
| "not a law firm and is not a translation agency" | ✅ GOOD | `translate-document/page.tsx` | 191 |
| 8 CFR §103.2(b)(3) referenced | ✅ GOOD | Multiple files | |
| "Draft template only — not a certified translation" | ✅ GOOD | `generateLabOutputs.ts` | 157 |

**"CERTIFIED COPY" watermark is the most dangerous item.** USCIS does not accept self-certified "certified copies" — only certified translations. The watermark implies the platform is certifying a copy of the original, which it has no authority to do.

---

## PHASE 13 — TESTS / BUILD AUDIT

| Item | Status |
|---|---|
| Test files | **MISSING** — zero `.test.*` or `.spec.*` files found |
| TypeScript typecheck | NOT RUN (live site 403 makes this secondary) |
| Build | NOT RUN |
| Lint | NOT RUN |
| CI/CD | Unknown |

Build not run — live 403 is higher priority to diagnose first.

---

## P0 BLOCKERS (critical — product cannot function)

1. **🔴 LIVE SITE 403** — `/en/services/translate-document` and `/start` return HTTP 403 from Cloudflare. No user can access the translation product today. Must investigate: Cloudflare WAF rule, Vercel middleware, failed deployment, or password protection.

2. **🔴 NO REAL PDF** — `generate-pdf/route.ts` sends only HTML email. `lib/packet/pdf.ts` (pdf-lib) is dead code, not wired. User never receives a downloadable PDF file.

3. **🔴 "CERTIFIED COPY" WATERMARK** — `generate-pdf/route.ts:57` embeds a "CERTIFIED COPY" watermark. This is legally incorrect and misleading for USCIS submissions.

4. **🔴 STRIPE MISSING LOCALLY** — `STRIPE_SECRET_KEY` and all 3 translation price IDs absent from `.env.local`. No webhook handler exists. After Stripe payment, no server confirms the order.

5. **🔴 NO STRIPE WEBHOOK** — Without `/api/stripe/webhook`, successful payments are never confirmed server-side. Order fulfillment loop is broken.

---

## P1 ISSUES (important, not immediately blocking on prod if Stripe is set on Vercel)

1. **Two wizard components** — `TranslateWizard.tsx` (1,345 ln) and `TranslationWizard.tsx` (2,581 ln) coexist. Unknown which is active. Dead code risk, maintenance hazard.

2. **mockOCR.ts active path unknown** — `mockOCR.ts` exists. If wizard calls it instead of `/api/ocr/extract`, users get fake extraction silently.

3. **translate.html still public** — Static prototype at `public/translate.html` still accessible. Creates UX confusion and SEO duplication.

4. **"Certified Translation" label** — In `TranslationWizard.tsx` output labels. Should be "Self-Certified Translation" per 8 CFR §103.2(b)(3) positioning.

5. **No page-count pricing server verification** — Client sends `plan` only; server trusts it. Extra-page pricing ($3/page) is UI-only — no server enforcement.

6. **Uncommitted Supabase migration** — `20260508000001_fix_translation_orders_schema.sql` not committed. Schema may be out of sync with git.

---

## P2 CLEANUP (technical debt)

1. Zero test coverage across entire project
2. KZU templates: 0 of required files exist
3. Phase 2 private doc analysis: 8 of 10 required reports missing
4. `STRIPE_PRICE_ID_TRANSLATION_SINGLE` deprecated env var still referenced in `isStripeConfigured()`
5. OpenAI vision path commented out — either remove or document as future feature
6. No Sentry error tracking configured

---

## INSTALLED / CONFIGURED

| Component | Status |
|---|---|
| DeepSeek | VERIFIED — API key present, endpoint real |
| Stripe | PARTIAL — code real, env vars missing locally |
| Resend | VERIFIED — API key present |
| Supabase | VERIFIED — all keys present, 12 migrations |
| pdf-lib | PARTIAL — installed, NOT wired |
| Tesseract.js (client OCR) | PARTIAL — referenced in comments, not confirmed in wizard |
| Tests | MISSING |
| KZU templates | MISSING |
| Stripe webhook | MISSING |
| OpenAI Vision | MISSING (key not set) |

---

## SECURITY / PRIVACY FINDINGS

- ✅ No private Ukrainian documents in git repo
- ✅ SAFE output folder correctly outside repo
- ✅ DeepSeek OCR receives text only (not raw images)
- ✅ Rate limiting on OCR endpoint (15 req/min)
- ⚠️ Admin email hardcoded in git commit history (2133611700uscis@gmail.com)
- ⚠️ Client controls `plan` parameter — no server-side verification of page count or price
- ❌ No webhook signature verification (no webhook handler at all)

---

## RECOMMENDED NEXT 5 ACTIONS (ordered by business impact)

1. **Fix the 403 immediately** — Diagnose why Cloudflare/Vercel blocks `/en/services/translate-document`. Check: Vercel deployment status, middleware auth, Cloudflare WAF rules. Nothing else matters until users can reach the page.

2. **Wire pdf-lib into generate-pdf route** — Call `generateTranslationPDF()` from `lib/packet/pdf.ts` in the route. Remove "CERTIFIED COPY" watermark. Return real PDF as `application/pdf` download. Remove HTML-only workaround.

3. **Add Stripe webhook handler** — Create `/api/stripe/webhook/route.ts`. Verify signature. Update `translation_orders` on `checkout.session.completed`. Commit the uncommitted Supabase migration.

4. **Add Stripe env vars + confirm prod config** — Add `STRIPE_SECRET_KEY` and 3 price IDs to local `.env.local`. Verify same vars exist on Vercel. Test full payment flow end-to-end locally first.

5. **Identify active wizard + kill duplicate** — Trace which component (`TranslateWizard` or `TranslationWizard`) is imported by the active route. Delete the dead one. Confirm real OCR endpoint is called, not `mockOCR.ts`.

---

*Audit complete. No code was modified. All findings are evidence-based.*
