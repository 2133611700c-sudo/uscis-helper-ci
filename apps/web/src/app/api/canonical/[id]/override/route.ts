/**
 * /api/canonical/[id]/override
 *
 * The MISSING HTTP override route. Wires appendCanonicalOverride (the atomic RPC)
 * to application traffic so users/certifiers can append confirmed overrides to a
 * persisted canonical document with optimistic concurrency.
 *
 * INV-11: override_value === null is LEGAL (explicit C3 reject) — persisted as null,
 *         never dropped. confirmed must be true for the override to release a value.
 * The base canonical_documents row is NEVER mutated — overrides are append-only.
 *
 * HTTP STATUS CONTRACT (binding):
 *   422 CANONICAL_ID_REQUIRED         → id missing/malformed, field_key empty,
 *                                        confirmed!==true, body malformed (CLIENT error)
 *   409 OVERRIDE_VERSION_CONFLICT     → atomic RPC raised version conflict (stale expected_version)
 *   409 CANONICAL_HASH_MISMATCH       → base hash verification failed
 *   404 CANONICAL_NOT_FOUND           → canonical id not in DB
 *   403 CANONICAL_SESSION_MISMATCH    → canonical belongs to a different session
 *   503 CANONICAL_STORAGE_UNAVAILABLE → actual Supabase infra failure ONLY
 *   Never 503 for a client data problem.
 *
 * PII rule: never log override_value. Only event, canonical_id, field_keys, counts.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  loadCanonicalDocumentById,
  listCanonicalOverrides,
  appendCanonicalOverride,
  verifyCanonicalHash,
  type CanonicalOverride,
} from '@/lib/canonical/persistence'
import { canonicalError, CanonicalConcurrencyError } from '@/lib/canonical/persistence/errors'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const VALID_SOURCES = new Set(['user_edit', 'certifier_override', 'system_correction'])

interface OverrideInput {
  field_key?: unknown
  override_value?: unknown
  source?: unknown
  reason?: unknown
  confirmed?: unknown
  actor?: unknown
  supersedes_id?: unknown
  original_rejection_reasons?: unknown
}

interface PostBody {
  session_id?: unknown
  expected_version?: unknown
  overrides?: unknown
}

/**
 * Ownership check helper. The persisted canonical exposes documentSessionId (the
 * session that produced it). If both the canonical's session and the supplied
 * session_id are present and differ → 403. When either is absent we cannot prove
 * a mismatch, so we do not block (the capability is the canonical UUID itself).
 */
function isSessionMismatch(
  canonicalSessionId: string | null | undefined,
  bodySessionId: string | null | undefined,
): boolean {
  return Boolean(
    canonicalSessionId &&
      bodySessionId &&
      canonicalSessionId !== bodySessionId,
  )
}

// ===========================================================================
// POST — append confirmed override(s) with optimistic concurrency
// ===========================================================================

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params

  // 1+2. id must be a UUID — else 422 (client error)
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json(
      canonicalError('CANONICAL_ID_REQUIRED', 'invalid UUID format'),
      { status: 422 },
    )
  }

  // 3. Parse + validate body strictly. Any malformation → 422.
  let body: PostBody
  try {
    body = (await req.json()) as PostBody
  } catch {
    return NextResponse.json(
      canonicalError('CANONICAL_ID_REQUIRED', 'malformed JSON body'),
      { status: 422 },
    )
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json(
      canonicalError('CANONICAL_ID_REQUIRED', 'body must be an object'),
      { status: 422 },
    )
  }

  const sessionId =
    typeof body.session_id === 'string' ? body.session_id : undefined

  if (typeof body.expected_version !== 'number' || !Number.isFinite(body.expected_version)) {
    return NextResponse.json(
      canonicalError('CANONICAL_ID_REQUIRED', 'expected_version must be a number'),
      { status: 422 },
    )
  }
  const expectedVersion = body.expected_version

  if (!Array.isArray(body.overrides) || body.overrides.length === 0) {
    return NextResponse.json(
      canonicalError('CANONICAL_ID_REQUIRED', 'overrides must be a non-empty array'),
      { status: 422 },
    )
  }

  // Strict per-override validation → map to camelCase CanonicalOverride.
  const overrides: CanonicalOverride[] = []
  for (const raw of body.overrides as OverrideInput[]) {
    if (typeof raw !== 'object' || raw === null) {
      return NextResponse.json(
        canonicalError('CANONICAL_ID_REQUIRED', 'each override must be an object'),
        { status: 422 },
      )
    }
    if (typeof raw.field_key !== 'string' || raw.field_key.trim() === '') {
      return NextResponse.json(
        canonicalError('CANONICAL_ID_REQUIRED', 'field_key must be a non-empty string'),
        { status: 422 },
      )
    }
    // INV-11: override_value === null is LEGAL. string | null only.
    if (raw.override_value !== null && typeof raw.override_value !== 'string') {
      return NextResponse.json(
        canonicalError('CANONICAL_ID_REQUIRED', 'override_value must be a string or null'),
        { status: 422 },
      )
    }
    if (typeof raw.source !== 'string' || !VALID_SOURCES.has(raw.source)) {
      return NextResponse.json(
        canonicalError(
          'CANONICAL_ID_REQUIRED',
          'source must be one of user_edit|certifier_override|system_correction',
        ),
        { status: 422 },
      )
    }
    // confirmed must be true to release an effective value later (contract).
    if (raw.confirmed !== true) {
      return NextResponse.json(
        canonicalError('CANONICAL_ID_REQUIRED', 'confirmed must be true'),
        { status: 422 },
      )
    }
    if (raw.reason !== undefined && typeof raw.reason !== 'string') {
      return NextResponse.json(
        canonicalError('CANONICAL_ID_REQUIRED', 'reason must be a string when present'),
        { status: 422 },
      )
    }
    if (raw.actor !== undefined && typeof raw.actor !== 'string') {
      return NextResponse.json(
        canonicalError('CANONICAL_ID_REQUIRED', 'actor must be a string when present'),
        { status: 422 },
      )
    }
    if (raw.supersedes_id !== undefined && typeof raw.supersedes_id !== 'string') {
      return NextResponse.json(
        canonicalError('CANONICAL_ID_REQUIRED', 'supersedes_id must be a string when present'),
        { status: 422 },
      )
    }
    if (
      raw.original_rejection_reasons !== undefined &&
      !(
        Array.isArray(raw.original_rejection_reasons) &&
        raw.original_rejection_reasons.every((r) => typeof r === 'string')
      )
    ) {
      return NextResponse.json(
        canonicalError(
          'CANONICAL_ID_REQUIRED',
          'original_rejection_reasons must be a string array when present',
        ),
        { status: 422 },
      )
    }

    overrides.push({
      fieldKey: raw.field_key,
      overrideValue: raw.override_value as string | null,
      source: raw.source as CanonicalOverride['source'],
      reason: raw.reason as string | undefined,
      confirmed: true,
      actor: raw.actor as string | undefined,
      supersedesId: raw.supersedes_id as string | undefined,
      originalRejectionReasons: raw.original_rejection_reasons as string[] | undefined,
    })
  }

  // 4. Load base canonical. null → 404; infra throw → 503.
  let base
  try {
    base = await loadCanonicalDocumentById(id)
  } catch {
    console.error('[canonical/override] POST storage unavailable on load', { canonical_id: id })
    return NextResponse.json(
      canonicalError('CANONICAL_STORAGE_UNAVAILABLE'),
      { status: 503 },
    )
  }
  if (!base) {
    return NextResponse.json(canonicalError('CANONICAL_NOT_FOUND'), { status: 404 })
  }

  // 5. Ownership.
  if (isSessionMismatch(base.documentSessionId, sessionId)) {
    return NextResponse.json(
      canonicalError('CANONICAL_SESSION_MISMATCH'),
      { status: 403 },
    )
  }

  // 6. Base hash verification. infra throw → 503; invalid → 409.
  let hashCheck: { valid: boolean; mismatch?: string }
  try {
    hashCheck = await verifyCanonicalHash(id)
  } catch {
    console.error('[canonical/override] POST storage unavailable on hash verify', { canonical_id: id })
    return NextResponse.json(
      canonicalError('CANONICAL_STORAGE_UNAVAILABLE'),
      { status: 503 },
    )
  }
  if (!hashCheck.valid) {
    return NextResponse.json(
      canonicalError('CANONICAL_HASH_MISMATCH', hashCheck.mismatch),
      { status: 409 },
    )
  }

  // 7. Atomic append. Concurrency conflict → 409; other throw → 503.
  let newVersion: number
  try {
    newVersion = await appendCanonicalOverride(id, overrides, { expectedVersion })
  } catch (err) {
    if (err instanceof CanonicalConcurrencyError) {
      return NextResponse.json(
        { error: 'OVERRIDE_VERSION_CONFLICT', detail: err.detail },
        { status: 409 },
      )
    }
    console.error('[canonical/override] POST storage unavailable on append', { canonical_id: id })
    return NextResponse.json(
      canonicalError('CANONICAL_STORAGE_UNAVAILABLE'),
      { status: 503 },
    )
  }

  // 9. PII-free success log: keys + count only, NEVER override_value.
  console.info(
    '[canonical/override] appended',
    JSON.stringify({
      event: 'override_appended',
      canonical_id: id,
      field_keys: overrides.map((o) => o.fieldKey),
      count: overrides.length,
      new_version: newVersion,
    }),
  )

  // 8. Success.
  return NextResponse.json(
    { ok: true, new_version: newVersion, applied_count: overrides.length },
    { status: 200 },
  )
}

// ===========================================================================
// GET — list override metadata (PII-SAFE: no values)
// ===========================================================================

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params

  // 1. id UUID.
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json(
      canonicalError('CANONICAL_ID_REQUIRED', 'invalid UUID format'),
      { status: 422 },
    )
  }

  const sessionId = req.nextUrl.searchParams.get('session_id') ?? undefined

  // 2. Load base → 404 if null, 503 on infra throw.
  let base
  try {
    base = await loadCanonicalDocumentById(id)
  } catch {
    console.error('[canonical/override] GET storage unavailable on load', { canonical_id: id })
    return NextResponse.json(
      canonicalError('CANONICAL_STORAGE_UNAVAILABLE'),
      { status: 503 },
    )
  }
  if (!base) {
    return NextResponse.json(canonicalError('CANONICAL_NOT_FOUND'), { status: 404 })
  }

  // 3. Ownership.
  if (isSessionMismatch(base.documentSessionId, sessionId)) {
    return NextResponse.json(
      canonicalError('CANONICAL_SESSION_MISMATCH'),
      { status: 403 },
    )
  }

  // 4. List overrides → 503 on infra throw.
  let overrides: CanonicalOverride[]
  try {
    overrides = await listCanonicalOverrides(id)
  } catch {
    console.error('[canonical/override] GET storage unavailable on list', { canonical_id: id })
    return NextResponse.json(
      canonicalError('CANONICAL_STORAGE_UNAVAILABLE'),
      { status: 503 },
    )
  }

  const fieldKeys = [...new Set(overrides.map((o) => o.fieldKey))]
  const currentVersion = overrides.length
    ? Math.max(...overrides.map((o) => o.version ?? 0))
    : 0

  // 5. PII-SAFE response — NO override_value, NO field values.
  return NextResponse.json(
    {
      canonical_document_id: id,
      count: overrides.length,
      field_keys: fieldKeys,
      current_version: currentVersion,
    },
    { status: 200 },
  )
}
