# Release Checklist — feat/c3-presence (PR #26)

**Rule:** do NOT merge to main until the Preview E2E section is all PASS.
Date: 2026-05-29.

## A. Local automated evidence (PASS/FAIL) — 6 CRITICAL

| # | Critical gap | Status | Evidence (test) |
|---|---|---|---|
| #1 | PDF silently dropped unread fields | ✅ PASS | `honest-pdf.test.ts` + `pdf-readback.e2e.test.ts` — MISSING row visible, `certifiable=false` |
| #2a | wizard hardcoded review on every field | ✅ PASS | code: real per-field flag propagated (`TranslateWizard` ~1115) |
| #3 | passport name re-transliterated vs MRZ | ✅ PASS | `mrz.test.ts` (IVANENKO/TARAS, check digits) + presence override |
| #4 | false "PDF sent to your email" | ✅ PASS | copy removed (ru+en), i18n drift 0 |
| #5 | manual doc paid, no ticket | ✅ PASS | wizard POSTs `/api/translation/manual-review` on paid manual docs |
| #6 | no pixel preprocessing | ✅ PASS | `preprocess.test.ts` (sharp + quality gate), wired into presence |

Plus high: #7 number homoglyph, #8 date calendar, #9 sex tri-state, #10 prose wired,
#11 era-gating (`glossary-wiring.test.ts`), #12 no silent degrade, #16 download
gated on real signature.

**Suite:** web 2202 pass + 1 skip, 0 type errors (web + knowledge); registry 11/11; i18n drift 0.

> Note: automated `local` ≠ live product. The Preview section below MUST be run by hand.

## B. Preview deploy (owner — Vercel)
- [ ] Branch `feat/c3-presence` deployed to a Vercel **Preview** (auto on push / from PR #26).
- [ ] Preview env vars present & SEPARATE from production: `GEMINI_API_KEY_PAY`,
      `GOOGLE_CLOUD_VISION_API_KEY`, `DEEPSEEK_API_KEY`, `CENTRAL_BRAIN_TRANSLATION=on`.
- [ ] `vision-extract` function maxDuration ≥ 60s allowed on the plan (3.1-pro ~16-40s).

## C. Preview E2E (run in the Preview URL)
- [ ] **Printed doc** (passport) → review → PDF with NO missing placeholders.
- [ ] **Handwritten/old doc** (1986 birth cert) → visible MISSING/review, NOT "ready".
- [ ] **Manual paid doc** (birth/marriage) → ticket row created; NO false email claim.

## D. PDF readback (open the generated PDF)
- [ ] MISSING fields visible as `____ [enter from document]`, not gone.
- [ ] Passport name = MRZ Latin (e.g. IVANENKO), not re-transliterated.
- [ ] `смт` rendered as "urban-type settlement", never "city/town".
- [ ] 1986 authority = Militsiya, not National Police.
- [ ] Download button disabled until a real on-screen signature.

## E. Gate / audit
- [ ] Cannot download a certified PDF without signing.
- [ ] Each field shows a source/provenance (registry source_url) in the audit row.

## F. Merge + production
- [ ] All A–E PASS → merge `feat/c3-presence` → `main`.
- [ ] Production smoke test immediately after deploy (same 3 E2E scenarios on prod).
- [ ] Rotate the OpenAI key (was pasted in chat) — deferred per owner.
