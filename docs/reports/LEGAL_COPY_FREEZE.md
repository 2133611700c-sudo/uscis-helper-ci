# Legal Copy Freeze (certification text hash-pin)

**Status:** DONE
**Branch:** `feat/legal-copy-freeze`
**Scope:** a CI guard that pins the 8 CFR certification legal text + version. No runtime change.

---

## 1. Why

`CERTIFICATION_STATEMENT` is the legal text the user signs under 8 CFR §103.2(b)(3). It must not change silently — an accidental edit, a refactor, or an unreviewed wording tweak would alter what every user attests to. The plan requires the certification text be **versioned and hash-pinned**, changeable only via an ADR.

## 2. What landed

`apps/web/src/lib/translation/__tests__/legalCopyFreeze.test.ts` (3/3):
- pins `CERTIFICATION_VERSION === 'v1.0-8cfr-2026'`;
- pins `sha256(CERTIFICATION_STATEMENT) === efc6017…f2c4c` — any edit to the legal text fails the build with a message telling the engineer to write an ADR, bump the version, and update the pin;
- asserts the statement still references `8 CFR §103.2(b)(3)`.

The freeze procedure is documented in the test header: change text → ADR + version bump + update the pinned hash. This makes a legal-copy change a deliberate, reviewed act.

## 3. Evidence

```
legalCopyFreeze.test.ts   3 passed (3)
Full web suite            2354 passed | 4 skipped (2358)
tsc --noEmit              0 errors
content guards            0 violations
```

## 4. Production-impact status

**None** — test-only, runs in the existing vitest suite. Adds a permanent compliance guard on the signed legal text.

## 5. Remaining (gated)

Official Source Version Pinning (url/hash/effectiveDate) is a related but larger item (a source-verifier script already exists). The big remaining work is gated: data-minimization, migration/consolidation (real-traffic parity), Phase 4 PDF/ledger, Phase 6 ops, owner-gated items.
