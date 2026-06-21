# TPS per-document state reset (session isolation)

**Status:** DONE
**Branch:** `feat/tps-doc-state-reset`
**Scope:** safety — clear the per-document attestation / legal-risk / Part-7 state when a new TPS document session starts. Small, targeted.

---

## 1. The bug

In the TPS wizard, the attestation timestamp (`tps:attest:v1`), the three legal-risk flags (`tps:legal-risk:v1`) and the Part-7 background declaration (`wizard:tps-ukraine:part7:v1`) persist in `localStorage` so a returning user doesn't re-answer. But the `restart` handler reset the wizard (cleared the personal-fields blob, went to step 1) **without** clearing these — so after finishing person A's packet and restarting for person B, **person A's attestation + legal-risk answers carried into person B's packet**. That is a legal-integrity hazard — the TPS analogue of the Translation stale-state live failure the owner reported.

## 2. The fix

- New `apps/web/src/lib/tps/documentState.ts`: the per-document key constants + `clearTpsDocumentState(storage?)` — removes `tps:attest:v1`, `tps:legal-risk:v1`, `wizard:tps-ukraine:part7:v1`. Never throws; injectable storage for tests.
- `TPSWizardV2.restart` now calls `clearTpsDocumentState()` after clearing the personal-fields blob, so a new document starts with a clean attestation + legal-risk + Part-7 state.

The personal-fields blob was already cleared by `restart`; the manual "Clear my data" button already wiped all keys. This closes the *new-document* path specifically.

## 3. Evidence

`apps/web/src/lib/tps/__tests__/documentState.test.ts` (4/4): clears the three keys but preserves the personal blob; covers exactly those three keys; never throws (no storage / throwing storage); source guard that `restart` imports and calls `clearTpsDocumentState()`.

```
documentState.test.ts   4 passed (4)
Full web suite          2335 passed | 4 skipped (2339)
tsc --noEmit            0 errors
content guards          0 violations
```

## 4. Production-impact status

Targeted behavior fix in the TPS wizard's restart path: a new document no longer inherits the previous person's attestation/legal-risk/Part-7 answers. No change to extraction, payment, or packet generation otherwise. A user re-doing the SAME document via page refresh (matching-schema restore) is unaffected — only an explicit restart clears.

## 5. Remaining (notes)

- Full per-`documentSessionId` namespacing of all TPS keys (vs clear-on-restart) is a larger refactor; clear-on-new-document achieves the isolation goal minimally.
- Data-minimization (crop+label) + retention remain separate Phase-5 items.
