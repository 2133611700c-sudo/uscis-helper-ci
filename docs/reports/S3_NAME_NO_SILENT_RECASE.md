# S3 — No-Silent-Correction (names) + audit of the other critical fields

**Status:** DONE
**Branch:** `fix/name-no-silent-recase`
**Scope:** safety-only. One shared name-formatter + 4 call-site swaps (EAD x2, passport x2). No schema, no review-gate, no dictionary change.

---

## 1. What S3 covers

Owner's S3 line: *no-silent-correction for name / patronymic / authority / date / series*. I audited all five and found that **four already preserve the raw read and flag `review_required=true` on uncertainty** — only **NAME** still silently mutated the value. So S3 = fix the name corruption + record the audit of the rest.

### Audit of the other four (verified by reading the code — already safe)
| Field | Function | Behavior |
|---|---|---|
| Patronymic | `reconcilePatronymic` (`packages/knowledge/src/patronymic.ts`) | `review_required=true` when generated/fragmentary — FLAGGED |
| Authority | `normalizeAuthority` (`packages/knowledge/src/normalize.ts:146`) | no dictionary match → `review_required=true`; only an exact pattern match returns `false` (deterministic, same standard as S1 exact match) — FLAGGED |
| Date | `normalizeDate` (`normalize.ts:95`) | parse failure → `review_required=true`; only a clean conversion returns `false` — FLAGGED |
| Series / number | `validatePassportPerforation` (`apps/web/.../passportPerforationValidator.ts`) | invalid format / ambiguous digits → `review_required=true` — FLAGGED |

None of these silently substitutes a *different* value the way geography did; they map deterministically and flag when unsure. No change needed.

## 2. The concrete name bug

`apps/web/src/lib/tps/modules/ead.ts` and `passport.ts` produced `normalized_value` with a naive title-cast `s[0] + s.slice(1).toLowerCase()` and `review_required=false`. That **corrupts the controlling Latin spelling** of real names:

```
"O'BRIEN"          → "O'brien"          (apostrophe segment lowercased)
"PETRENKO-VASYL"   → "Petrenko-vasyl"   (hyphen segment lowercased)
"VAN DER BERG"     → "Van der berg"     (EAD never split on spaces at all)
"McDonald"         → "Mcdonald"         (deliberate mixed case destroyed)
```

`raw_value` was preserved (better than the old geography bug), but the corrupted `normalized_value` is what flows downstream — and `review_required=false` means no prompt to catch it. Per the project rule *"controlling Latin spelling (MRZ/I-94/EAD) beats re-transliteration"*, mangling that spelling's case is exactly a silent correction we must not make.

## 3. The fix

New shared helper `packages/knowledge/src/formatLatinName` (single source of truth, used by both modules):
- a read that is **already mixed-case** carries deliberate casing → **preserved verbatim** (McDonald, O'Brien, DeWitt);
- an all-UPPER / all-lower read → title-cased **per alphabetic segment** (`\p{L}+` splits on space / hyphen / apostrophe), so every part keeps its own initial capital.

Call sites: `ead.ts` family_name + given_name; `passport.ts` family_name + given_name. `raw_value` and the passport `review_required` (gated on MRZ check digits) are unchanged — this fixes the *value corruption itself*.

## 4. Test evidence

`apps/web/src/lib/tps/modules/__tests__/nameNoSilentRecase.test.ts` (6/6): O'Brien, hyphenated, multi-word, mixed-case-preserved, simple all-caps (no regression), trim/empty.

```
nameNoSilentRecase.test.ts  6 passed (6)
Full web suite              2272 passed | 4 skipped (2276)
tsc --noEmit                0 errors
content guards              0 violations
```

## 5. Production-impact status

**Before:** LIVE in TPS EAD + passport extraction — any name with an apostrophe, hyphen, multiple words (EAD), or deliberate mixed case was silently re-cased to a wrong spelling with `review_required=false`.

**After:** those names keep the correct controlling spelling; mixed-case reads are preserved untouched. Simple all-caps names still title-case exactly as before (no regression).

## 6. Remaining risk (written)

- **All-caps Mc/Mac/De-class residual:** "MCDONALD" with no mixed-case signal still title-cases to "Mcdonald" — the internal capital is unrecoverable from caps alone. `raw_value` is preserved for the reviewer; a surname-particle dictionary is out of scope. Low risk for the Ukrainian-document user base.
- The Translation stack renders names via its own path (`renderValue`/orchestrator); this PR only touches the TPS EAD/passport modules where the naive cast lived. If a Translation-side name cast is later found, it should reuse `formatLatinName`.

## 7. Scope discipline

Changed: new `formatLatinName.ts` + index export, 4 one-line call-site swaps (ead.ts, passport.ts), new test, this report, STATUS/HANDOFF/CHANGELOG. No review-gate / schema / dictionary changes.
