# P2.2 — readCanonicalDocument adapter (TPS → CanonicalDocumentResult)

**Status:** DONE
**Branch:** `feat/canonical-adapter`
**Scope:** additive — `apps/web/src/lib/canonical/adapter.ts`. Imported by nothing in the live flow; no product behavior changes.

---

## 1. What it does

Maps the existing TPS reader's output (`TpsExtractedField[]`) into a single `CanonicalDocumentResult` using the P2.1 policy. This is the bridge that lets us build a canonical result from *real* extraction output and shadow-compare it (P2.3) before any migration — without yet switching any product onto it.

- `toCanonicalField(f)` — one TPS field → one `CanonicalField`: maps `extraction_source` → `SourceKind` (authority), derives the split confidence honestly (see §2), runs `decideReviewRequired`, builds a single-candidate `evidence[]`.
- `mergeCanonicalByKey(fields)` — groups fields sharing a key (e.g. `family_name` from both passport MRZ and EAD), retains **all** candidates as evidence, picks the highest-authority candidate as primary, and forces review on a material disagreement for a critical/high field.
- `readCanonicalDocumentFromTps(input)` — assembles the document; `requiresReview = any field reviewRequired`.

## 2. Two invariants (tested)

1. **Never lower a source module's review flag.** `reviewRequired = f.review_required || policyDecision`. A module-flagged field stays flagged even at perfect confidence.
2. **Never drop a candidate.** Every reading is kept in `evidence[]`; cross-source disagreement surfaces as `provider_disagreement` + review, never a silent pick.

## 3. Honest confidence derivation

TPS provides one provider `confidence` (→ `ocr`) plus validator pass/fail signals. The adapter only asserts `source_match` where it has real evidence — an MRZ check-digit pass → 0.99, a fail → 0.3. Layers with no signal (`field_match`, `normalization`) stay `null` and are **excluded** from the `final` min (not faked as 1). So a clean MRZ read keeps `final = ocr`; a failed check digit drags `final` to 0.3 and forces review.

A deliberately conservative mapping: `ocr_visual`/`ocr_keyword` map to generic `document_ocr`, **not** `passport_visual` — we do not promote a visual guess above EAD/I-94 without proof the zone is a passport VIZ.

## 4. Evidence

`apps/web/src/lib/canonical/__tests__/adapter.test.ts` (8/8): MRZ→0.99 source_match + final=ocr; MRZ check-fail → 0.3 + review; user_input → manual authority; module-flag preserved at conf 1.0; critical-field disagreement → review + 2 candidates retained + MRZ primary; agreeing reads → no disagreement review; document assembly requiresReview true with a critical field, false for a lone low field; hash chain still null (later phase).

```
adapter.test.ts   8 passed (8)
Full web suite    2300 passed | 4 skipped (2304)
tsc --noEmit      0 errors
content guards    0 violations
```

Also renamed the result type's always-false `readyForReview` to an honest `requiresReview` (added in #52, consumed by nothing — safe).

## 5. Production-impact status

**None** — additive, unwired. Safe.

## 6. Remaining (Phase 2–3)

- **P2.3** `ONE_BRAIN_SHADOW` flag — run TPS (and later Translation) through this adapter in shadow, diff the canonical result vs the live brain, emit a parity report. Default OFF.
- A Translation-side adapter (`readCanonicalDocumentFromTranslation`) mirroring this one, so both stacks produce the SAME canonical shape — the actual two-brain comparison.
- Hash-chain population + evidence-ledger table (Phase 3–4).
- Cross-document reconciliation beyond same-key merge (e.g. MRZ vs visual on the same passport) is partly covered by `mergeCanonicalByKey`; a fuller Cross-Document Contradiction Detector is later.
