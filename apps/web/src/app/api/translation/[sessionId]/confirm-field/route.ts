/**
 * POST /api/translation/[sessionId]/confirm-field
 *
 * Marks a single extracted field as human-confirmed.
 * Required before certification is allowed for critical fields.
 *
 * Body: { field: string }   — snake_case field name (e.g. 'surname')
 *
 * Returns: { ok, field, confirmed_at, gates }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { validateSessionId, validateFieldName } from '@/lib/translation/inputValidation'
// CANONICAL_OVERRIDE_LOOP (P1): route the live confirmation into the canonical
// override chain (dual-write) — flag default OFF, legacy write unchanged.
import { getOverrideLoopMode } from '@/lib/canonical/overrideLoopMode'
import { appendCorrectionAsCanonicalOverride } from '@/lib/canonical/overrideLoop'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const CRITICAL_FIELDS = [
  'surname', 'given_names', 'date_of_birth', 'place_of_birth',
  'series', 'number', 'issued_by', 'date_of_issue',
]

/** Best-effort audit write — never throws. */
async function tryAudit(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from('audit_logs').insert(payload)
  } catch { /* swallow — audit must never crash the route */ }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params
  const body = await req.json().catch(() => ({})) as { field?: string; canonical_document_id?: string }
  const { field, canonical_document_id } = body

  // ── Input validation ─────────────────────────────────────────────────────
  const sessionErr = validateSessionId(sessionId)
  if (sessionErr) return NextResponse.json({ ok: false, ...sessionErr }, { status: sessionErr.status })

  const fieldErr = validateFieldName(field)
  if (fieldErr) return NextResponse.json({ ok: false, ...fieldErr }, { status: fieldErr.status })

  const safeField = field as string
  const supabase = createAdminSupabaseClient()

  // ── Session existence check ──────────────────────────────────────────────
  const { data: session } = await supabase
    .from('translation_sessions')
    .select('session_id')
    .eq('session_id', sessionId)
    .single()

  if (!session) {
    return NextResponse.json({ ok: false, error: 'session_not_found', message: 'Session not found.' }, { status: 404 })
  }

  const confirmedAt = new Date().toISOString()

  // Load the current value BEFORE update so the canonical override (dual-write,
  // below) can record the confirmed value. Confirm has no new value — it ratifies
  // the existing extracted value. PII-safe: value used only for the override write.
  const { data: existingField } = await supabase
    .from('extracted_fields')
    .select('normalized_value')
    .eq('session_id', sessionId)
    .eq('field', safeField)
    .single()

  const { error: updateErr } = await supabase
    .from('extracted_fields')
    .update({ confirmed: true, confirmed_at: confirmedAt })
    .eq('session_id', sessionId)
    .eq('field', safeField)

  if (updateErr) {
    await tryAudit(supabase, {
      session_id: sessionId,
      event_type: 'error',
      metadata: { route: 'confirm-field', field: safeField, error_code: updateErr.code },
    })
    return NextResponse.json({ ok: false, error: 'db_error', message: 'Could not update field.' }, { status: 500 })
  }

  // ── Audit ────────────────────────────────────────────────────────────────
  await tryAudit(supabase, {
    session_id: sessionId,
    event_type: 'field_confirmed',
    metadata: { field: safeField, confirmed_at: confirmedAt },
  })

  // ── CANONICAL_OVERRIDE_LOOP (P1): dual-write into the canonical chain ─────
  // Flag default OFF → skipped (legacy confirm byte-identical to today). In
  // shadow, additionally append a confirmed canonical override recording the
  // ratified value. Best-effort; never affects the legacy 200. Fail-safe: only
  // when a valid canonical_document_id was supplied.
  let canonicalLoop: 'off' | 'skipped_no_id' | 'skipped_no_value' | 'appended' | 'not_found' | 'conflict' | 'storage_error' = 'off'
  const overrideLoopMode = getOverrideLoopMode()
  if (overrideLoopMode !== 'off') {
    const confirmedValue = existingField?.normalized_value ?? null
    if (typeof canonical_document_id === 'string' && UUID_RE.test(canonical_document_id)) {
      if (typeof confirmedValue === 'string' && confirmedValue.length > 0) {
        const res = await appendCorrectionAsCanonicalOverride({
          canonicalDocumentId: canonical_document_id,
          fieldKey: safeField,
          newValue: confirmedValue,
          source: 'user_edit',
          actor: 'user',
          reason: 'confirm',
        })
        canonicalLoop = res.ok
          ? 'appended'
          : res.kind === 'not_found'
            ? 'not_found'
            : res.kind === 'conflict'
              ? 'conflict'
              : 'storage_error'
      } else {
        // Confirm with no value to ratify → nothing to write to canonical.
        canonicalLoop = 'skipped_no_value'
      }
    } else {
      canonicalLoop = 'skipped_no_id'
    }
  }

  // ── Recompute gates ──────────────────────────────────────────────────────
  const { data: allFields } = await supabase
    .from('extracted_fields')
    .select('field, confirmed')
    .eq('session_id', sessionId)

  const fields = allFields ?? []
  const criticalRows = fields.filter(f => CRITICAL_FIELDS.includes(f.field))
  const criticalConfirmed = criticalRows.filter(f => f.confirmed).length
  const canCertify = criticalRows.length > 0 && criticalConfirmed === criticalRows.length

  return NextResponse.json({
    ok: true,
    field: safeField,
    confirmed_at: confirmedAt,
    canonical_loop: canonicalLoop,
    gates: {
      can_certify: canCertify,
      critical_confirmed: criticalConfirmed,
      critical_total: criticalRows.length,
    },
  })
}
