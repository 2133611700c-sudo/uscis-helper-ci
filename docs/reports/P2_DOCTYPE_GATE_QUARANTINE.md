# Document-Type Confidence Gate + Provider Output Quarantine (canonical core)

**Status:** DONE
**Branch:** `feat/canonical-doc-gate`
**Scope:** additive — `apps/web/src/lib/canonical/documentGate.ts` (pure). Two more canonical-core tracker lines. Unwired; no behavior change.

---

## 1. Why

Two complementary rules from the master plan's canonical-core list:

- **Document-Type Confidence Gate** — "unknown_page blocks recognized fields." If we are not confident *what* the document is, we cannot trust that a region maps to a field. A confident value read off an unknown page is a lie. So when doc-type confidence is below threshold, every field is quarantined for review.
- **Provider Output Quarantine** — "candidates until gates pass." A value is a *candidate* until it has cleared the gates; only fields needing no review are "accepted" for auto-use.

## 2. What landed

- `applyDocumentTypeGate(doc, docTypeConfidence, {threshold=0.7})` — at/above threshold the result is returned unchanged; below it, every field gets `reviewRequired = true` + reason `unknown_document_type`, and the document `requiresReview`. Idempotent (no duplicate reason).
- `partitionQuarantine(doc)` → `{ accepted, quarantined }` — accepted = fields needing no review; quarantined = everything still requiring confirmation. After a failed doc-type gate, `accepted` is empty.

## 3. Evidence

`apps/web/src/lib/canonical/__tests__/documentGate.test.ts` (6/6): low confidence quarantines every field with `unknown_document_type`; confident type unchanged (same object); threshold boundary passes; reason not duplicated; partition splits accepted vs quarantined; after a failed gate nothing is accepted.

```
documentGate.test.ts   6 passed (6)
Full web suite         2331 passed | 4 skipped (2335)
tsc --noEmit           0 errors
content guards         0 violations
```

## 4. Production-impact status

**None** — additive pure functions, unwired. These finish the canonical-core policy surface; the gates run inside the canonical pipeline once products migrate onto it.

## 5. Remaining (gated, unchanged)

Real-traffic parity (`ONE_BRAIN_SHADOW=1` in a canary) → migration → consolidation; Phase 4 finalization-lock / two-layer PDF proof / evidence-ledger table; Phase 6 ops; owner-gated source/visual items.
