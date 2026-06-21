/**
 * POST /api/ead/generate-packet
 *
 * Body: EadFieldData (from EADWizard) + optional canonical_document_id / session_id.
 * Returns: application/pdf — filled USCIS I-765.
 *
 * Free self-help endpoint (no Stripe). Per the EAD page docstring:
 * "No Stripe. No USCIS submission. Not legal advice."
 *
 * Rate-limited (10/min/IP) — PDF generation hits disk + pdf-lib.
 *
 * CANONICAL_CONTINUITY: wired to canonical persistence (shadow / enforce / off modes).
 *   shadow  (default) — load canonical when id provided; fall through to legacy on error.
 *   enforce           — canonical_document_id required; errors are hard failures.
 *   off               — skip canonical entirely; use legacy EadFieldData path.
 *
 * HTTP status contract (binding — NEVER change without updating DESIGN_LOCK.md):
 *   422 CANONICAL_ID_REQUIRED      → id missing/malformed in enforce mode (CLIENT error)
 *   409 CANONICAL_HASH_MISMATCH    → hash verification failed
 *   409 CANONICAL_NOT_READY        → canonical not yet persisted (race)
 *   409 OVERRIDE_VERSION_CONFLICT  → stale override rejected
 *   404 CANONICAL_NOT_FOUND        → id not in DB
 *   403 CANONICAL_SESSION_MISMATCH → id belongs to different session
 *   503 CANONICAL_STORAGE_UNAVAILABLE → actual Supabase infra failure ONLY
 *
 * PII rule: never log field values; log only field keys, counts, and event codes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import { getCanonicalMode } from '@/lib/canonical/continuityMode'
import { buildEadPacket } from '@/lib/ead/packetBuilder'
import type { EadFieldData } from '@/lib/ead/i765FieldMap'
// CANONICAL_CONTINUITY: canonical persistence and error codes
import type { CanonicalDocumentResult } from '@/lib/canonical/types'
import {
  resolveCanonicalDocument,
  verifyCanonicalHash,
} from '@/lib/canonical/persistence'
import { canonicalError } from '@/lib/canonical/persistence/errors'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ip = getClientIP(req)
  const rl = await rateLimit(`ead-generate:${ip}`, 10, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Wait a minute.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)) } },
    )
  }

  let rawBody: Record<string, unknown>
  try {
    rawBody = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Extract canonical continuity fields from the body before treating the rest as EadFieldData.
  const canonical_document_id =
    typeof rawBody.canonical_document_id === 'string' ? rawBody.canonical_document_id : null
  const session_id =
    typeof rawBody.session_id === 'string' ? rawBody.session_id : null

  // Remove canonical sidecar keys so they don't leak into EadFieldData processing.
  delete rawBody.canonical_document_id
  delete rawBody.session_id

  const data = rawBody as unknown as EadFieldData

  // Minimum viable input: at least a name. Everything else can be filled by
  // hand on the printed PDF — but generating an empty form is pointless.
  if (!data?.firstName?.trim() && !data?.lastName?.trim()) {
    return NextResponse.json(
      { error: 'At least first or last name is required to generate a draft I-765.' },
      { status: 400 },
    )
  }

  // ── CANONICAL_CONTINUITY: load resolved canonical if available ──────────────
  const mode = getCanonicalMode('ead')

  let documentCanonical: CanonicalDocumentResult | null = null

  if (mode === 'enforce' && !canonical_document_id) {
    return NextResponse.json(
      canonicalError('CANONICAL_ID_REQUIRED', 'canonical_document_id required in enforce mode'),
      { status: 422 },
    )
  }

  if (canonical_document_id && mode !== 'off') {
    // Verify hash integrity first.
    // NOT-FOUND vs INFRA vs MISMATCH: notFound:true → 404, throw → 503, mismatch → 409.
    // A missing id must NOT surface as a 409 hash mismatch or a 503.
    let hashCheck: { valid: boolean; mismatch?: string; notFound?: boolean }
    try {
      hashCheck = await verifyCanonicalHash(canonical_document_id)
    } catch {
      if (mode === 'enforce') {
        return NextResponse.json(
          canonicalError('CANONICAL_STORAGE_UNAVAILABLE'),
          { status: 503 },
        )
      }
      // shadow: log metadata key only (no PII), continue with legacy
      console.warn('[canonical/continuity] ead-generate canonical_hash_verify_failed_shadow', {
        event: 'canonical_hash_verify_failed_shadow',
        canonical_document_id,
      })
      hashCheck = { valid: false }
    }

    if (hashCheck.notFound) {
      if (mode === 'enforce') {
        return NextResponse.json(canonicalError('CANONICAL_NOT_FOUND'), { status: 404 })
      }
      // shadow: log metadata key only (no PII), continue with legacy
      console.warn('[canonical/continuity] ead-generate canonical_not_found_shadow', {
        event: 'canonical_not_found_shadow',
        canonical_document_id,
      })
    } else if (!hashCheck.valid) {
      if (mode === 'enforce') {
        return NextResponse.json(
          canonicalError('CANONICAL_HASH_MISMATCH', hashCheck.mismatch),
          { status: 409 },
        )
      }
      // shadow: log metadata key only (no PII), continue with legacy
      console.warn('[canonical/continuity] ead-generate canonical_hash_mismatch_shadow', {
        event: 'canonical_hash_mismatch_shadow',
        canonical_document_id,
      })
    } else {
      try {
        documentCanonical = await resolveCanonicalDocument(canonical_document_id)
        if (!documentCanonical) {
          if (mode === 'enforce') {
            return NextResponse.json(
              canonicalError('CANONICAL_NOT_FOUND'),
              { status: 404 },
            )
          }
          // shadow: fall through to legacy
        } else if (session_id && documentCanonical.documentSessionId && documentCanonical.documentSessionId !== session_id) {
          if (mode === 'enforce') {
            return NextResponse.json(
              canonicalError('CANONICAL_SESSION_MISMATCH'),
              { status: 403 },
            )
          }
          // shadow: discard mismatched canonical, continue with legacy
          console.warn('[canonical/continuity] ead-generate canonical_session_mismatch_shadow', {
            event: 'canonical_session_mismatch_shadow',
            canonical_document_id,
          })
          documentCanonical = null
        } else {
          console.info('[canonical/continuity] ead-generate canonical_loaded', {
            event: 'canonical_loaded',
            canonical_document_id,
            fields: documentCanonical.fields.length,
          })
        }
      } catch {
        if (mode === 'enforce') {
          return NextResponse.json(
            canonicalError('CANONICAL_STORAGE_UNAVAILABLE'),
            { status: 503 },
          )
        }
        // shadow: log event key only (no PII), continue with legacy
        console.warn('[canonical/continuity] ead-generate canonical_load_failed_shadow', {
          event: 'canonical_load_failed_shadow',
          canonical_document_id,
        })
      }
    }
  }

  // Safety guard (unreachable in enforce due to 422 above, but preserves type invariant):
  // If enforce mode and no canonical was resolved, return 409 CANONICAL_NOT_READY.
  if (mode === 'enforce' && !documentCanonical) {
    return NextResponse.json(
      canonicalError('CANONICAL_NOT_READY', 'canonical document not available in enforce mode'),
      { status: 409 },
    )
  }
  // ── END CANONICAL_CONTINUITY ──────────────────────────────────────────────

  try {
    // CANONICAL PATH: documentCanonical non-null → document-derived fields from canonical.
    // LEGACY FALLBACK: documentCanonical null → allowed in off/shadow mode only.
    //   In enforce mode this path is unreachable (422/409 returned above).
    const result = await buildEadPacket(data, documentCanonical)
    return new NextResponse(new Uint8Array(result.pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="I-765-draft-${(data.lastName || 'applicant').replace(/[^A-Za-z0-9]/g, '')}.pdf"`,
        'X-I765-Edition': result.edition,
        'X-Fields-Applied': String(result.applied),
        'X-Fields-Skipped': String(result.skipped),
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ead/generate-packet] failed', { event: 'generation_failed', detail: msg })
    return NextResponse.json(
      { error: 'PDF generation failed. Try again in a moment.' },
      { status: 500 },
    )
  }
}
