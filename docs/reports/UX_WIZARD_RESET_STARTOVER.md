# UX — Translation wizard reset + Back / Start-over

**Status:** DONE
**Branch:** `feat/wizard-reset-startover`
**Scope:** UX recovery affordances. Strengthens the existing `resetAll`, adds a Back + Start-over on the review screen. No backend, no payment, no recognition change.

---

## 1. Why

The live-failure investigation (Session 69) found a user could be stuck on a **bad recognition** with no clean way to recover: the review screen (5) had no top Back button, and there was **no full "Start over"** anywhere except the success screen. Combined with stale session state this produced the "Шуляк/Тарас/Проскурів" class of confusion. The session-isolation fix stopped stale *restores*; this adds the explicit, user-driven *reset*.

## 2. What changed

- **`resetAll` strengthened** — it now clears EVERY piece of session state, not just a subset: adds `certifierAddress`, `dataReviewed`, `accuracyAttested`, `paymentLoading`, `pdfLoading`, `procStep`, `stripeCheckoutId`, and removes **both** persisted keys (`tw:v2:draft` **and** `tw:cs`). Previously the attestation inputs and the Stripe checkout id survived a "reset," so a fresh start could inherit stale data.
- **New `startOver`** — confirms data loss (`window.confirm(t.start_over_confirm)`), calls `resetAll`, returns to the doc-type screen (2).
- **Review screen (5) controls** — a top **Back** (→ screen 3, re-upload) and a **Start over** button (→ `startOver`). Both use the existing `tw-back-btn` style; consistent with screens 2/3/6.
- **i18n** — `start_over` + `start_over_confirm` added to the RU base and EN override (UK/ES fall back to RU per the wizard's existing merge).
- The success-screen "Translate another" (`s7_restart`) already called `resetAll`; it now benefits from the fuller reset.

## 3. Evidence

`apps/web/src/components/services/translation/__tests__/wizardResetStartOver.test.ts` (4/4, source-level — same node-env approach as `sessionIsolation.test.ts`): resetAll clears attestation + checkout id + both storage keys; startOver confirms→resets→screen 2; review screen has Back(→3) + Start-over; RU/EN copy present.

```
wizardResetStartOver.test.ts  4 passed (4)
Full web suite                2276 passed | 4 skipped (2280)
tsc --noEmit                  0 errors
content guards                0 violations
```

## 4. Production-impact status

Additive UX. No change to recognition, payment, review-gate, or PDF output. A stuck user can now go Back to re-upload or fully Start over from the review screen; "Start over" can no longer leave behind stale attestation/checkout state.

## 5. Remaining risk (written)

- `window.confirm` is a native dialog — functional and accessible but not styled to the design system. Acceptable for a destructive-action guard; a custom modal is a later polish.
- UK/ES show the RU "Start over" copy via the existing fallback (same as other untranslated keys). Localizing those strings is a trivial follow-up.
- Source-level test (no DOM render) — it locks the wiring, not pixel behavior; consistent with the repo's existing wizard tests.
