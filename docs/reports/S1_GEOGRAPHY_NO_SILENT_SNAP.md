# S1 — Geography No-Silent-Snap

**Status:** DONE
**Branch:** `fix/geography-no-silent-snap`
**Scope:** safety-only. One behavior change in `snapCity`. No refactor, no dictionary rewrite, no new product surface.

---

## 1. The exact owner-reported failure

Owner loaded a Ukrainian document; a place reading `с.м.т. Ярошенець` was **silently rewritten to `Тростянець`** and presented as if recognized. The end user could sign a translation containing a city they never lived in — a legal error, not a UX nit.

Reproduced before the fix:

```
snapCity('с.м.т. Ярошенець')
→ { value: "Тростянець", matched: true, distance: 3.4, review_required: true }
```

`value` was the fuzzy candidate (`GAZETTEER[bestIdx]`), so every downstream caller that reads `.value` (the orchestrator's `transliterateKMU55(m.value)`) emitted `Trostianets` with no trace of the raw read.

## 2. Root cause

`packages/knowledge/src/gazetteer.ts`, fuzzy branch returned `value: GAZETTEER[bestIdx]`. A *suggestion* (nearest gazetteer entry under the 0.34 confusion-distance threshold) was promoted to the *final value*. `matched` was even reported as ambiguous. The 0.34 threshold is right for **proposing** a candidate but is not, and can never be, proof of identity for a legal field.

`GEO_CORRECTIONS` in the TPS `dictionaryBridge.normalizeCity` does **not** contain `Ярошенець` — the bug is purely the `snapCity` fuzzy branch. No dictionary edit was needed or made.

## 3. The fix (single behavior change)

Fuzzy branch now:

```ts
return {
  value: cleaned,                  // RAW read preserved, never silently replaced
  matched: false,                  // we did NOT confirm identity
  distance: best,
  review_required: true,
  suggestedValue: GAZETTEER[bestIdx], // surfaced as a SUGGESTION only
  reason: 'fuzzy_geography_match',
}
```

- `PlaceMatch` gained `suggestedValue?: string | null`.
- Exact match unchanged: `value = gazetteer name`, `matched: true`, `review_required: false`, `suggestedValue: null`.
- Unknown geography: raw read kept, `review_required: true`, `reason: 'unknown_geography'`, no suggestion.

Callers already honor `review_required` (orchestrator `review: m.review_required || cf.review_required`), so the fuzzy case now forces human review instead of silently committing.

## 4. Test evidence

New: `apps/web/src/lib/translation/__tests__/geographyNoSilentSnap.test.ts`

- `Ярошенець` → `value` keeps raw `Ярошен…`, **not** `Тростянець`; `matched=false`; `review_required=true`; `suggestedValue='Тростянець'`; `reason='fuzzy_geography_match'`. ← locks the owner failure
- `Тростянець` exact → `value='Тростянець'`, `matched=true`, `review_required=false`, no suggestion. ← no exact-match regression
- unknown gibberish → raw kept, review, `reason='unknown_geography'`.

```
geographyNoSilentSnap.test.ts  3 passed (3)
Full web suite                 2261 passed | 4 skipped (2265)
tsc --noEmit                   0 errors
content guards                 0 violations
```

## 5. Production-impact status

**Live before fix:** any handwritten/OCR place within 0.34 confusion-distance of a seed-gazetteer entry was silently replaced in BOTH the Translation orchestrator and any TPS path reading `snapCity().value`. Affected the owner-reported `Ярошенець→Тростянець`. Severity: legal (wrong place of birth/residence on a signed document).

**After fix:** no silent geography replacement anywhere `snapCity` is used. Fuzzy reads surface a suggestion and require review.

## 6. Remaining risk (written, per the master-plan gate)

- The seed `GAZETTEER` is ~70 places, not the full KOATUU. A real village absent from the seed returns `unknown_geography` + review — safe (no silent replace), but no suggestion offered. Full KOATUU load is a separate data task, out of S1 scope.
- The UI must actually present `suggestedValue` and block until reviewed. The contract is now correct and `review_required` is honored by current callers; a dedicated review-surface for the geo suggestion is tracked separately (UX phase), not in S1.
- No change to TPS `dictionaryBridge` — its own `normalizeCity` exact-map path is untouched and was not the source of this bug.

## 7. Scope discipline

Changed files: `packages/knowledge/src/gazetteer.ts` (fuzzy branch + interface field), one new test, this report, plus required STATUS/HANDOFF/CHANGELOG. No unrelated code touched.
