# DESIGN_LOCK — canonical-continuity-completion
**Branch:** `architecture/canonical-continuity`
**Base SHA:** `1919b54`
**Locked:** 2026-06-13
**Status:** FROZEN — no deviations without owner sign-off

---

## Problem statement (audited, not claimed)

Per `docs/audit/2026-06-13-DOCUMENT_CORE_AND_PROJECT_STATE_AUDIT.md` Part 4:

> Runtime flow today:
> upload → Core → real CanonicalDocumentResult → adapter → PRODUCT DTO
> (canonical DISCARDED) → wizard → *DocumentBoundary → NEW synthetic
> CanonicalDocumentResult (provenance FABRICATED: confidence.final=1,
> source='document_ocr', reviewRequired=false, evidence=[]) → form mapper → PDF

Phase 1 shape migration is complete (AC: `fieldAccessor`, `adapterContract`, `keyAliases`, all 4 consumers reading `CanonicalField[]`). Phase 1 continuous currency is NOT achieved — the canonical provenance is broken at the extract route and never recovered.

---

## Locked contracts

### 1. `canonical_document_id` semantics

- A UUID generated at the moment `buildCanonicalResult` completes inside the OCR extract route
- Written to `canonical_documents` table immediately (same request, before response)
- Returned to the caller in the OCR extract response body alongside the existing DTO
- Passed through the wizard session and included in the packet generation request body
- At packet time: loaded from `canonical_documents` by ID → feeds form mappers directly
- **C3 invariant**: loading a persisted canonical must produce the SAME value resolution as the original in-memory one. If not found by ID → BLOCK (no synthetic rebuild, log the gap, return 503)

### 2. Deterministic hash rules

Two hashes computed deterministically, stored in `canonical_documents.result_hash` and `canonical_documents.fields_hash`:

- `result_hash`: SHA-256 of `JSON.stringify({ docType, product, fields: sortedFieldKeys })` — identifies the shape
- `fields_hash`: SHA-256 of `JSON.stringify(fields sorted by key, each: { key, finalValue, reviewRequired, confidence.final })` — identifies the values

**Rules:**
- Both hashes computed server-side, never client-side
- Input to hash: deterministic sort (key alphabetical), no timestamps, no UUIDs in the hash input
- Hash must be recomputed and verified at load time — mismatch → BLOCK + alert
- Hash is NOT a signature — it is a tamper-detection fingerprint for the session

### 3. Persistence API (8 operations, all in `lib/canonical/persistence/`)

```
persistCanonicalDocument(result: CanonicalDocumentResult, sessionId: string): Promise<{ id: string, resultHash: string, fieldsHash: string }>

loadCanonicalDocumentById(id: string): Promise<CanonicalDocumentResult | null>

loadCanonicalDocumentBySession(sessionId: string, docType: string): Promise<CanonicalDocumentResult | null>

appendCanonicalOverride(canonicalId: string, overrides: CanonicalOverride[]): Promise<void>

listCanonicalOverrides(canonicalId: string): Promise<CanonicalOverride[]>

resolveCanonicalDocument(canonicalId: string): Promise<CanonicalDocumentResult>
  // loads base + applies all overrides in order → returns resolved CanonicalDocumentResult

verifyCanonicalHash(canonicalId: string): Promise<{ valid: boolean, mismatch?: string }>

getCanonicalDocumentId(sessionId: string, docType: string): Promise<string | null>
```

### 4. Base immutability

- `canonical_documents` rows are INSERT-only after initial write
- Updates to individual fields go to `canonical_overrides` (append-only)
- No UPDATE, no DELETE on `canonical_documents` — enforced by RLS policy
- A new upload creates a NEW `canonical_documents` row; it does not overwrite the prior one

### 5. Append-only override model

```sql
canonical_overrides (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_id  uuid NOT NULL REFERENCES canonical_documents(id),
  field_key     text NOT NULL,
  override_value text,           -- null = explicit reject (C3 finalValue=null)
  source        text NOT NULL,   -- 'user_edit' | 'certifier_override' | 'system_correction'
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
)
```

- Never overwrites: each user edit appends a new row
- Resolve order: base field, then overrides sorted by `created_at ASC` (last wins)
- A `null` override_value means "user explicitly rejected this field" — C3 null, no fallback
- RLS: SELECT + INSERT allowed; UPDATE + DELETE forbidden

### 6. Resolved canonical field semantics

When `resolveCanonicalDocument(id)` applies overrides:
- Find all overrides for each `field_key`, sort by `created_at`
- Last override wins: set `field.finalValue = override.override_value` (may be null)
- Set `field.source = override.source`, `field.reviewRequired = false` (user confirmed)
- Original `rawValue`, `rawCyrillic`, `evidence[]` are PRESERVED from base — never overwritten
- The resolved result is NOT persisted — it is computed on read

### 7. `CANONICAL_CONTINUITY_MODE` flag

Env var with three states:

| Value | Behavior |
|-------|----------|
| `off` | Legacy path: extract discards canonical, boundaries rebuild synthetic. No change from today. |
| `shadow` | Extract persists canonical AND returns id; packet route loads canonical if id present, falls back to synthetic if load fails. Telemetry logs both paths. |
| `enforce` | Extract MUST persist; packet route MUST load; if canonical not found → 503. No synthetic rebuild allowed. |

Default for this branch: `shadow` (safe rollout — existing sessions without id still work).

**Invariant:** in `shadow` or `enforce` mode, a packet assembled from loaded canonical MUST produce PDF byte-for-byte identical to the synthetic path for the same input (verified by golden PDF parity test).

---

## Security invariants (verbatim from task spec, binding)

- INV-07: No boundary may fabricate `confidence.final=1, reviewRequired=false, evidence=[], source=document_ocr` unless these actually came from the authoritative canonical result
- INV-11: C3 `finalValue=null` MUST NEVER be resurrected by DTO conversion, database persistence, UI defaults, boundary reconstruction, PDF mapping, or fallback
- INV-12: No silent legacy fallback — every fallback must be explicit, observable, PII-free

---

## Supabase tables to be created (migration only, no changes to existing tables)

### `canonical_documents`
```sql
CREATE TABLE canonical_documents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        text NOT NULL,
  document_session_id text,
  product           text NOT NULL,   -- 'tps' | 'reparole' | 'ead' | 'translation'
  doc_type          text NOT NULL,
  fields_json       jsonb NOT NULL,  -- full CanonicalField[] as stored
  result_hash       text NOT NULL,
  fields_hash       text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON canonical_documents(session_id, doc_type);
CREATE INDEX ON canonical_documents(document_session_id) WHERE document_session_id IS NOT NULL;
```

### `canonical_overrides`
```sql
CREATE TABLE canonical_overrides (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_id  uuid NOT NULL REFERENCES canonical_documents(id),
  field_key     text NOT NULL,
  override_value text,
  source        text NOT NULL CHECK (source IN ('user_edit','certifier_override','system_correction')),
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON canonical_overrides(canonical_id, field_key);
```

RLS: service-role INSERT + SELECT; anon SELECT own session rows only (via session_id match); no UPDATE/DELETE for anyone.

---

## Strictly forbidden scope (binding)

- Cart, Order redesign, Pricing redesign
- Unified Wizard redesign
- New AI provider, OpenAI migration
- New document types or OCR fields unrelated to continuity
- Visual redesign, Marketing changes
- Large dead-code cleanup unrelated to continuity
- Database rewrite
- Changing legal form answers or eligibility logic
- Refactoring unrelated modules
- Deleting rollback paths before parity proof
- Declaring Phase 1 complete based only on mapper signatures
- Setting `CANONICAL_CONTINUITY_MODE=enforce` in production before shadow parity is proven

---

## Agent assignments (4 parallel worktrees)

| Agent | Branch | Scope |
|-------|--------|-------|
| Agent 1 | `agent1/canonical-persistence` | Supabase migration + `lib/canonical/persistence/` module (8 ops + hashing) |
| Agent 2 | `agent2/session-overrides` | OCR extract routes persist canonical + wizard edits → overrides |
| Agent 3 | `agent3/form-packet-continuity` | Packet routes load canonical; collapse *DocumentBoundary to pass-throughs |
| Agent 4 | `agent4/translation-e2e` | Translation render from canonical; E2E audit; smoke scripts |

Integration order: Agent 1 → Agent 2 → Agent 3 → Agent 4 (each gate: typecheck + tests pass).

---

## P0 preflight results (coordinator verified)

| Item | Result |
|------|--------|
| PR #116 | MERGED → main `1919b54` |
| Production SHA | `4d3e470` (pre-merge, Vercel auto-deploy triggered for `1919b54`) |
| `canonical_documents` table | ABSENT — must be created by Agent 1 |
| `canonical_overrides` table | ABSENT — must be created by Agent 1 |
| `OCR_FIELD_SAFETY_ENABLED` | UNVERIFIED (Vercel env API 403 with preview project context) |
| Integration branch | `architecture/canonical-continuity` from `1919b54` |
| Supabase project | `rtfxrlountkoegsseukx` |
| Live tables count | 38 |
