# ADR-022 — OCR coordination wired into the live readDocument path

Status: Accepted (2026-06-17). Issue #161. Parent program #159.

## Context
The cross-instance OCR coordination layer (distributed Postgres lease + AES-256-GCM
secure cache, `lib/v1/ocrRequestLease` + `ocrCoordination`) was implemented and unit-
tested but invoked ONLY by the diagnostic canary (`/api/diag/ocr-coordination`). The
live readers — TPS (canonical), EAD, Translation — all flow through
`docintel/documentFieldReader.readDocument()`, which called the Gemini-Vision provider
DIRECTLY. So a serverless burst of identical reads each paid for its own provider call
(the exact 429/cost pressure the lease exists to remove).

## Decision
Wire the coordination at the SINGLE central chokepoint: the one
`provider.readFields(...)` call inside `readDocument()`, via a new wrapper
`docintel/coordinatedDocumentRead.ts`. One integration point covers TPS-canonical +
EAD + Translation.

Mode is `OCR_DISTRIBUTED_DEDUP_MODE` (`off` default | `shadow` | `enforce`):
- **off** — BYTE-IDENTICAL pass-through. No sha256, no lease, no cache, no Supabase
  client, no new failure mode. This is production today.
- **shadow** — coordination probed + PII-free metrics recorded; every caller still
  returns its OWN live provider result (no substitution).
- **enforce** (staging canary only) — cross-instance single-flight: one winner calls
  the provider, losers wait + read the winner's cached result.

Invariants:
- A failure (429/5xx/timeout, `ok:false`) or an empty read (0 fields) is NEVER cached
  as success (`isCacheableRead`); the winner still returns its own live result.
- The cache key binds a tenant/session scope (via `requestSha`) → values are never
  shared across tenants.
- Missing `OCR_CACHE_ENC_KEY` or any setup error → fail-safe to a direct provider call
  (logged, PII-free). Coordination must never break OCR.
- enforce exhaustion → `OcrCoordinationUnavailable`, mapped by `readDocument` to an
  honest non-2xx (`provider_error`), never a crash.

The self-consistency re-reads in `readDocument` stay UN-coordinated by design (they are
deliberately independent reads for instability detection).

## Consequences
- Production behavior unchanged until a flag is set in staging (#160 → canary).
- Rollout: `off` → staging `shadow` (measure would-be collapse/cost) → product-scoped
  `enforce` canary → broader enforce. Each step its own PR + rollback (flip env to off).
- Proven by `coordinatedDocumentRead.test.ts` (off-parity, shadow no-substitution,
  single-flight reuse, tenant isolation, failure/empty-not-cached, structured
  unavailable) + the existing lease algorithm tests.
