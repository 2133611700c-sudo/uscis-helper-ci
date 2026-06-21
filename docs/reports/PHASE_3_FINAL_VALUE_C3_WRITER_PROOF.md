# Phase 3 — CanonicalField.finalValue + C3 as Only Writer

**Date:** 2026-06-09
**Branch:** docs/ocr-canary-closeout-rollback
**Tsc errors:** 0
**Tests:** 2992 passed / 0 failed / 4 skipped (of which 18 are new Phase 3 contract tests)

---

## What Changed

| File | Change |
|------|--------|
| `apps/web/src/lib/canonical/types.ts` | Added `finalValue?: string \| null` to `CanonicalField` with full ADR-017 C3 contract comment |
| `apps/web/src/lib/documentSafety/applyOcrFieldSafety.ts` | Added `finalValue` to `SafeField` interface; C3 now writes `finalValue=string` on accept, `finalValue=null` on reject |
| `apps/web/src/lib/canonical/core/translationAdapter.ts` | `canonicalToFieldOut`: `value` uses `finalValue !== undefined ? finalValue : (normalizedValue ?? rawValue ?? null)` |
| `apps/web/src/lib/canonical/core/tpsAdapter.ts` | `canonicalFieldToTpsField`: `normalized_value` uses same finalValue-first pattern |
| `apps/web/src/lib/canonical/core/eadAdapter.ts` | `getValue` helper uses finalValue-first pattern |
| `apps/web/src/lib/packet/pdf.ts` | `planTranslationRows` type + logic updated to `final_value !== undefined ? final_value : normalized_value` |
| `apps/web/src/lib/documentSafety/__tests__/finalValueContract.test.ts` | 18 new contract tests covering all 3 states and all adapters |

---

## The finalValue Contract (3 States)

| State | Meaning | Adapter behavior |
|-------|---------|-----------------|
| `undefined` | C3 has not run (`OCR_FIELD_SAFETY_ENABLED=OFF`) | Fall back to `normalizedValue` (backward compat) |
| `null` | C3 ran and rejected the value (review/block/manual) | Value is null — must NOT be released |
| `string` | C3 accepted — this is the release value | Use this value directly (D6/PDF reads this) |

---

## C3 is the Only Writer

- `applyOcrFieldSafety` (C3) writes `finalValue` in both paths:
  - `r.final_value_allowed = true` → `finalValue = acceptedValue` (normalizedValue preferred, falls back to value)
  - `r.final_value_allowed = false` → `finalValue = null`
- D2 (`arbitrateDocument` / `applyKnowledge`) writes to `normalizedValue` and `suggestedValue` — NOT to `finalValue`. Verified by grep and test 10.
- No other module touches `finalValue`.

---

## Backward Compat Proof (flag OFF)

When `OCR_FIELD_SAFETY_ENABLED=OFF`:
- C3 is never called → `finalValue` stays `undefined` on all `CanonicalField` objects
- All adapter checks: `f.finalValue !== undefined ? f.finalValue : (f.normalizedValue ?? ...)`
- `undefined` branch always falls back to `normalizedValue` → byte-identical to Phase 2 behavior
- No production env changed.

---

## Test Evidence

```
Tests  2992 passed | 4 skipped (2996)
```

New tests (18): `src/lib/documentSafety/__tests__/finalValueContract.test.ts`
- CanonicalField.finalValue — default state (1 test)
- C3 accept path — finalValue = string (2 tests)
- C3 reject path — finalValue = null (2 tests)
- C3 optional/admin field acceptance (1 test)
- translationAdapter finalValue-first (5 tests)
- tpsAdapter finalValue-first (3 tests)
- eadAdapter finalValue-first (3 tests)
- D2 boundary — does not set finalValue (1 test)

---

## What Remains NOT Done

- **Payment ordering bug** (`generate-pdf/route.ts`): review gate (403) fires AFTER payment gate (402). Out of scope for this PR — noted but not fixed.
- **KNOWLEDGE_BRAIN_ENABLED canary**: owner-gated. Not enabled in prod.
- **OCR_FIELD_SAFETY_ENABLED prod canary**: owner decision needed. Flag stays OFF in prod.
- **PR cleanup** (dead flags, env cleanup): separate task.

---

## No PII

All tests use synthetic values (Kovalenko, Petrenko, EadAccepted, etc.). No real document data, no session IDs from real users.
