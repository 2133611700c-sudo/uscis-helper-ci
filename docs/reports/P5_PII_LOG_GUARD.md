# Phase 5 — PII Redaction in logs (CI grep guard)

**Status:** DONE
**Branch:** `feat/pii-log-guard`
**Scope:** a CI test that fails the build if any source logs a PII-bearing value. No runtime change.

---

## 1. Why

Logs are retained (Vercel, Supabase) and are a classic PII-leak vector. The plan requires a CI grep test so that the moment someone writes `console.log(profile.email)` or logs a raw document value, the build fails. End users are 30–80yo immigrants whose passport numbers / A-numbers / DOB / addresses must never reach a log.

## 2. What landed

`apps/web/src/lib/security/__tests__/noPiiLogging.test.ts`:
- walks every `apps/web/src/**/*.ts(x)` (excluding tests/node_modules);
- flags any `console.(log|info|warn|error|debug)` line that also references a PII-bearing expression: `.raw_value`, `.normalized_value`, `rawValue`, `normalizedValue`, `profile.name/email/addr/phone`, `signerName`, `signerAddress`, `signatureDataUrl`, `certifierAddress`;
- fails with a `file:line` list of offenders;
- includes a **self-test** that plants `console.error('leak', profile.email)` and asserts the guard catches it (so the guard can't silently rot into a no-op).

## 3. Pre-existing state (audited)

The codebase is **already clean** — 0 offenders. Verified the two structured logs I added earlier are PII-free by design:
- `[ONE_BRAIN_SHADOW]` / `summarizeTpsReviewShift` — counts + field **keys** only, never values.
- `[generate-pdf] AUDIT_RECONCILE` (S2) — logs the `attestation`, which `buildAttestationRecord` builds from **presence booleans** (`certifier_name_present`, `certifier_address_present`), a `document_hash`, method/timestamps/version — **never** the actual name/address/field values.

So this guard locks in an already-correct posture rather than papering over a leak.

## 4. Evidence

```
noPiiLogging.test.ts   2 passed (2)   (clean scan + planted-violation self-test)
Full web suite         2333 passed | 4 skipped (2337)
tsc --noEmit           0 errors
content guards         0 violations
```

## 5. Production-impact status

**None** — test-only. It runs in the existing vitest suite (so the CI "typecheck + build" / test job enforces it). Adds a permanent compliance guard.

## 6. Remaining / notes

- Deliberately a conservative same-line grep (matches the plan's "grep test"). A future multi-line leak would need the window widened; a false positive means rename the local var or redact before logging.
- Data Minimization (send crop+label, not whole image) + Retention policy remain separate Phase-5 items.
