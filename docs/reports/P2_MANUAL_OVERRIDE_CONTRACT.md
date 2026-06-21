# Manual Override Contract (canonical core)

**Status:** DONE
**Branch:** `feat/canonical-manual-override`
**Scope:** additive — `apps/web/src/lib/canonical/manualOverride.ts` (pure). Completes the last canonical-core tracker line. Imported by nothing live; no behavior change.

---

## 1. Why

`FIELD_CONFIDENCE_AND_CRITICALITY_POLICY §D` requires a precise contract for a user correction: it is the **lowest** authority source, applied **only after explicit confirmation**, and it must **preserve the prior value** + a rejected reason — never silently overwrite. This is also how a critical field's mandatory review is *resolved* (the override IS the human confirmation).

## 2. What it does

`applyManualOverride(field, userValue)`:
- sets `normalizedValue = userValue.trim()` and `source = 'manual_user_entry'`;
- **preserves the prior machine value** as an `evidence[]` entry (`provider: 'pre_manual_override'`) — the document's reading is never lost;
- records `rejectedReason: 'superseded_by_manual_user_entry'` when the override actually replaced a materially different value;
- clears `reviewRequired` and `reviewReasons` (the override is the confirmation), and sets a user-confirmed confidence (`final = 1.0`).

## 3. Evidence

`apps/web/src/lib/canonical/__tests__/manualOverride.test.ts` (5/5): sets value+manual source+clears review; preserves prior as evidence + rejectedReason; same-value confirmation → no rejectedReason; trims; repeated overrides don't lose the prior.

```
manualOverride.test.ts   5 passed (5)
Full web suite           2318 passed | 4 skipped (2322)
tsc --noEmit             0 errors
content guards           0 violations
```

## 4. Production-impact status

**None** — additive pure function, unwired. This completes the canonical-core contract surface (types + policy + both adapters + parity + shadow + manual override). The single recognition brain's data model and rules are now fully specified and tested; what remains is collecting real-traffic parity and the controlled migration.

## 5. Remaining (Phase 2–4, gated)

- Cross-stack shadow on real traffic (owner-gated, extra AI call) → parity threshold → per-product migration behind the flag → consolidation (remove the second brain).
- Phase 4: Finalization Lock (reviewSnapshotHash), Two-Layer PDF Proof, Evidence Ledger table + hash-chain population.
- Document-Type Confidence Gate and Provider Output Quarantine remain as separate canonical-core items.
