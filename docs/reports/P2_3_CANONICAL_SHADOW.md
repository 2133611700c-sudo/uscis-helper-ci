# P2.3 — ONE_BRAIN_SHADOW parity diff + flag

**Status:** DONE
**Branch:** `feat/canonical-shadow`
**Scope:** additive — `apps/web/src/lib/canonical/shadow.ts`. Pure diff + an OFF-by-default flag. Imported by nothing in the live flow; no product behavior changes.

---

## 1. Why

The two-brain problem must be settled by **numbers**, not assertion. P2.3 ships the instrument: express two readers' output as `CanonicalDocumentResult` and diff them field-by-field, counting agreements, disagreements, and — the ones that matter legally — disagreements on critical/high fields. Once a Translation-side adapter exists (next), we run both stacks on the same document and read the parity off this report before migrating anything.

## 2. What it does

- `diffCanonical(left, right, canonicalize?)` → `ParityReport`:
  - per field key (union of both): `agree` / `disagree` / `left_only` / `right_only`;
  - uses the same `materiallyDifferent` comparator as the no-silent-correction rule (case/whitespace/punctuation ignored; optional KMU-55-style canonicalizer);
  - a present-on-both field where one side has no value counts as a real disagreement (not silently equal);
  - `criticalDisagreements` = disagreements on a critical/high field;
  - `parityRate` = agree / (agree+disagree+left_only+right_only), 1.0 when nothing to compare.
- `isShadowEnabled(env?)` — reads `ONE_BRAIN_SHADOW`; **only** `'1'`/`'true'` enables; default OFF. Gates shadow *logging* only — it can never change product output.
- `summarizeParity(report)` — one-line, **PII-free** summary: counts + disagreeing critical field *keys*, never values.

## 3. Evidence

`apps/web/src/lib/canonical/__tests__/shadow.test.ts` (8/8): identical → 100% parity; case/whitespace → still agree; critical value diff → criticalDisagreement; left_only/right_only counted; canonicalizer equivalence; summary contains keys but **not** values (PII guard); flag OFF by default, only `1`/`true` enables.

```
shadow.test.ts   8 passed (8)
Full web suite   2308 passed | 4 skipped (2312)
tsc --noEmit     0 errors
content guards   0 violations
```

## 4. Production-impact status

**None** — additive, unwired, observe-only by design. The flag defaults OFF and gates logging, never output. Safe.

## 5. Remaining (Phase 2–3)

- **Translation-side adapter** (`readCanonicalDocumentFromTranslation`) so both stacks emit the same canonical shape — the actual two-brain input to `diffCanonical`.
- **Live shadow wiring** (separate, owner-visible): behind `ONE_BRAIN_SHADOW=1`, run the canonical adapter alongside the live TPS/Translation path and `console.info(summarizeParity(...))` — observe-only, no output change. Held out of this PR to keep it additive.
- Then: a parity threshold gate, per-product migration behind the flag, consolidation (remove the second brain), evidence-ledger table.
