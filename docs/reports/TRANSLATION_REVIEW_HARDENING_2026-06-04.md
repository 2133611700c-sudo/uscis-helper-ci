# Translation Review Hardening — 2026-06-04

STATUS: PASS (local runtime + build/test), PRODUCTION UNVERIFIED UNTIL DEPLOY

## Root cause closed

Public Translation Wizard could move a user toward payment/download while OCR-flagged fields still existed, because:

1. `TranslateWizard.tsx` did not require explicit resolution of `review_required` OCR fields before payment/download.
2. `/api/translation/generate-pdf` enforced signer/checklist/signature, but not unresolved OCR review fields from the legacy public wizard payload.

## Files changed

- `apps/web/src/components/services/translation/TranslateWizard.tsx`
- `apps/web/src/lib/translation/reviewGate.ts`
- `apps/web/src/app/api/translation/generate-pdf/route.ts`
- `apps/web/src/lib/translation/__tests__/reviewGate.test.ts`
- `apps/web/src/components/services/translation/__tests__/certifierUx.test.ts`

## What changed

- Added shared unresolved-review detection in `reviewGate.ts`.
- Hardened `generate-pdf` to reject legacy wizard payloads with unresolved OCR fields.
- Added explicit user resolution path in the public wizard:
  - edit a flagged OCR field, or
  - explicitly confirm an unchanged flagged OCR field.
- Blocked payment and final PDF download until flagged OCR fields are resolved.

## Evidence

### Static / build gates

- `pnpm --filter web exec tsc --noEmit --pretty false` → PASS
- `pnpm --filter web test` → PASS (`137 passed | 2 skipped`, `2859 passed | 4 skipped`)
- `pnpm --filter web run build` → PASS

### Local live browser proof

Target:

- `http://localhost:3101/en/services/translate-document/start`

Fixture:

- `test-fixtures/real-docs/internal_passport_ivanenko.jpg`

Observed result on real OCR run:

```json
{
  "reviewBadgesBefore": 4,
  "confirmButtonsBefore": 4,
  "payDisabledBefore": true,
  "reviewBadgesAfter": 0,
  "confirmButtonsAfter": 0,
  "payDisabledAfter": false
}
```

Interpretation:

- OCR surfaced 4 review-required fields in the public Translation Wizard.
- Payment was blocked before those fields were resolved.
- After explicit human confirmation of all 4 fields, review flags disappeared and payment became available.

## Remaining truth boundary

- Production is not yet re-verified because this fix is still local until committed/pushed/deployed.
- Server-side unresolved-field hard block is covered by unit test and build path, but not yet by a paid/owner end-to-end production run.
