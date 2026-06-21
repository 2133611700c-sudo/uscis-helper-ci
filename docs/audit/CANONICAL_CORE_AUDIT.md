# CANONICAL_CORE_AUDIT — Audit Agent 1

Base: main=prod `02eb595`. Primary source: real code + Supabase MCP (`canonical_documents`=24 rows, `canonical_overrides`=0 rows).

## Q1: Is there ONE Document Core?

**No — there are TWO cores, plus dead siblings.**

| "Core" | File | Real runtime role | Status |
|---|---|---|---|
| **docintel reader (REAL core)** | `lib/docintel/documentFieldReader.ts` `readDocument()` | The actual live read pipeline: providers→autoOrient→dateRoleGuard→transliterationPolicy→patronymicReconcile→authorityResolve→antiFabricationGate→selfConsistency. Imported by ALL 4 product OCR routes. | PROVEN_PRODUCTION |
| **canonical/core `readDocumentCore`** | `lib/canonical/core/readDocumentCore.ts` | Parallel re-implementation of the read→arbitrate flow. ZERO non-test importers (`grep -rln readDocumentCore` → self + mrzAuthority + 2 tests only). | **DEAD_CODE** |
| central-brain | `lib/central-brain/index.ts` | Only importer is its own health endpoint `app/api/central-brain/health/route.ts`. | **DEAD_CODE** |
| oneBrain decideField | `lib/docintel/oneBrain/decideField.ts` | ZERO importers anywhere. | **DEAD_CODE** |

**Root cause of the duplication:** ADR-017 ("one Gemini brain") and the "One Brain B1: Core" rewrite (TPS route:259) built a *new* canonical core in `lib/canonical/core/`, but the live route was wired to the *pre-existing* `lib/docintel/` reader instead. The `canonical/core` layer survives only as (a) per-product **adapters** (`tpsAdapter`/`reParoleAdapter`/`eadAdapter`/`translationAdapter` — these ARE used) and (b) `buildCanonicalResult` for shadow persistence. The arbitration engine `lib/canonical/core/arbitration.ts` and `readDocumentCore` are not on the live path.

## Q2: Which routes call the canonical layer? Duplicate OCR rereads?

| Route | Reader | Adapter used | Canonical persist | Duplicate reread? |
|---|---|---|---|---|
| `tps/ocr/extract` | `readDocument` | `canonicalToTpsModuleResult` | shadow (route:293-322) | No (single read; old per-doc modules only as fallback) |
| `translation/vision-extract` | `readDocument` | `translationAdapter` | shadow (×2: :301, :449 legacy) | **Yes — TWO `buildCanonicalResult` paths** (canonical :301 + legacy :449), both persist |
| `reparole/ocr/extract` | `readDocument` | `reParoleAdapter` | shadow | No |
| `ead/ocr/extract` | `readDocument` | `eadAdapter` + `translationAdapter` | shadow | No |

No product-specific *OCR* reread (single `readDocument` per request). But translation runs the canonical-build twice (canonical + legacy parity), persisting redundant shadow records.

## Q3: Where canonical persists / where the canonical ID is lost / where fields are reassembled

- **Persists:** `persistCanonicalDocument` → `canonical_documents` (INSERT-only, RLS, immutability triggers per migration `20260613...immutability_triggers`). 24 rows live across all 4 products. Idempotency key product-scoped `(session_id, product, doc_type, fields_hash)` (persistence/index.ts:349) — fixed a real bug where translation overwrote tps.
- **Carriage:** `canonical_document_id` returned by extract route, carried into generate-packet body (TPS route:1302; reparole/ead/translation similarly). Wire-proven in code.
- **ID lost when:** mode=off, or shadow-persist fails (TPS route:311-318 swallows the error and returns `tpsCanonicalDocumentId=null` — flow continues with NO canonical link). So in shadow, a persist failure silently severs the canonical chain (acceptable for shadow, fatal if ever enforced).
- **Fields reassembled:** in the PDF mappers via `fieldAccessor` (C3 release) — `lib/packet/pdf.ts`, `lib/canonical/forms/i821DocumentMapper.ts`, `i765DocumentMapper.ts`, `lib/ead/i765FieldMap.ts`, `lib/translation/pdf/buildMirrorValues.ts`. These DO consume the C3 `finalValue` semantics.

## Q4: C3 semantics (null / undefined / string) — verdict per item

`lib/canonical/core/fieldAccessor.ts` is the shared C3 release gate:
- `finalValue === null` → return null (C3 deliberately rejected). (fieldAccessor.ts:30,39)
- `finalValue === string` → release.
- The comment block (:10-17) explicitly warns against releasing the normalized value when C3 rejected.

| Item | Verdict | Evidence |
|---|---|---|
| finalValue=null resurrection | **SAFE in adapters** — every adapter returns null on `finalValue===null` (tpsAdapter:46, reParoleAdapter:86, eadAdapter:126, translationAdapter:85). No raw/normalized fallback resurrects a rejected value. | grep of all 4 adapters |
| undefined handling | SAFE — persistence serializes `undefined`→`'__UNDEFINED__'` sentinel, restores on load (INV-11, persistence/index.ts:9-10). | code |
| raw/normalized fallback remains | **RESIDUAL RISK** — `fieldAccessor.ts:17` comment flags that a naive accessor "releases the normalized value when C3 rejected"; the safe accessor avoids it, but any consumer reading `.normalizedValue`/`.rawValue` directly (not via fieldAccessor) bypasses C3. Needs per-consumer audit. | comment + 9 importers |
| user override authoritative | **CODE_ONLY / NOT_WIRED** — `/api/canonical/[id]/override` implements it (confirmed=true releases, override_value=null is legal C3 reject, INV-11 override never resurrected — route:8-9), but the route has **zero UI callers** and `canonical_overrides`=0 rows. Never exercised in prod. | grep `api/canonical` in app/components = none; DB 0 rows |
| provenance kept | PROVEN_LOCAL — fields_hash v2 covers provenance (persistence/index.ts:117-129); `canonical_documents` stores it. | code + 24 rows |
| hash verified | PROVEN_LOCAL — `409 CANONICAL_HASH_MISMATCH` on base-hash mismatch (override route:16); `resolved_hash = SHA-256(base + overrides)`. Verified in tests, never in prod (0 overrides). | code |
| optimistic concurrency | **CODE_ONLY** — `409 OVERRIDE_VERSION_CONFLICT` via `next_canonical_override_version()` RPC + advisory lock (migration `canonical_atomic_rpc_bigint_advisory_lock_fix`). Correct by construction, but 0 rows → never raced in prod. | code + migration |
| enforce really impossible (via legacy global) | **SAFE** — `continuityMode.ts:48-52`: legacy global `CANONICAL_CONTINUITY_MODE` clamps anything ≠'off' to 'shadow'; enforce reachable ONLY via product-scoped env. | code |

## Overall canonical verdict

- The canonical-continuity *machinery* (persistence, hashing, immutability triggers, override RPC, C3 release) is well-built and PROVEN_LOCAL. It runs in **shadow** in prod (24 read records persisted; **zero overrides, zero enforce**).
- It is **not the live document brain.** The live brain is `lib/docintel/`. `lib/canonical/core/readDocumentCore.ts` + `lib/central-brain/` + `oneBrain/decideField.ts` are DEAD_CODE.
- The override/correction loop — the one place where canonical would become *authoritative* — is an **orphan route with no UI and no prod traffic.** The actual user-correction path in prod is the legacy translation `correct-field`/`confirm-field` session routes writing `user_corrections` (10 rows), which is OUTSIDE the canonical override mechanism.

**P0: 0. P1: 1** (override mechanism is the claimed source-of-truth but is NOT_WIRED → any "canonical is authoritative" claim is false in prod; risk is a wrong-document if enforce is flipped on while the override loop is unreachable).
