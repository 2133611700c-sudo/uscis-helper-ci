# P2.1 — CanonicalDocumentResult contract (types + policy)

**Status:** DONE
**Branch:** `feat/canonical-contract`
**Scope:** additive — new `apps/web/src/lib/canonical/` module (types + pure policy). NO product is wired to it yet; nothing in any existing flow changes.

---

## 1. Why this is the foundation

The core defect is the **two-brain problem**: TPS and Translation run different recognition stacks and can produce different values for the same document — a legal error. The fix is contract-first: define ONE output shape (`CanonicalDocumentResult`) with ONE set of review rules, build + shadow-test it, then migrate products onto it. This PR is step 1 — the contract and its decision logic, with zero behavior change, so the rest can be built against a stable, tested core.

## 2. What landed

`apps/web/src/lib/canonical/`:
- **`types.ts`** — `CanonicalField` (rawValue always preserved, normalizedValue as suggestion, split `FieldConfidence`, `evidence[]`, `reviewRequired`+reasons, `rejectedReason`), `CanonicalDocumentResult` (one per document, `hashes` chain, `product`, `readyForReview`), `SourceKind`, `Criticality`.
- **`policy.ts`** — the shared rules, all pure:
  - `computeFinalConfidence` / `buildConfidence` — `final ≤ min(applicable layers)`; a `null` layer is excluded (not treated as 1); no applicable layer → 0. `final` is always derived, never provider-set.
  - `criticalityOf` + `CRITICAL_FIELDS` — the §B matrix; the six critical fields.
  - `materiallyDifferent` — no-silent-correction comparator (case/whitespace/punctuation ignored; optional KMU-55-style canonicalizer).
  - `sourceRank` / `higherAuthority` — MRZ > passport visual > gov.ua > I-94 > EAD > DL > document OCR > AI vision > manual.
  - `resolveDisagreement` — material disagreement on critical/high → forces review, both candidates retained.
  - `decideReviewRequired` — combines critical-field invariant + confidence threshold + no-silent-correction + disagreement into `{reviewRequired, reasons[]}`.

This codifies S1 (geography) and S3 (names) as general rules and adds the confidence/criticality/authority/disagreement policy from the constitution doc.

## 3. Evidence

`apps/web/src/lib/canonical/__tests__/policy.test.ts` — 16/16, one per acceptance bullet of `FIELD_CONFIDENCE_AND_CRITICALITY_POLICY.md §F`:
- final = weakest applicable layer; null excluded; no-layer → 0; provider final ignored;
- six critical fields critical; matrix high/medium/low; critical never auto-final even at 1.0;
- case/whitespace not material; a different value is material → review + raw kept; canonicalizer equivalence;
- MRZ outranks all, manual lowest;
- material disagreement on critical → review, higher-authority provisional; agreement → no review; low-field disagreement → no review;
- high field below 0.85 → review, at/above → not.

```
policy.test.ts   16 passed (16)
Full web suite   2292 passed | 4 skipped (2296)
tsc --noEmit     0 errors
content guards   0 violations
```

## 4. Production-impact status

**None** — additive types + pure functions, imported by nothing in the live flow. Zero risk to TPS/Translation/EAD/Re-Parole. This is intentionally a safe foundation PR.

## 5. Remaining (the rest of Phase 2–3, sequenced)

- **P2.2** `readCanonicalDocument` adapter over the strongest existing reader — produce a `CanonicalDocumentResult` from current extraction output (still not wired to products).
- **P2.3** `ONE_BRAIN_SHADOW` flag + run TPS and Translation through the adapter in shadow, diff vs the live brain, emit a parity report (default OFF).
- Then: per-product migration behind the flag, then consolidation (remove the second brain), then the evidence ledger table (EVIDENCE_LEDGER_SPEC).
- The hash-chain fields exist on the type but are not yet populated (P2.2+).
