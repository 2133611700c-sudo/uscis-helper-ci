# P2.2-translation — Translation reader → CanonicalDocumentResult (the second brain)

**Status:** DONE
**Branch:** `feat/canonical-adapter-translation`
**Scope:** additive — `apps/web/src/lib/canonical/adapterTranslation.ts`. Imported by nothing live; no behavior change.

---

## 1. Why

P2.2 gave the TPS half. This is the **Translation half**: map the Translation reader's output (`ExtractedField`) into the SAME `CanonicalDocumentResult` shape. With both adapters emitting one canonical shape, P2.3's `diffCanonical` can finally measure the two brains against each other on a single document — the actual two-brain measurement, not a claim.

## 2. What it does

- `toCanonicalFieldFromTranslation(f)` — one `ExtractedField` → one `CanonicalField`, mirroring the TPS adapter and the same two invariants (never lower the reader's `review_required`; never drop a candidate).
- Source inference (Translation has no explicit source enum): `user_corrected` → `manual_user_entry`; an MRZ `source_zone` → `mrz`; otherwise `ai_vision` (the Translation stack reads primarily via Gemini vision; deliberately ranked **below** document OCR so a vision guess cannot outrank a labelled read).
- Honest confidence: `ocr` = provider confidence; `source_match` only asserted for an MRZ zone whose `passes` include a check-digit pass; unknown layers `null` (excluded from the `final` min).
- `readCanonicalDocumentFromTranslation(input)` — assembles the document (`product: 'translation'` by default), reusing `mergeCanonicalByKey`.

## 3. The payoff — cross-brain parity (tested)

`adapterTranslation.test.ts` includes the first real two-brain measurement: build a TPS-canonical and a Translation-canonical for the **same** document and run `diffCanonical`:
- both brains agreeing → `parityRate = 1`, `criticalDisagreements = 0`;
- the two brains disagreeing on `family_name` → `disagree = 1`, `criticalDisagreements = 1` (caught, not silently reconciled).

This is the instrument the whole migration depends on: we will not switch any product onto the canonical brain until the parity numbers on real documents say the brains agree (and every disagreement is surfaced for review).

## 4. Evidence

```
adapterTranslation.test.ts   5 passed (5)   (incl. 2 cross-brain parity cases)
Full web suite               2313 passed | 4 skipped (2317)
tsc --noEmit                 0 errors
content guards               0 violations
```

## 5. Production-impact status

**None** — additive, unwired. Safe.

## 6. Remaining (Phase 2–3)

- **Live shadow wiring** (next, owner-visible): behind `ONE_BRAIN_SHADOW=1`, run the matching canonical adapter alongside the live TPS/Translation extraction and `console.info(summarizeParity(diffCanonical(live, canonical)))` — observe-only, no output change. This produces the real-traffic parity numbers.
- Then: a parity threshold, per-product migration behind the flag, consolidation (remove the second brain), evidence-ledger table + hash-chain population.
