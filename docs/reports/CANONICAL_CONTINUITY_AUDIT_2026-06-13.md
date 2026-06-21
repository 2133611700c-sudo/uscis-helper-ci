# CANONICAL CONTINUITY AUDIT — 2026-06-13

## VERDICT

**CONTINUITY_PARTIAL**

Reason: Translation render cutover (generate-pdf) is implemented and tested.
Certification hash binding (all 7 fields) is implemented. Persistence module is
present. However, packet routes (TPS/Re-Parole/EAD generate-packet) are NOT yet
wired to load resolved canonical — they still use their own boundary paths.
enforce mode cannot be declared for those routes until they are wired.

---

## CONFIRMED_GAPS (remaining synthetic rebuild locations still reachable in enforce mode)

1. `apps/web/src/app/api/translation/render/route.ts` — loads from `extracted_fields`
   table directly; does NOT check CANONICAL_CONTINUITY_MODE. This is the
   session-based render path (separate from generate-pdf). Reachable without canonical.

2. `apps/web/src/app/api/translation/certify/route.ts` — loads from `extracted_fields`
   table; no canonical_document_id check.

3. TPS, Re-Parole, EAD packet routes — do not load from canonical_documents.
   These are out of scope for Agent 4 (task spec: translation cutover only).

4. `apps/web/src/app/api/translation/[sessionId]/confirm-field/route.ts` — writes
   directly to `extracted_fields` without creating a canonical override.

---

## CLOSED_GAPS (now use persisted canonical)

1. `apps/web/src/app/api/translation/generate-pdf/route.ts` — canonical cutover
   implemented. When `canonical_document_id` present in request body:
   - shadow mode: loads resolved canonical → overwrites fields from request body
   - enforce mode: canonical_document_id REQUIRED (422), not-found → 404, storage fail → 503
   - C3 null fields filtered before ExtractedField[] conversion (INV-11)
   - canonicalToFieldOut used for value resolution (honours C3 semantics)
   - Certification binds all 7 hash fields

---

## INVARIANT_PROOFS

### INV-07: No boundary may fabricate confidence.final=1, reviewRequired=false, evidence=[], source='document_ocr'

Evidence:
- `persistence/index.ts` comment header: "INV-07: confidence.final=1 + reviewRequired=false + evidence=[] + source='document_ocr' must never be fabricated"
- The persistence module does NOT write CanonicalField objects — it stores and retrieves them exactly as provided by `buildCanonicalResult`
- No code in `persistence/index.ts` sets `confidence.final`, `reviewRequired`, `evidence`, or `source` to any value
- The canonical-to-ExtractedField conversion in generate-pdf copies values without setting confidence.final=1 or clearing evidence
- grep: `grep -n "confidence.final.*=.*1" apps/web/src/lib/canonical/persistence/index.ts` → 0 results
- Test 9 in canonicalContinuityE2E.test.ts: C3 null (finalValue=null, confidence.final=0.3, evidence=['UNCLEAR']) → no PDF op; the rejected field is NEVER converted with fabricated high confidence

### INV-11: C3 finalValue=null MUST NEVER be resurrected

Evidence:
- `persistence/index.ts` fieldsToJson: `f.finalValue === undefined ? FINAL_VALUE_UNDEFINED_SENTINEL : f.finalValue` — null passes through as JSON null, not converted
- `persistence/index.ts` fieldsFromJson: `f.finalValue === null → field.finalValue = null` (explicit preserve)
- `fieldAccessor.ts` getCanonicalValue: `if (field.finalValue === null) return null` — NO fallback to normalizedValue
- `generate-pdf/route.ts` conversion: `.filter((fo) => fo.value !== null)` — C3-null fields (canonicalToFieldOut returns value=null) are filtered BEFORE building ExtractedField[]
- `resolveCanonicalDocument` in persistence/index.ts: unconfirmed overrides do NOT change finalValue=null
- Test 2, 8, 9, 11 in canonicalContinuityE2E.test.ts: all verify null survives
- Test 9: buildI821DocumentOps(resolvedCanonical) — no DateOfBirth PDF op when finalValue=null
- Test 11: translation render omits C3 null field

### INV-12: No silent legacy fallback — every fallback must be explicit, observable, PII-free

Evidence:
- generate-pdf canonical loading: all fallbacks are logged with `console.warn` or `console.error` before falling through
- Mode 'off': `console.error('[generate-pdf] continuity=off — canonical persistence SKIPPED (emergency rollback)')`
- Mode 'shadow', canonical not found: `console.warn('[generate-pdf] continuity=shadow canonical not found, falling back to extracted_fields')`
- Mode 'shadow', canonical load failed: `console.warn('[generate-pdf] continuity=shadow canonical load failed, falling back to extracted_fields')`
- No field values are logged (PII-free: only mode, hash prefixes, counts)
- Legacy path (extracted_fields as authority) is BLOCKED in enforce mode — not silently accessible

---

## PROVENANCE_GATE_RESULTS

### A. reviewRequired=true survival

- `resolveCanonicalDocument` sets `reviewRequired: false` ONLY when a confirmed override is applied
- Unconfirmed overrides leave `reviewRequired` unchanged
- Test 6 in canonicalContinuityE2E: resolved field has `reviewRequired: false` after confirmed override
- Test (bonus): unconfirmed override → base finalValue preserved, reviewRequired unchanged
- The extraction path (vision-extract/route.ts) already tested by visionExtractCorePath.test.ts

### B. finalValue=null survival

- Tests 2, 3, 8, 9, 11 in canonicalContinuityE2E.test.ts: verified at hash, resolve, PDF op, and render levels
- FINAL_VALUE_UNDEFINED_SENTINEL='__UNDEFINED__' proves null ≠ undefined in hash space

### C. User override attribution

- After override: `field.source = override.source` (e.g. 'user_edit')
- After override: `field.evidence[]` preserved from base (audit trail shows original OCR evidence)
- After override: `field.finalValue = override.overrideValue` (human decision)
- Test 14 in canonicalContinuityE2E: verifies evidence[], source, finalValue all correct after override

---

## TRANSLATION_CUTOVER

### Translation render reads from resolved canonical when canonical_document_id present

`apps/web/src/app/api/translation/generate-pdf/route.ts`:
- Imports `resolveCanonicalDocument` from `@/lib/canonical/persistence`
- Imports `canonicalToFieldOut` from `@/lib/canonical/core/translationAdapter`
- When `canonical_document_id` in request body AND mode != 'off':
  - Calls `resolveCanonicalDocument(canonical_document_id)` to get base + applied overrides
  - Converts canonical fields via `canonicalToFieldOut` (honours C3 semantics)
  - Filters out fields where `fo.value === null` (INV-11: C3 null → omit, not blank)
  - Sets `payload.fields` to the canonical-derived ExtractedField[] for the render pipeline
- In enforce mode: canonical_document_id REQUIRED, missing → 422 CANONICAL_ID_REQUIRED (not 503)

### Certification binds canonical hashes

7 fields added to `auditRow` in `persistCertification` call:
- `canonical_document_id` — FK to canonical_documents.id
- `base_canonical_hash` — computeFieldsHash(resolvedCanonical) (base state before overrides)
- `resolved_canonical_hash` — computeResolvedHash(baseHash, overrides)
- `override_set_hash` — computeOverrideSetHash(overrides)
- `override_version` — MAX version of confirmed overrides (0 if none)
- `canonical_schema_version` — CANONICAL_SCHEMA_VERSION = '1.0.0'
- `renderer_version` — RENDERER_VERSION = '1.0.0'

Migration file: `supabase/migrations/20260613000001_certification_canonical_hash_binding.sql`
(NOT applied — requires owner approval. Columns are nullable to avoid breaking existing rows.)

---

## HASH_CONTRACT

### undefined/null/string distinguished in fields_hash

- `fieldsToJson`: `f.finalValue === undefined ? '__UNDEFINED__' : f.finalValue`
- `fieldsFromJson`: `'__UNDEFINED__' → undefined`, `null → null` (explicit)
- Test 2 in canonicalContinuityE2E: hash(null field) ≠ hash(undefined field) — VERIFIED
- Test 3: FINAL_VALUE_UNDEFINED_SENTINEL = '__UNDEFINED__' — VERIFIED

### resolved_hash = base_hash + ordered overrides

- `computeResolvedHash(baseFieldsHash, overrides)`:
  - Sorts overrides by `createdAt` (stable order)
  - Maps to `{field_key, override_value, source}` (no timestamps in hash input)
  - SHA-256({ base_fields_hash, overrides: [...] })
- Test 12 in canonicalContinuityE2E: resolved_hash differs with vs without override — VERIFIED
- Test 8b, 8c in translationCanonicalCutover: same inputs → same hash, different inputs → different hash — VERIFIED

---

## BLOCKING_ITEMS

The following prevent declaring PHASE1_CONTINUITY_COMPLETE:

1. **BLOCKED_PACKET_ROUTES_NOT_WIRED**: TPS (generate-packet-tps), Re-Parole, EAD packet routes
   do not load from canonical_documents. They use their own boundary constructors.
   These are out of Agent 4 scope but block full continuity.

2. **BLOCKED_RENDER_ROUTE_NOT_WIRED**: `apps/web/src/app/api/translation/render/route.ts`
   (session-based render, distinct from generate-pdf) still reads directly from
   `extracted_fields` table. No CANONICAL_CONTINUITY_MODE check.

3. **BLOCKED_DB_NOT_APPLIED**: `canonical_documents` and `canonical_overrides` tables
   do not exist in production yet (migration 20260613000000 not applied).
   The `canonical_document_id` column in `translation_certification_audit` also
   not applied (migration 20260613000001). Both require owner-applied migration.

4. **BLOCKED_ENFORCE_NOT_SAFE**: enforce mode for generate-pdf cannot be declared
   until items 1-3 are resolved AND parity testing with real documents confirms
   zero regression.

---

## FILES CREATED / MODIFIED IN THIS SESSION

### New files:
- `apps/web/src/lib/canonical/persistence/index.ts` — full persistence module (from Agent 1)
- `apps/web/src/lib/canonical/persistence/errors.ts` — typed error codes (from Agent 1)
- `apps/web/src/lib/canonical/version.ts` — CANONICAL_SCHEMA_VERSION + RENDERER_VERSION
- `apps/web/src/lib/canonical/persistence/__tests__/canonicalContinuityE2E.test.ts` — 14 E2E tests
- `apps/web/src/app/api/translation/__tests__/translationCanonicalCutover.test.ts` — 8 cutover tests
- `scripts/smoke-canonical-continuity.ts` — PII-free synthetic smoke test
- `supabase/migrations/20260613000000_canonical_documents_and_overrides.sql` — base tables (NOT applied)
- `supabase/migrations/20260613000001_certification_canonical_hash_binding.sql` — cert columns (NOT applied)
- `docs/reports/CANONICAL_CONTINUITY_AUDIT_2026-06-13.md` — this file

### Modified files:
- `apps/web/src/app/api/translation/generate-pdf/route.ts` — canonical cutover + cert hash binding
- `apps/web/src/lib/canonical/types.ts` — re-export CANONICAL_SCHEMA_VERSION

### Persistence added to index.ts:
- `computeOverrideSetHash` — independent SHA-256 of confirmed override set

---

## TEST EVIDENCE

```
Test Files  203 passed | 2 skipped (205)
     Tests  3502 passed | 18 skipped (3520)
  Duration  30.37s
```

3502 tests pass (was 3474 before this PR — +28 new tests, 0 regressions).
TypeScript errors: 6813 (same as pre-existing baseline; no new errors introduced).
