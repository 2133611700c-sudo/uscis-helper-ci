# Cross-Document Contradiction Detector (canonical core, Quality)

**Status:** DONE
**Branch:** `feat/cross-doc-contradictions`
**Scope:** additive — `apps/web/src/lib/canonical/contradictions.ts` (pure). Imported by nothing live; no behavior change.

---

## 1. Why

The same field can be read from DIFFERENT documents (passport MRZ vs I-94 vs EAD vs DL) and disagree — e.g. a DOB that differs between the passport and the EAD card. The adapter merge picks a provisional highest-authority winner; the plan's Quality list also wants a detector that **reports** such conflicts so a human resolves them — a critical/high cross-document contradiction must never be silently reconciled.

## 2. What landed

- `findCrossDocumentContradictions(fields, canonicalize?)` → `Contradiction[]`: per field key, the distinct candidate values across all evidence; a key with ≥2 materially-different values is a contradiction. Each `Contradiction` carries `criticality`, the `candidates` (value + source + provider, ordered highest-authority first), and `blocking` (true for critical/high). Case/whitespace differences and an optional KMU-55-style canonicalizer collapse non-conflicts.
- `hasBlockingContradiction(fields, canonicalize?)` — convenience boolean for a gate.

This complements `mergeCanonicalByKey` (which resolves) with a reporter (which surfaces), both driven by the same source-authority + material-difference rules.

## 3. Evidence

`apps/web/src/lib/canonical/__tests__/contradictions.test.ts` (6/6): agreement → none; critical DOB differs across passport/EAD → blocking, MRZ candidate first, `hasBlockingContradiction` true; low field differs → reported, not blocking; case/whitespace → none; single source → none; canonicalizer collapses transliteration-equivalent values.

```
contradictions.test.ts   6 passed (6)
Full web suite           2351 passed | 4 skipped (2355)
tsc --noEmit             0 errors
content guards           0 violations
```

## 4. Production-impact status

**None** — additive pure function, unwired. It plugs into the canonical pipeline once products migrate onto it (a blocking contradiction → review, per Law 1's no-silent-correction corollary).

## 5. Remaining (gated, unchanged)

Migration needs real-traffic parity; Phase 4 PDF/ledger; Phase 6 ops; owner-gated items; data-minimization (extraction redesign).
