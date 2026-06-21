# Stage A Audit — `/ru/services/translate-document`
**Date:** 2026-05-06  
**Auditor:** Claude (AI agent)  
**Scope:** Full codebase + live page audit for P0 rebuild (elderly/low-vision Russian-speaking users)  
**Status:** COMPLETE — awaiting Taras sign-off before Stage B begins

---

## A. File map

| Path | Role |
|---|---|
| `apps/web/src/app/[locale]/services/translate-document/page.tsx` | Server page — breadcrumb, hero, sample preview, mounts wizard |
| `apps/web/src/components/services/translation/TranslationServiceExperience.tsx` | Thin client wrapper — reads `?from=` / `?return=` params, ErrorBoundary |
| `apps/web/src/components/services/translation/TranslationWizard.tsx` | 6-step multi-screen wizard (all UX logic lives here) |
| `apps/web/src/components/services/translation/TranslationSamplePreview.tsx` | Sample output preview shown above wizard |
| `apps/web/src/app/[locale]/services/translate-document/checkout/success/page.tsx` | Post-Stripe success — restores localStorage session, generates 4 files |
| `apps/web/src/app/[locale]/services/translate-document/checkout/cancel/page.tsx` | Post-Stripe cancel — links back |
| `apps/web/src/app/api/translation/upload/route.ts` | Upload to Supabase storage, creates `translation_orders` row |
| `apps/web/src/app/api/translation/process/route.ts` | GET/PATCH/POST order status + packet generation |
| `apps/web/src/app/api/translation/email/route.ts` | Sends 4 files via Resend |
| `apps/web/src/app/api/translation/email-capture/route.ts` | Lead email capture + welcome email |
| `apps/web/src/app/api/stripe/checkout/route.ts` | Creates Stripe checkout session (translation product) |
| `apps/web/src/lib/stripe/client.ts` | Stripe + price IDs config |
| `apps/web/messages/ru.json` (key: `translationService`) | All Russian copy for the page |

---

## B. Typography audit — CRITICAL FAILURES

**Baseline font size:** `globals.css` has NO `font-size` rule on `html` or `body`. Tailwind default = 16px base. 

**Wizard inline font sizes found:**
- Body copy / field labels: `14px`
- Secondary hints / file names: `12px`  
- Smallest text (warning notes): `11px`
- Page headers: `22px`
- Button text: `14–15px`

**P0 requirement:** ≥ 18px everywhere for elderly users.

**Verdict: 4 out of 4 text categories FAIL the 18px minimum.** The wizard was built for young tech users, not 60yo Russian speakers.

No hardcoded `text-slate-*` colors found — wizard uses `var(--text-1/2/3)` tokens correctly.

---

## C. Color contrast audit

| Token | Hex value | On `--bg` (#ffffff) | WCAG ratio | Status |
|---|---|---|---|---|
| `--text-1` | `#111827` | white | 16.1:1 | ✅ AAA |
| `--text-2` | `#374151` | white | 10.0:1 | ✅ AAA |
| `--text-3` | `#6b7280` | white | 4.48:1 | ⚠️ AA normal only — FAILS at 12px |

`--text-3` is used extensively in wizard hints, file names, and secondary labels at 11–12px — **WCAG AA failure** at those sizes. P0 spec requires high contrast throughout.

---

## D. Touch target audit

Wizard buttons use `padding: '12px 16px'` or `padding: '12px 20px'` inline styles. No `min-height: 48px` enforced anywhere. On mobile at default Tailwind 16px base, most interactive elements are 40–44px tall — below the 48px minimum.

**Verdict: Touch targets DO NOT meet 48px minimum.**

---

## E. Copy compliance — 7-rule guard check

| Rule | Status | Evidence |
|---|---|---|
| R1: No USCIS.gov impersonation | ✅ | Breadcrumb, hero use "Messenginfo" name |
| R2: No attorney/legal advice | ✅ | `ru.json` disclaimer present |
| R3: No "guaranteed approval" | ✅ | Not found |
| R4: No "certified translation" as product claim | ✅ FIXED | subtitle: "шаблон перевода" / "translation template" |
| R5: No invented contacts | ✅ | No phone numbers |
| R6: No invented prices except Stripe config | ✅ | $15 matches Stripe config |
| R7: No fake "AI" or "OCR" processing claims | ⚠️ RISK | See Section F |

**`draftOnlyBanner` (ru):** "Шаблон соответствует требованиям USCIS — вы подписываете заявление о подтверждении." ✅ Correct language.

---

## F. Capability matrix

| Capability | Code status | Live status | Risk |
|---|---|---|---|
| Upload to Supabase | ✅ Implemented | ✅ Live (bucket `documents`) | Low |
| OCR auto-fill | ⚠️ Partial | ❌ NOT functional | **HIGH** |
| DeepSeek AI client | ✅ Exists | ❓ Unknown if env set | Medium |
| Email delivery (4 files) | ✅ Implemented | ✅ Live (Resend) | Low |
| File auto-deletion / TTL | ❌ Missing | ❌ Missing | **HIGH (GDPR)** |
| Session tracking | ⚠️ Partial | Partial | Medium |
| Stripe payment | ✅ Code done | ❌ Needs env vars in Vercel | High (revenue) |
| Self-cert in output | ✅ File 2 | ✅ Live | Low |
| Multi-doc session | ✅ Stage 13C | ✅ Live | Low |
| Order history | ✅ Stage 13D | ✅ Live (localStorage) | Low |
| Pricing source of truth | ❌ Hardcoded $15 | ❌ Not configurable | Medium |
| Phone/chat CTA in hero | ❌ Missing | ❌ Missing | **HIGH (P0 spec)** |
| Telegram bot URL | ⚠️ Env var referenced | ❓ Value not confirmed | Medium |

### OCR disconnect — critical bug to document

`/api/translation/upload/route.ts` hardcodes:
```
ocr_status: 'manual_review_required',
fields_extracted: { note: 'OCR not yet implemented. Please fill fields manually.' }
```

The wizard has browser-side OCR (Tesseract.js) that is separate from the upload backend. The upload API does **not** run any OCR. If the wizard presents "photo upload → fields auto-filled" as a flow, users who upload via the API route will get **no auto-fill** and will see "manual review required". This is a hidden deception risk against Rule 7.

---

## G. UX flow map (current)

```
Landing page
  ↓ Breadcrumb hero (h1 22px, subtitle 14px)
  ↓ TranslationSamplePreview (trust signal)
  ↓ TranslationWizard
      Step 1: Choose document type
      Step 2: Upload photo (optional, calls /api/translation/upload)
      Step 3: Fill fields (OCR pre-fill IF browser Tesseract ran)
      Step 4: Source/target language
      Step 5: Era variant (Soviet vs modern docs)
      Step 6: Payment — Stripe $15 OR free fallback
        → success: /checkout/success → 4 HTML file downloads
        → cancel: /checkout/cancel → link back
```

**Missing from /ru/ perspective:**
- No "Позвоните нам" or chat widget above the fold
- No large-print explanation of what user gets before wizard starts
- Wizard step labels use abbreviated English-style UI (no "Шаг 2 из 6" confirmation visible at every step — verify)
- No confirmation screen summarizing what user is about to pay for before Stripe redirect

---

## H. Open questions — requires Taras answers before Stage B

**STOP. Do not begin Stage B until Taras answers these in writing.**

1. **Price config** — Is $15 permanent, or should there be a `TRANSLATE_PRICE_USD` env var so it can be changed without a code deploy?

2. **Telegram bot** — Is `TELEGRAM_BOT_URL` set in Vercel Dashboard today? If yes, what's the public bot handle? (Required for the "Support" CTA in wizard.)

3. **Global font-size increase** — The P0 spec requires 18px minimum. The only clean way to do this is `html { font-size: 18px }` in `globals.css`. **This affects every page on the site, not just translate-document.** Do you approve this global change? If not, we scope it to a `.wizard-container` class instead (more work, lower risk to other pages).

4. **Phone/chat number** — The P0 spec requires a visible "Позвоните нам" or "Напишите нам" CTA in the hero. What number or chat link should be displayed? (Without this, P0-2 cannot be completed.)

5. **OCR clarification** — Is browser-side Tesseract.js the intended OCR pipeline, or should the upload backend call DeepSeek? Currently both exist but are not connected to each other. Which should be the source of truth?

6. **File deletion** — Uploaded documents sit in Supabase `documents` bucket indefinitely. GDPR/privacy baseline requires auto-deletion after N days. Recommend 30 days. Do you approve adding a Supabase TTL policy or nightly cron function?

7. **Human translator** — After the user downloads the 4 HTML files, do they submit to a human translator at Messenginfo, or do they self-certify? The current UI implies self-certification (File 2 = "Translator Certification" that user signs). If Messenginfo is offering a human translator add-on, the flow needs a separate step. Clarify the product definition.

---

## I. P0 change list (preview — Stage B scope, pending sign-off)

If Taras signs off on the above, Stage B will address these in priority order:

| ID | Priority | Change | Prerequisite |
|---|---|---|---|
| P0-1 | CRITICAL | Global or scoped font-size ≥ 18px | Answer to Q3 |
| P0-2 | CRITICAL | Phone/chat CTA in hero above fold | Answer to Q4 |
| P0-3 | CRITICAL | Touch targets ≥ 48px on all wizard buttons | None |
| P0-4 | HIGH | Wizard step indicator: "Шаг X из Y" visible at all steps | None |
| P0-5 | HIGH | Pre-payment summary screen (what user gets for $15) | None |
| P0-6 | HIGH | Stripe env vars in Vercel Dashboard | Taras action |
| P0-7 | HIGH | Fix `--text-3` usage at small sizes (replace with `--text-2`) | None |
| P0-8 | MEDIUM | OCR disconnect — remove false "auto-fill" promise from UI if not functional | Answer to Q5 |
| P0-9 | MEDIUM | File TTL policy in Supabase | Answer to Q6 |
| P0-10 | MEDIUM | Price config env var | Answer to Q1 |

---

## J. Estimated Stage B effort

| Bucket | Items | Estimate |
|---|---|---|
| Typography + contrast | P0-1, P0-7 | 1–2h |
| Touch targets | P0-3 | 1h |
| Hero phone CTA | P0-2 | 30min (if phone provided) |
| Wizard UX | P0-4, P0-5 | 2h |
| Stripe + backend | P0-6, P0-8, P0-9, P0-10 | 1–2h |
| Guards + typecheck + build + deploy | Always required | 30min |

**Total Stage B: ~6–8h of dev work.** Parallelizable across 3 sub-tasks.

---

*End of Stage A Audit. Waiting for written sign-off.*
