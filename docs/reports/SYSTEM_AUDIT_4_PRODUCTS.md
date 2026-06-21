# 4-Product System Audit + Translation UI Unification

**Date:** 2026-05-27 · **Mode:** Read-only audit + targeted UI restyle. No business logic changed.
**Verified against:** USCIS official forms (uscis.gov/i-821, /i-765, /i-131) — no invented forms; everything maps to real USCIS forms used by the team's existing code.

## A. What actually works — verified per product

| Product | Page | Wizard | USCIS Form | PDF Generated | Status |
|---|---|---|---|---|---|
| **TPS Ukraine** | `/services/tps-ukraine/start` | ✅ 6 steps (TPSWizardV2) | I-821 + I-765 + I-912 | ✅ pdf-lib, Edition 01/20/25 | **WORKING** |
| **ReParole U4U** | `/services/re-parole-u4u/start` | ✅ 5 steps (ReparoleWizardV2) | I-131 | ✅ pdf-lib, Edition 01/20/25 | **WORKING** |
| **EAD / Work Permit** | `/services/ead-work-permit/start` | ✅ 7 steps (EADWizard) | I-765 | ❌ **HTML worksheet only — no filled PDF** | **«0» — confirmed** |
| **Translation** | `/services/translate-document` | ✅ wizard | Certified per 8 CFR §103.2(b)(3) | ⚠️ PDF generated, but from **mock-hardcoded** review data + ungated `/api/translation/generate-pdf` (separate audit `TRANSLATION_ENGINE_REALITY.md`) | **STYLED + WIRING BUG** |

### EAD = "0" — exact mechanic (`components/services/ead/EADWizard.tsx`)
- Line 471: `generatePacketHTML(data, locale)` returns an HTML string.
- Line 708: `downloadHtmlFile(html, 'i765-preparation-worksheet.html')` — `.html`, not `.pdf`.
- Line 521 header explicitly says: *"⚠ DRAFT ONLY — preparation reference, not the official USCIS form."*
- There is **no `/api/ead/*` route** — packet generation is fully client-side HTML.
- User must then manually fill the official I-765 from uscis.gov/i-765.

**To make EAD parity with TPS/ReParole:** add `lib/ead/i765FieldMap.ts` (or reuse `lib/tps/forms/i765FieldMap.ts` with EAD-specific defaults) + `api/ead/generate-packet/route.ts` calling `pdf-lib` against `public/uscis/i-765.pdf`. The TPS i765 map already exists — most of the work is wiring + EAD-specific category mapping (c11/c08/a12/c19). Estimate: 1–2 days. Blocked on owner priority decision.

## B. Unified design — translation wizard now visually matches TPS

`components/services/translation/TranslateWizard.tsx` CSS block (lines 425-502) rebuilt to share TPS tokens. **No behavior change** — pure visual unification + accessibility hardening for the 30-80yo audience.

| Token / property | Before | After (matches TPS) |
|---|---|---|
| Primary accent | LITERAL `#1a6b4a` (ignored global) | `var(--accent)` — globally **`#10a37f`** (same as TPS) |
| Hover accent | LITERAL `#145a3d` | `var(--accent-hover)` — globally `#0e8f70` (light) / `#13b890` (dark) |
| Warning palette | `--gold:#c59a3a` (local) | `var(--warning-{bg,border,text})` — TPS vars |
| Info palette | — | `var(--info-{bg,border,text})` added |
| Container width | 440px (phone-narrow) | **760px** (TPS, more readable for older eyes) |
| Body text | 15px | **17px** (WCAG body minimum) |
| H1 | 26px / weight 700 | **28px / weight 800** |
| H2 | 18px / weight 700 | **20px / weight 800** |
| Subtitle | 15px | **17px** |
| Primary button | padding 16px, no minHeight | **48px min-height**, font 18px weight 800 |
| Small button | font 12px, no minHeight | font 14px, **44px min-height** |
| Back button | inline link, font 14px | **44px tap target**, font 16px, hover bg |
| Edit link | font 12px, no padding | font 14px, **44px tap target**, hover bg |
| Plan card border | 2px solid | **2.5px solid** + 1px soft shadow |
| Upload zone border | 2px dashed | **2.5px dashed** (TPS UploadDrop parity) |
| Inputs | 15px font | **17px font, 48px min-height**, focus ring |
| Focus visibility | browser default | explicit **3px outline + 2px offset** on every interactive |
| Field-value text | 16px | **17px** |
| Field-label uppercase | 12px | **13px** (legible for elderly) |
| Status card | flat bg | bg + **1.5px border** (visible boundary) |
| Warning box | 13px text | **15px text**, themed border/bg |
| `.tw-detect-card-icon` | 28px | **32px** |
| `.tw-status-icon` | 48px | **56px** |
| Checkbox accent | local | **TPS green**, 24×24px |

**Result:** identical brand green, identical typography hierarchy, WCAG 2.5.5 tap targets everywhere, visible focus outlines (keyboard + low-vision), dark-mode-ready (all colors via CSS vars). Verified: 0 type errors, 2128 tests pass, drift gate green, content guards pass.

## C. What is NOT fixed by the restyle (separate issues)

1. **Translation wizard uses mock-hardcoded review data** (Shevchenko/1814) instead of real OCR of the uploaded document — `TRANSLATION_ENGINE_REALITY.md §1` flagged this. Restyling makes the UI look more professional WITHOUT fixing this; if anything, prettier UI for fake data is a worse liability. **Independent action required** (owner D2 decision).
2. **`/api/translation/generate-pdf` has no payment verification** (`route.ts:83` hardcodes `payment_confirmed: true`).
3. **EAD does not generate a filled I-765 PDF** — only HTML worksheet (§A above).

These three are separate from the design-unification work and need owner decisions / a follow-up engineering iteration.

## C.bis Self-audit corrections (2026-05-27, post-commit)

Two real errors found by critical self-review:
1. **Actual brand color is `#10a37f`** (set globally in `apps/web/src/app/globals.css:90,153`), not `#0d5a34` as the earlier table suggested. The unification is functionally correct (both wizards now resolve `--accent` to `#10a37f`); the table was describing dead-code fallback values instead of the runtime color. Corrected above.
2. Memory index `MEMORY.md` had typo "Prostionets" → fixed to "Prostianets".

EAD = 0 verified directly (not via agent): `EADWizard.tsx:166,240,314,388` all download `.html`; no `/api/ead` route exists.

## D. Honest scope of this change

- ✅ Audit of 4 products' form-generation — done, all claims at file:line.
- ✅ Translation UI visually unified with TPS (colors, typography, accessibility for 30-80yo).
- ✅ Zero behavior change, zero new tests broken, drift gate green.
- ⛔ Did not touch the translation wiring bug (mock data / ungated PDF) — outward-facing change, needs owner D2.
- ⛔ Did not build EAD PDF generation — substantial work (1–2 days), needs owner priority.
- ⛔ Did not invent any USCIS forms — every product maps to real, existing USCIS forms (I-821, I-765, I-131, certification per 8 CFR §103.2(b)(3)).

## E. The unified base (recap)
All four products can now consume the **Document Intelligence spine** (`lib/docintel`) for OCR + transliteration. ReParole already calls `/api/ocr/extract`; TPS booklet has the Gemini arbiter wired (flag OFF); EAD and Translation are next adoption candidates — each is a `readDocument(image, docTypeId)` call away.
