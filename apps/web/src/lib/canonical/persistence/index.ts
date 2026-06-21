/**
 * canonical/persistence/index.ts
 *
 * Supabase persistence layer for CanonicalDocumentResult.
 *
 * Security invariants:
 *   INV-07: confidence.final=1 + reviewRequired=false + evidence=[] + source='document_ocr'
 *           must never be fabricated — only authoritative canonical results may carry these.
 *   INV-11: finalValue=null MUST survive JSON round-trip. null is explicit C3 reject.
 *           undefined is serialized as '__UNDEFINED__' sentinel and restored on load.
 *   INV-12: No silent legacy fallback. Every fallback must be explicit and observable.
 *
 * PII rule: never log field *values*, only field keys and counts.
 *
 * Hash contract:
 *   result_hash  = SHA-256({ docType, product, fieldKeys[] sorted })
 *   fields_hash  = SHA-256({ key, finalValue (undefined→'__UNDEFINED__'), reviewRequired,
 *                            confidenceFinal, reviewReasons sorted }[] sorted by key)
 *   resolved_hash = SHA-256({ base_fields_hash, overrides[] sorted by version ASC })
 *
 * Override concurrency contract:
 *   Every POST to /api/canonical/[id]/override must include expected_override_version.
 *   If current MAX(version) != expected → 409 OVERRIDE_VERSION_CONFLICT.
 *   appendCanonicalOverride enforces this via the version parameter + DB transaction.
 */

import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import type { CanonicalDocumentResult, CanonicalField, FieldEvidence } from '../types'
import { CANONICAL_SCHEMA_VERSION, FIELDS_HASH_SCHEMA_VERSION } from '../version'
import { CanonicalConcurrencyError } from './errors'

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

/** Sentinel stored in JSONB for finalValue=undefined (C3 not-run). */
export const FINAL_VALUE_UNDEFINED_SENTINEL = '__UNDEFINED__'

export interface CanonicalOverride {
  /** DB primary key (present on load, absent before insert). */
  id?: string
  /** FK to canonical_documents.id (present on load, absent before insert). */
  canonicalId?: string
  fieldKey: string
  /** null = explicit C3 reject (INV-11). string = user-supplied value. */
  overrideValue: string | null
  source: 'user_edit' | 'certifier_override' | 'system_correction'
  reason?: string
  /** Monotonic version per canonical_id (present on load). */
  version?: number
  /** Which override this supersedes (audit chain). */
  supersedesId?: string | null
  /** User explicitly confirmed this correction — only then is it effective. */
  confirmed?: boolean
  /** PII-free actor identifier (e.g. 'user', 'certifier'). */
  actor?: string
  /** Preserved from base canonical field.reviewReasons for audit chain. */
  originalRejectionReasons?: string[]
  createdAt?: string
}

// ---------------------------------------------------------------------------
// Supabase client (service role — server-side only, NEVER expose to browser)
// ---------------------------------------------------------------------------

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      '[canonical/persistence] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set'
    )
  }
  // auth.persistSession=false is mandatory: this is a server-side service role client
  return createClient(url, key, { auth: { persistSession: false } })
}

// ---------------------------------------------------------------------------
// Internal hash helper
// ---------------------------------------------------------------------------

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

// ---------------------------------------------------------------------------
// Hash: result_hash
// ---------------------------------------------------------------------------

/**
 * result_hash: covers document shape — docType, product, sorted field keys.
 * Does NOT cover field values (that is fields_hash). Used to detect schema drift.
 */
export function computeResultHash(result: CanonicalDocumentResult): string {
  const payload = {
    docType: result.docType,
    product: result.product,
    fields: result.fields.map((f) => f.key).sort(),
  }
  return sha256(JSON.stringify(payload))
}

// ---------------------------------------------------------------------------
// Hash: fields_hash
// ---------------------------------------------------------------------------

/**
 * Deterministically serialize one evidence candidate. Stable key order, no unstable fields.
 */
function serializeEvidence(e: FieldEvidence): string {
  // Fixed key order; sha256 over a canonical tuple. value/source/confidence/provider all bound.
  return JSON.stringify([e.value, e.source, e.confidence, e.provider])
}

/**
 * fields_hash (v2 — versioned, provenance-covering): the authoritative base-integrity hash.
 *
 * SECURITY: this hash MUST change if ANY security-relevant content is tampered. v1 covered
 * only finalValue + confidence + review state and therefore did NOT protect provenance
 * (source, rawValue, normalizedValue, evidence, knowledge*). v2 binds the full field shape
 * plus document-level identity (docType, product, schemaVersion).
 *
 * Determinism guarantees:
 *   - fields sorted by key (localeCompare); evidence sorted by its canonical serialization
 *   - explicit object-key ordering (we build arrays/tuples, not relying on JS key order)
 *   - finalValue: undefined→sentinel, null→null, string→string (three distinct hashes — INV-11)
 *   - NO timestamps, DB ids, or unstable array order enter the input
 *   - the hash schema version is embedded so a v1 hash can never be re-read as v2
 *
 * Returns the hex digest. Pair with FIELDS_HASH_SCHEMA_VERSION when persisting.
 */
export function computeFieldsHash(result: CanonicalDocumentResult): string {
  const fields = result.fields
    .slice()
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((f) => ({
      key: f.key,
      rawValue: f.rawValue ?? null,
      normalizedValue: f.normalizedValue ?? null,
      // Sentinel: undefined ≠ null in hash input (they must produce different hashes)
      finalValue:
        f.finalValue === undefined ? FINAL_VALUE_UNDEFINED_SENTINEL : f.finalValue,
      source: f.source,
      criticality: f.criticality,
      confidenceFinal: f.confidence.final,
      reviewRequired: f.reviewRequired,
      reviewReasons: f.reviewReasons.slice().sort(),
      // evidence: deterministically serialized + sorted so order is stable & tamper-evident
      evidence: f.evidence
        .map(serializeEvidence)
        .slice()
        .sort(),
      knowledgeRule: f.knowledgeRule ?? null,
      knowledgeProvenance: f.knowledgeProvenance ?? null,
    }))

  // Versioned envelope: doc-level identity + schema versions bound into the hash input.
  const payload = {
    hashSchemaVersion: FIELDS_HASH_SCHEMA_VERSION,
    canonicalSchemaVersion: CANONICAL_SCHEMA_VERSION,
    docType: result.docType,
    product: result.product,
    fields,
  }
  return sha256(JSON.stringify(payload))
}

// ---------------------------------------------------------------------------
// Hash: resolved_hash
// ---------------------------------------------------------------------------

/**
 * resolved_hash: binds base canonical state + confirmed override set.
 * Used for certification reproducibility (CERTIFICATION_REPRODUCIBILITY_CONTRACT).
 *
 * resolved_hash = SHA-256({
 *   base_fields_hash: <fields_hash of canonical_documents row>,
 *   overrides: confirmed overrides sorted by created_at, mapped to
 *              { field_key, override_value, source }
 * })
 */
export function computeResolvedHash(
  baseFieldsHash: string,
  overrides: CanonicalOverride[]
): string {
  const sortedOverrides = overrides
    .slice()
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
    .map((o) => ({
      field_key: o.fieldKey,
      override_value: o.overrideValue,
      source: o.source,
    }))
  return sha256(
    JSON.stringify({
      base_fields_hash: baseFieldsHash,
      overrides: sortedOverrides,
    })
  )
}

// ---------------------------------------------------------------------------
// Hash: override_set_hash
// ---------------------------------------------------------------------------

/**
 * override_set_hash: covers the confirmed override set INDEPENDENTLY of the base.
 * Used in the certification binding so the base and overrides can be audited separately.
 *
 * override_set_hash = SHA-256(confirmed overrides sorted by created_at, mapped to
 *                             { field_key, override_value, source })
 *
 * When there are no confirmed overrides, returns SHA-256('[]').
 */
export function computeOverrideSetHash(overrides: CanonicalOverride[]): string {
  const confirmedSorted = overrides
    .filter((o) => o.confirmed)
    .slice()
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
    .map((o) => ({
      field_key: o.fieldKey,
      override_value: o.overrideValue,
      source: o.source,
    }))
  return sha256(JSON.stringify(confirmedSorted))
}

// ---------------------------------------------------------------------------
// Effective value helper (C3 null + confirmed override contract)
// ---------------------------------------------------------------------------

/**
 * getEffectiveValue: returns the value that should be used for downstream processing.
 *
 * Contract:
 *   - No override (or unconfirmed override): return field.finalValue as-is
 *     (null = C3 hard reject, string = accepted, undefined = C3 not run)
 *   - Confirmed override with non-null overrideValue: return override.overrideValue
 *     (explicit human decision — this is NOT a C3 resurrection; the base is unchanged)
 *   - Confirmed override with null overrideValue: return null (human explicitly rejected)
 *   - Unconfirmed override: return field.finalValue (staged only, not yet effective)
 *
 * INV-11: A field with finalValue=null is NEVER released without a confirmed override.
 */
export function getEffectiveValue(
  field: CanonicalField,
  override?: CanonicalOverride
): string | null | undefined {
  if (override && override.confirmed && override.overrideValue !== null) {
    // Explicit human confirmation with a non-null value
    return override.overrideValue
  }
  // No override, or unconfirmed, or confirmed-null (explicit reject):
  // return base finalValue (null preserved, undefined preserved)
  return field.finalValue
}

// ---------------------------------------------------------------------------
// Serialisation helpers (INV-11 critical)
// ---------------------------------------------------------------------------

/**
 * Prepare fields for JSONB storage.
 * - finalValue: undefined → '__UNDEFINED__' sentinel (JSON.stringify drops undefined)
 * - finalValue: null → null (INV-11: preserved as explicit null in JSONB)
 * - finalValue: string → string (pass through)
 */
function fieldsToJson(fields: CanonicalField[]): unknown {
  return fields.map((f) => ({
    ...f,
    finalValue:
      f.finalValue === undefined ? FINAL_VALUE_UNDEFINED_SENTINEL : f.finalValue,
  }))
}

/**
 * Restore fields from JSONB. Reverses the sentinel encoding.
 * - '__UNDEFINED__' → undefined (C3 did not run)
 * - null → null (INV-11: C3 hard reject, must remain null)
 * - string → string (accepted value)
 */
function fieldsFromJson(raw: unknown): CanonicalField[] {
  if (!Array.isArray(raw)) return []
  return (raw as Record<string, unknown>[]).map((f) => {
    const field = { ...f } as unknown as CanonicalField
    if ((f.finalValue as unknown) === FINAL_VALUE_UNDEFINED_SENTINEL) {
      // C3 did not run — restore undefined (not null!)
      field.finalValue = undefined
    } else if (f.finalValue === null) {
      // INV-11: explicit null = C3 rejected; must remain null, never become undefined
      field.finalValue = null
    }
    // string finalValues pass through correctly via spread
    return field
  })
}

// ---------------------------------------------------------------------------
// Internal: DB row → CanonicalDocumentResult
// ---------------------------------------------------------------------------

function rowToResult(row: Record<string, unknown>): CanonicalDocumentResult {
  const fields = fieldsFromJson(row.fields_json)
  return {
    documentSessionId: (row.document_session_id as string) ?? '',
    product: row.product as CanonicalDocumentResult['product'],
    docType: row.doc_type as string,
    fields,
    hashes: {
      uploadHash: null,
      normalizedImageHash: null,
      canonicalResultHash: (row.result_hash as string) ?? null,
    },
    createdAt: (row.created_at as string) ?? '',
    requiresReview: fields.some((f) => f.reviewRequired),
  }
}

// ---------------------------------------------------------------------------
// Internal: DB override row → CanonicalOverride
// ---------------------------------------------------------------------------

function rowToOverride(row: Record<string, unknown>): CanonicalOverride {
  return {
    id: row.id as string,
    canonicalId: row.canonical_id as string,
    fieldKey: row.field_key as string,
    overrideValue: row.override_value as string | null,
    source: row.source as CanonicalOverride['source'],
    reason: (row.reason as string | undefined) ?? undefined,
    version: row.version as number,
    supersedesId: (row.supersedes_id as string | null) ?? null,
    confirmed: (row.confirmed as boolean | undefined) ?? false,
    actor: (row.actor as string | undefined) ?? undefined,
    originalRejectionReasons:
      (row.original_rejection_reasons as string[] | undefined) ?? undefined,
    createdAt: row.created_at as string,
  }
}

// ---------------------------------------------------------------------------
// 1. persistCanonicalDocument
// ---------------------------------------------------------------------------

/**
 * Idempotently persist a CanonicalDocumentResult into canonical_documents.
 *
 * Idempotency key is PRODUCT-SCOPED: (session_id, product, doc_type, fields_hash).
 * session_id is reused across products (tps/translation/reparole/ead/bureau_pdf); without
 * product in the key, one product's persist would collide with another's that shares
 * session+doc_type+fields_hash (proven live: a 'translation' persist overwrote a 'tps' row).
 *
 * The base row is IMMUTABLE (DB triggers reject UPDATE/DELETE). We therefore use
 * INSERT ... ON CONFLICT DO NOTHING and re-SELECT the existing row on conflict — never an
 * UPDATE (which the immutability trigger would reject). Identical retries → same row id.
 * Different content → different fields_hash → new row.
 *
 * Returns the row id and both hashes. Safe to call multiple times with the same input.
 */
export async function persistCanonicalDocument(
  result: CanonicalDocumentResult,
  sessionId: string
): Promise<{ id: string; resultHash: string; fieldsHash: string }> {
  const supabase = getSupabaseClient()
  const resultHash = computeResultHash(result)
  const fieldsHash = computeFieldsHash(result)

  console.info(
    `[canonical/persistence] persisting docType=${result.docType} product=${result.product} ` +
      `fields=${result.fields.length} session=${sessionId}`
  )

  // INSERT ... ON CONFLICT DO NOTHING. On conflict, data is empty (no row returned) because
  // the immutable base must NOT be UPDATEd. We then re-select the existing row by the
  // product-scoped idempotency key.
  const { data, error } = await supabase
    .from('canonical_documents')
    .upsert(
      {
        session_id: sessionId,
        document_session_id: result.documentSessionId || null,
        product: result.product,
        doc_type: result.docType,
        fields_json: fieldsToJson(result.fields),
        result_hash: resultHash,
        fields_hash: fieldsHash,
        fields_hash_schema_version: FIELDS_HASH_SCHEMA_VERSION,
      },
      {
        onConflict: 'session_id,product,doc_type,fields_hash',
        ignoreDuplicates: true, // DO NOTHING — base is immutable, never UPDATE
      }
    )
    .select('id, fields_hash, result_hash')
    .maybeSingle()

  if (error) {
    throw new Error(`[canonical/persistence] insert failed: ${error.message}`)
  }

  if (data) {
    const row = data as { id: string; fields_hash: string; result_hash: string }
    console.info(
      `[canonical/persistence] persisted id=${row.id} resultHash=${row.result_hash.slice(0, 8)}…`
    )
    return { id: row.id, resultHash: row.result_hash, fieldsHash: row.fields_hash }
  }

  // Conflict path (row already existed): re-select by the product-scoped idempotency key.
  const { data: existing, error: selErr } = await supabase
    .from('canonical_documents')
    .select('id, fields_hash, result_hash')
    .eq('session_id', sessionId)
    .eq('product', result.product)
    .eq('doc_type', result.docType)
    .eq('fields_hash', fieldsHash)
    .maybeSingle()

  if (selErr || !existing) {
    throw new Error(
      `[canonical/persistence] idempotent re-select failed: ${selErr?.message ?? 'no row found after conflict'}`
    )
  }

  const row = existing as { id: string; fields_hash: string; result_hash: string }
  console.info(`[canonical/persistence] idempotent hit id=${row.id}`)
  return { id: row.id, resultHash: row.result_hash, fieldsHash: row.fields_hash }
}

// ---------------------------------------------------------------------------
// 2. loadCanonicalDocumentById
// ---------------------------------------------------------------------------

export async function loadCanonicalDocumentById(
  id: string
): Promise<CanonicalDocumentResult | null> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('canonical_documents')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(
      `[canonical/persistence] loadById failed: ${error.message}`
    )
  }
  if (!data) return null

  return rowToResult(data as Record<string, unknown>)
}

// ---------------------------------------------------------------------------
// 3. loadCanonicalDocumentBySession
// ---------------------------------------------------------------------------

/**
 * Load the most recent canonical document for a given session + docType.
 * Returns null when none exists yet.
 */
export async function loadCanonicalDocumentBySession(
  sessionId: string,
  docType: string
): Promise<CanonicalDocumentResult | null> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('canonical_documents')
    .select('*')
    .eq('session_id', sessionId)
    .eq('doc_type', docType)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(
      `[canonical/persistence] loadBySession failed: ${error.message}`
    )
  }
  if (!data) return null

  return rowToResult(data as Record<string, unknown>)
}

// ---------------------------------------------------------------------------
// 4. appendCanonicalOverride
// ---------------------------------------------------------------------------

/**
 * Atomically append override(s) via the append_canonical_overrides_atomic DB RPC.
 *
 * Concurrency contract: provide expectedVersion (the MAX version the client last saw,
 * or 0 if no overrides exist yet). The RPC holds a pg_advisory_xact_lock on the
 * canonical_id, reads current MAX(version), checks it equals expectedVersion
 * (raises OVERRIDE_VERSION_CONFLICT / P0002 if not), then inserts with monotonic versions.
 *
 * Returns the new MAX(version) after all inserts.
 *
 * When expectedVersion is undefined, defaults to 0 (safe only when no overrides exist yet —
 * the RPC will still conflict if any overrides were already inserted).
 *
 * Throws CanonicalConcurrencyError (code='OVERRIDE_VERSION_CONFLICT') on conflict so the
 * caller can catch it and return 409.
 */
export async function appendCanonicalOverride(
  canonicalId: string,
  overrides: CanonicalOverride[],
  options?: { expectedVersion?: number }
): Promise<number> {
  if (overrides.length === 0) return options?.expectedVersion ?? 0

  const supabase = getSupabaseClient()
  const expectedVersion = options?.expectedVersion ?? 0

  // Serialize overrides to the jsonb shape the RPC expects
  const overridesPayload = overrides.map((o) => ({
    field_key: o.fieldKey,
    override_value: o.overrideValue, // null = INV-11 explicit C3 reject
    source: o.source,
    reason: o.reason ?? null,
    supersedes_id: o.supersedesId ?? null,
    confirmed: o.confirmed ?? false,
    actor: o.actor ?? null,
    original_rejection_reasons: o.originalRejectionReasons ?? [],
  }))

  console.info(
    `[canonical/persistence] appending ${overrides.length} override(s) via RPC for id=${canonicalId} ` +
      `expectedVersion=${expectedVersion} keys=${overrides.map((o) => o.fieldKey).join(',')}`
  )

  const { data, error } = await supabase.rpc('append_canonical_overrides_atomic', {
    p_canonical_id: canonicalId,
    p_expected_version: expectedVersion,
    p_overrides: overridesPayload,
  })

  if (error) {
    if (error.message?.includes('OVERRIDE_VERSION_CONFLICT')) {
      throw new CanonicalConcurrencyError('OVERRIDE_VERSION_CONFLICT', {
        canonicalId,
        expectedVersion,
      })
    }
    throw new Error(
      `[canonical/persistence] appendOverride RPC failed: ${error.message}`
    )
  }

  return data as number
}

// ---------------------------------------------------------------------------
// 5. listCanonicalOverrides
// ---------------------------------------------------------------------------

export async function listCanonicalOverrides(
  canonicalId: string
): Promise<CanonicalOverride[]> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('canonical_overrides')
    .select('*')
    .eq('canonical_id', canonicalId)
    .order('version', { ascending: true })

  if (error) {
    throw new Error(
      `[canonical/persistence] listOverrides failed: ${error.message}`
    )
  }

  return (data ?? []).map((row) => rowToOverride(row as Record<string, unknown>))
}

// ---------------------------------------------------------------------------
// 6. resolveCanonicalDocument
// ---------------------------------------------------------------------------

/**
 * Load the base canonical document then apply all overrides in version ASC order
 * (last override per field_key wins — version is the authoritative order, not created_at).
 * Implements the C3 null + confirmed override contract:
 *
 *   WITHOUT confirmed override:
 *     field.finalValue = base finalValue (null preserved — INV-11)
 *
 *   WITH confirmed override (confirmed=true, overrideValue non-null):
 *     field.finalValue = override.overrideValue (explicit human decision)
 *     field.source = override.source
 *     field.reviewRequired = false (user confirmed)
 *     base rawValue, rawCyrillic, evidence[] PRESERVED (audit trail)
 *
 *   NEVER rewrites the base row.
 */
export async function resolveCanonicalDocument(
  canonicalId: string
): Promise<CanonicalDocumentResult | null> {
  // NOT-FOUND vs INFRA contract: a missing base canonical is NOT an infra failure.
  // loadCanonicalDocumentById returns null on not-found and THROWS only on a real
  // Supabase/network error. We mirror that here: return null when the base does not
  // exist so callers map it to 404 (CANONICAL_NOT_FOUND), and let genuine DB errors
  // propagate as a throw → 503 (CANONICAL_STORAGE_UNAVAILABLE). Never collapse
  // not-found into 503. (Was: threw on not-found → caught by route → wrong 503.)
  const base = await loadCanonicalDocumentById(canonicalId)
  if (!base) {
    return null
  }

  const overrides = await listCanonicalOverrides(canonicalId)
  if (overrides.length === 0) return base

  // Build a map: fieldKey → last override (list is already sorted by version ASC)
  const overrideMap = new Map<string, CanonicalOverride>()
  for (const o of overrides) {
    overrideMap.set(o.fieldKey, o)
  }

  const resolvedFields = base.fields.map((field) => {
    const override = overrideMap.get(field.key)
    if (!override) return field

    // Only confirmed overrides change the effective value
    if (!override.confirmed) return field

    return {
      ...field,
      // INV-11: null stays null (explicit reject); string = confirmed human value
      finalValue: override.overrideValue,
      source: override.source as CanonicalField['source'],
      // User confirmed → no longer needs review
      reviewRequired: false,
      // rawValue, rawCyrillic, evidence[] are preserved from base (spread above)
    }
  })

  return { ...base, fields: resolvedFields }
}

// ---------------------------------------------------------------------------
// 7. verifyCanonicalHash
// ---------------------------------------------------------------------------

/**
 * Re-compute fields_hash from the stored fields_json and compare to the stored hash.
 * Returns valid=true when they match. On mismatch, returns a description (no PII —
 * only hash values, not field content).
 *
 * NOT-FOUND vs INFRA vs MISMATCH contract (three distinct outcomes):
 *   - row does not exist        → { valid: false, notFound: true }   (caller → 404)
 *   - genuine Supabase/DB error → THROWS                              (caller → 503)
 *   - row exists, hash differs  → { valid: false, mismatch: '…' }    (caller → 409)
 * Previously a not-found row AND a query error were both collapsed into
 * { valid:false, mismatch } → a missing id wrongly produced 409 (hash mismatch).
 */
export async function verifyCanonicalHash(
  canonicalId: string
): Promise<{ valid: boolean; mismatch?: string; notFound?: boolean }> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('canonical_documents')
    .select('fields_json, fields_hash, result_hash, doc_type, product, fields_hash_schema_version')
    .eq('id', canonicalId)
    .maybeSingle()

  if (error) {
    // Real infra/query failure — surface as a throw so the route returns 503,
    // never a 409 hash-mismatch (which would falsely implicate the data).
    throw new Error(
      `[canonical/persistence] verifyCanonicalHash query failed: ${error.message}`
    )
  }
  if (!data) {
    // Not found is NOT a hash mismatch and NOT infra — distinct signal for 404.
    return { valid: false, notFound: true }
  }

  // Forward-safe version gate: never reinterpret a non-v2 hash with the v2 algorithm.
  const storedVersion =
    ((data as Record<string, unknown>).fields_hash_schema_version as number | null) ??
    FIELDS_HASH_SCHEMA_VERSION
  if (storedVersion !== FIELDS_HASH_SCHEMA_VERSION) {
    return {
      valid: false,
      mismatch: `hash schema version mismatch: stored=${storedVersion} verifier=${FIELDS_HASH_SCHEMA_VERSION}`,
    }
  }

  const reconstructed = rowToResult(data as Record<string, unknown>)
  const recomputedFieldsHash = computeFieldsHash(reconstructed)
  const recomputedResultHash = computeResultHash(reconstructed)

  const storedFieldsHash = (data as Record<string, unknown>).fields_hash as string
  const storedResultHash = (data as Record<string, unknown>).result_hash as string

  if (
    recomputedFieldsHash !== storedFieldsHash ||
    recomputedResultHash !== storedResultHash
  ) {
    return {
      valid: false,
      mismatch:
        `fields_hash stored=${storedFieldsHash.slice(0, 16)} recomputed=${recomputedFieldsHash.slice(0, 16)}; ` +
        `result_hash stored=${storedResultHash.slice(0, 16)} recomputed=${recomputedResultHash.slice(0, 16)}`,
    }
  }

  return { valid: true }
}

// ---------------------------------------------------------------------------
// 8. getCanonicalDocumentId
// ---------------------------------------------------------------------------

/**
 * Returns the UUID of the most recent canonical document for session + docType,
 * or null if none exists. Useful for callers that only need the id.
 */
export async function getCanonicalDocumentId(
  sessionId: string,
  docType: string
): Promise<string | null> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('canonical_documents')
    .select('id')
    .eq('session_id', sessionId)
    .eq('doc_type', docType)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(
      `[canonical/persistence] getCanonicalDocumentId failed: ${error.message}`
    )
  }

  return data ? ((data as Record<string, unknown>).id as string) : null
}
