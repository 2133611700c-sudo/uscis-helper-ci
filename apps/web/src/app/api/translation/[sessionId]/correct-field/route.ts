/**
 * POST /api/translation/[sessionId]/correct-field
 *
 * Applies a human correction to an extracted field value.
 * Records a user_corrections row, updates extracted_fields.normalized_value,
 * and marks the field as confirmed.
 *
 * Body: {
 *   field: string               — e.g. 'surname'
 *   new_value: string           — corrected English value (plain text)
 *   reason?: string             — ocr_error | controlling_spelling | one_document_exception | manual
 * }
 *
 * Returns: { ok, field, new_value, confirmed_at, correction_id }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import {
  validateSessionId,
  validateFieldName,
  validateCorrectionValue,
  normalizeValue,
} from '@/lib/translation/inputValidation'
// CANONICAL_OVERRIDE_LOOP (P1): route the live correction into the canonical
// override chain (dual-write) — flag default OFF, legacy write unchanged.
import { getOverrideLoopMode } from '@/lib/canonical/overrideLoopMode'
import { appendCorrectionAsCanonicalOverride } from '@/lib/canonical/overrideLoop'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const CRITICAL_FIELDS = [
  'surname', 'given_names', 'date_of_birth', 'place_of_birth',
  'series', 'number', 'issued_by', 'date_of_issue',
]

const VALID_REASONS = ['ocr_error', 'controlling_spelling', 'one_document_exception', 'manual']

/** Best-effort audit write — never throws. */
async function tryAudit(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from('audit_logs').insert(payload)
  } catch { /* swallow */ }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params
  const body = await req.json().catch(() => ({})) as {
    field?: string
    new_value?: string
    reason?: string
    canonical_document_id?: string
  }

  const { field, new_value, reason = 'manual', canonical_document_id } = body

  // ── Input validation ─────────────────────────────────────────────────────
  const sessionErr = validateSessionId(sessionId)
  if (sessionErr) return NextResponse.json({ ok: false, ...sessionErr }, { status: sessionErr.status })

  const fieldErr = validateFieldName(field)
  if (fieldErr) {
    const supabase = createAdminSupabaseClient()
    await tryAudit(supabase, {
      session_id: sessionId,
      event_type: 'validation_failed',
      metadata: {
        route: 'correct-field',
        error_code: 'invalid_field',
        field_attempted: typeof field === 'string' ? field.slice(0, 50) : '<non-string>',
      },
    })
    return NextResponse.json({ ok: false, ...fieldErr }, { status: fieldErr.status })
  }

  const safeField = field as string
  const valueErr = validateCorrectionValue(new_value, safeField)
  if (valueErr) {
    const supabase = createAdminSupabaseClient()
    await tryAudit(supabase, {
      session_id: sessionId,
      event_type: 'validation_failed',
      metadata: {
        route: 'correct-field',
        field: safeField,
        error_code: 'invalid_value',
        value_length: typeof new_value === 'string' ? new_value.length : -1,
      },
    })
    return NextResponse.json({ ok: false, ...valueErr }, { status: valueErr.status })
  }

  const correctedValue = normalizeValue(new_value as string)
  const correctionType = VALID_REASONS.includes(reason ?? '') ? reason! : 'manual'
  const confirmedAt = new Date().toISOString()
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

  // ── Load current value for correction record ─────────────────────────────
  const { data: existing } = await supabase
    .from('extracted_fields')
    .select('id, normalized_value')
    .eq('session_id', sessionId)
    .eq('field', safeField)
    .single()

  if (!existing) {
    return NextResponse.json(
      { ok: false, error: 'field_not_found', message: `Field "${safeField}" not found for this session.` },
      { status: 404 }
    )
  }

  const oldValue = existing.normalized_value ?? ''

  // ── Update extracted_fields ──────────────────────────────────────────────
  const { error: updateErr } = await supabase
    .from('extracted_fields')
    .update({
      normalized_value: correctedValue,
      confirmed: true,
      confirmed_at: confirmedAt,
      review_required: false,
    })
    .eq('session_id', sessionId)
    .eq('field', safeField)

  if (updateErr) {
    await tryAudit(supabase, {
      session_id: sessionId,
      event_type: 'error',
      metadata: { route: 'correct-field', field: safeField, error_code: updateErr.code },
    })
    return NextResponse.json({ ok: false, error: 'db_error', message: 'Could not update field.' }, { status: 500 })
  }

  // ── Insert user_corrections row ──────────────────────────────────────────
  const { data: version } = await supabase
    .from('user_corrections')
    .select('id', { count: 'exact', head: false })
    .eq('session_id', sessionId)
    .eq('field', safeField)

  const versionNum = (version?.length ?? 0) + 1

  const { data: correctionRow, error: insertErr } = await supabase
    .from('user_corrections')
    .insert({
      session_id: sessionId,
      field: safeField,
      old_value: oldValue,
      new_value: correctedValue,
      reason: correctionType,
      correction_type: correctionType,
      version: versionNum,
    })
    .select('id')
    .single()

  if (insertErr) {
    await tryAudit(supabase, {
      session_id: sessionId,
      event_type: 'error',
      metadata: {
        route: 'correct-field',
        field: safeField,
        error_code: insertErr.code,
        step: 'user_corrections_insert',
      },
    })
    // Do NOT return 200 — correction was not persisted
    return NextResponse.json(
      { ok: false, error: 'correction_log_failed', message: 'Correction could not be recorded.' },
      { status: 500 }
    )
  }

  // ── Audit — PII-safe: no raw values, only lengths and metadata ───────────
  await tryAudit(supabase, {
    session_id: sessionId,
    event_type: 'field_corrected',
    metadata: {
      field: safeField,
      correction_type: correctionType,
      version: versionNum,
      old_value_length: oldValue.length,
      new_value_length: correctedValue.length,
    },
  })

  // ── CANONICAL_OVERRIDE_LOOP (P1): dual-write into the canonical chain ─────
  // Flag default OFF → this block is skipped entirely; the legacy correction
  // above is byte-identical to today. In shadow, the legacy write stays
  // authoritative for output; we additionally append a confirmed canonical
  // override so resolveCanonicalDocument reflects the human edit. Best-effort:
  // a canonical failure never affects the 200 returned for the legacy write.
  // Fail-safe linkage: a canonical override is attempted ONLY when a valid
  // canonical_document_id was supplied; absent/malformed → legacy-only.
  let canonicalLoop: 'off' | 'skipped_no_id' | 'appended' | 'not_found' | 'conflict' | 'storage_error' = 'off'
  const overrideLoopMode = getOverrideLoopMode()
  if (overrideLoopMode !== 'off') {
    if (typeof canonical_document_id === 'string' && UUID_RE.test(canonical_document_id)) {
      const res = await appendCorrectionAsCanonicalOverride({
        canonicalDocumentId: canonical_document_id,
        fieldKey: safeField,
        newValue: correctedValue,
        source: 'user_edit',
        actor: 'user',
        reason: correctionType,
      })
      canonicalLoop = res.ok
        ? 'appended'
        : res.kind === 'not_found'
          ? 'not_found'
          : res.kind === 'conflict'
            ? 'conflict'
            : 'storage_error'
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
    new_value: correctedValue,
    old_value: oldValue,
    confirmed_at: confirmedAt,
    correction_id: correctionRow?.id ?? null,
    correction_type: correctionType,
    canonical_loop: canonicalLoop,
    gates: {
      can_certify: canCertify,
      critical_confirmed: criticalConfirmed,
      critical_total: criticalRows.length,
    },
  })
}
