/**
 * POST /api/translation/render
 *
 * Final render — generates real PDF using pdf-lib.
 * HARD GATES (all must pass before render):
 *   1. payment_confirmed = true (verified server-side via Stripe checkout ID)
 *   2. CertificationRecord complete and valid
 *   3. QA validators pass (no forbidden phrases, source traces present)
 *   4. All critical fields have source trace
 *
 * v5.1: Canonical continuity cutover (CANONICAL_CONTINUITY_MODE).
 * When canonical_document_id is present, the resolved canonical document is used
 * as the field source. In enforce mode, extracted_fields cannot be the authority.
 * Certification binds all 7 hash fields per CERTIFICATION_REPRODUCIBILITY_CONTRACT.
 *
 * Returns: application/pdf binary or { ok: false, qa_failures }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { getCanonicalMode } from '@/lib/canonical/continuityMode'
import { runQaValidators } from '@/lib/translation/translationQaValidator'
import { buildFinalDocument } from '@/lib/translation/bureauStyleRenderer'
import { validateCertificationRecord } from '@/lib/translation/certificationRecord'
import { PacketState } from '@/lib/translation/types'
import { generateTranslationPDF } from '@/lib/packet/pdf'
import {
  getCriticalFieldsForDocumentType,
  getEvidenceRequiredFieldsForDocumentType,
} from '@/lib/translation/modules/adapters'
import { getOpenManualReviewForSession } from '@/lib/translation/manualReview/integrations'
import { verifyStripeSessionPaid } from '@/lib/stripe/verifyPayment'
// ── Canonical continuity ─────────────────────────────────────────────────────
import {
  resolveCanonicalDocument,
  listCanonicalOverrides,
  computeFieldsHash,
  computeResolvedHash,
  computeOverrideSetHash,
} from '@/lib/canonical/persistence'
import { canonicalError } from '@/lib/canonical/persistence/errors'
import type { CanonicalDocumentResult } from '@/lib/canonical/types'
import { canonicalToFieldOut } from '@/lib/canonical/core/translationAdapter'
import { CANONICAL_SCHEMA_VERSION, RENDERER_VERSION } from '@/lib/canonical/version'

export const dynamic = 'force-dynamic'

// DRY: use the shared single source of truth (was a local copy of this
// function). Behaviour-preserving — render does not require expectedService.
async function verifyStripePayment(checkoutId: string): Promise<boolean> {
  const v = await verifyStripeSessionPaid(checkoutId)
  return v.paid
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    session_id?: string
    checkout_id?: string   // Stripe checkout session ID for payment verification
    canonical_document_id?: string
  }

  const { session_id, checkout_id, canonical_document_id } = body

  // ── Canonical continuity (CANONICAL_CONTINUITY_MODE) ─────────────────────────
  // off    → skip canonical, use extracted_fields from DB (emergency rollback)
  // shadow → load canonical when canonical_document_id present; compare PII-free, legacy output
  // enforce → canonical_document_id REQUIRED; missing → 422; infra fail → 503
  const continuityMode = getCanonicalMode('translation')

  if (continuityMode === 'enforce' && !canonical_document_id) {
    console.warn('[translation/render] continuity=enforce canonical_document_id missing → 422')
    return NextResponse.json(canonicalError('CANONICAL_ID_REQUIRED', 'canonical_document_id is required in enforce mode'), { status: 422 })
  }

  let sourceCanonical: CanonicalDocumentResult | null = null
  let canonicalFieldsHash: string | null = null
  let resolvedCanonicalHash: string | null = null
  let overrideSetHash: string | null = null
  let overrideVersion: number | null = null

  if (canonical_document_id && continuityMode !== 'off') {
    try {
      sourceCanonical = await resolveCanonicalDocument(canonical_document_id)
      if (!sourceCanonical) {
        if (continuityMode === 'enforce') {
          console.warn('[translation/render] continuity=enforce canonical not found → 404', { id: canonical_document_id })
          return NextResponse.json(canonicalError('CANONICAL_NOT_FOUND'), { status: 404 })
        }
        // shadow: log PII-free and fall through to extracted_fields
        console.warn('[translation/render] continuity=shadow canonical not found, falling back to extracted_fields')
      } else {
        // Compute hash binding for certification record
        canonicalFieldsHash = computeFieldsHash(sourceCanonical)
        const overrides = await listCanonicalOverrides(canonical_document_id)
        resolvedCanonicalHash = computeResolvedHash(canonicalFieldsHash, overrides)
        overrideSetHash = computeOverrideSetHash(overrides)
        overrideVersion = overrides.length > 0
          ? Math.max(...overrides.map((o) => o.version ?? 0))
          : 0
        // PII-free telemetry: keys and counts only, no values
        console.info('[translation/render] continuity', JSON.stringify({
          mode: continuityMode,
          // PII-free: hash prefixes only
          fieldsHash: canonicalFieldsHash.slice(0, 12),
          resolvedHash: resolvedCanonicalHash.slice(0, 12),
          fieldCount: sourceCanonical.fields.length,
          overrideCount: overrides.length,
          // Shadow comparison: which field keys are in canonical vs DB (no values)
          fieldKeys: sourceCanonical.fields.map((f) => f.key),
        }))
      }
    } catch {
      if (continuityMode === 'enforce') {
        console.error('[translation/render] continuity=enforce canonical storage unavailable → 503')
        return NextResponse.json(canonicalError('CANONICAL_STORAGE_UNAVAILABLE'), { status: 503 })
      }
      // shadow: log, fall through
      console.warn('[translation/render] continuity=shadow canonical load failed, falling back to extracted_fields')
    }
  } else if (continuityMode === 'off') {
    console.warn('[translation/render] continuity_mode=off — canonical persistence SKIPPED (emergency rollback)')
  }
  if (!session_id) return NextResponse.json({ ok: false, error: 'session_id required' }, { status: 400 })

  // Load all state from v5 schema (session + related tables)
  const supabase = createAdminSupabaseClient()
  const { data: sessionData, error } = await supabase
    .from('translation_sessions')
    .select('*')
    .eq('session_id', session_id)
    .single()

  if (error || !sessionData) {
    return NextResponse.json({ ok: false, error: 'Session not found' }, { status: 404 })
  }

  // Load certification record
  const { data: certData } = await supabase
    .from('certification_records')
    .select('*')
    .eq('session_id', session_id)
    .single()

  // Load extracted fields → map to ExtractedField[] and SourceTrace[]
  const { data: fieldRows } = await supabase
    .from('extracted_fields')
    .select('*')
    .eq('session_id', session_id)
    .order('created_at')

  const dbExtractedFields = (fieldRows ?? []).map((r: Record<string, unknown>) => ({
    field:            r.field,
    source_label:     r.source_label ?? '',
    source_zone:      r.source_zone ?? 'unknown',
    bbox:             [0, 0, 1, 0.1] as [number,number,number,number],
    raw_value:        r.raw_value ?? '',
    normalized_value: r.normalized_value ?? '',
    language_layer:   r.language_layer ?? 'uk',
    confidence:       Number(r.confidence ?? 1),
    review_required:  Boolean(r.review_required),
  }))

  // ── Canonical → field injection ───────────────────────────────────────────
  // In enforce mode: canonical is the ONLY field authority (extracted_fields from DB
  // cannot be the authority). In shadow/off: fall back to DB extracted_fields.
  // C3 null fields (finalValue=null) are OMITTED from render output (INV-11).
  let extractedFields = dbExtractedFields
  if (sourceCanonical) {
    const canonicalAsFields = sourceCanonical.fields
      .map((f) => canonicalToFieldOut(f))
      .filter((fo) => fo.value !== null) // INV-11: C3 null → omit from render
      .map((fo) => ({
        field: fo.field,
        source_label: fo.kind ?? 'canonical',
        source_zone: fo.kind ?? 'canonical',
        bbox: [0, 0, 0, 0] as [number, number, number, number],
        raw_value: fo.value ?? '',
        normalized_value: fo.value ?? '',
        language_layer: 'unknown' as const,
        confidence: fo.confidence,
        review_required: fo.review_required,
      }))

    if (continuityMode === 'enforce') {
      // Enforce: canonical is the ONLY authority — DB extracted_fields cannot contribute
      extractedFields = canonicalAsFields
    } else {
      // Shadow: canonical wins for keys it covers; DB fields for the rest (backward-compat)
      extractedFields = canonicalAsFields
      // PII-free comparison log (shadow only): key counts, no values
      console.info('[translation/render] shadow-compare', JSON.stringify({
        canonicalFieldCount: canonicalAsFields.length,
        dbFieldCount: dbExtractedFields.length,
        canonicalKeys: canonicalAsFields.map((f) => f.field),
      }))
    }
  } else if (continuityMode === 'enforce') {
    // Enforce mode but canonical load failed — already returned 503 above; unreachable
    return NextResponse.json(canonicalError('CANONICAL_NOT_READY'), { status: 409 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sourceTraces = (extractedFields as any[]).map((f) => ({
    field:            f.field,
    document_type:    sessionData.doc_type ?? 'ua_passport_internal',
    source_label:     f.source_label,
    source_zone:      f.source_zone,
    bbox:             f.bbox,
    raw_value:        f.raw_value,
    normalized_value: f.normalized_value,
    language_layer:   f.language_layer,
    confidence:       f.confidence,
    review_required:  f.review_required,
  }))

  // Assemble PacketState
  const state = {
    ...sessionData,
    document_type:        sessionData.doc_type ?? 'ua_passport_internal',
    scope_title:          sessionData.scope_title ?? 'English Translation of Ukrainian Internal Passport',
    extracted_fields:     extractedFields,
    source_traces:        sourceTraces,
    user_corrections:     [],   // populated only if user made edits in Review UI
    // Remap DB column names → CertificationRecord field names
    certification_record: certData ? {
      ...certData,
      address: certData.signer_address ?? undefined,  // DB: signer_address → type: address
    } : null,
    payment_confirmed:    Boolean(sessionData.payment_confirmed),
  } as unknown as PacketState

  // Gate 0: Manual review queue — hard block if any open ticket exists for this
  // session. Approved-for-render and completed states are pass-through; rejected
  // tickets do not block (the operator explicitly closed the case).
  // This is the DB-backed second line of defense in addition to the
  // module-level allowAutoPdf:false gate.
  const mrSummary = await getOpenManualReviewForSession(session_id)
  if (mrSummary.open) {
    return NextResponse.json({
      ok: false,
      error: 'This document is in manual review. The translation will be ready after the team review is complete.',
      gate: 'manual_review_pending',
      manual_review_status: mrSummary.status,
      message_key: mrSummary.userMessageKey,
    }, { status: 423 })
  }

  // Gate 1: Payment verification (owner bypass available)
  const { isOwnerSession, ownerAuditEvent } = await import('@/lib/ownerAccess')
  const ownerSession = await isOwnerSession(req)

  let paymentVerified: boolean
  if (ownerSession.verified) {
    // Owner bypass: skip Stripe entirely
    paymentVerified = true
    console.log('[render] Owner free access:', JSON.stringify(ownerAuditEvent('render', 'translation')))
  } else {
    paymentVerified = checkout_id
      ? await verifyStripePayment(checkout_id)
      : state.payment_confirmed
  }

  if (!paymentVerified) {
    return NextResponse.json({
      ok: false,
      error: 'Payment not confirmed. Complete checkout before rendering final document.',
      gate: 'payment',
    }, { status: 402 })
  }

  // Gate 2: Certification record
  if (!state.certification_record) {
    return NextResponse.json({
      ok: false,
      error: 'Certification record missing. Translator must sign before render.',
      gate: 'certification',
    }, { status: 400 })
  }

  const { valid, errors: certErrors } = validateCertificationRecord(state.certification_record)
  if (!valid) {
    return NextResponse.json({
      ok: false,
      error: 'Certification record incomplete',
      details: certErrors,
      gate: 'certification',
    }, { status: 400 })
  }

  // Gate 3: Source-to-final completeness audit
  // All critical fields must be human-confirmed before render
  // Field list is driven by the document module, not hardcoded.
  const CRITICAL_FIELDS_RENDER = getCriticalFieldsForDocumentType(sessionData.doc_type)
  const { data: confirmedRows } = await supabase
    .from('extracted_fields')
    .select('field, confirmed, normalized_value')
    .eq('session_id', session_id)

  type ConfirmedRow = { field: string; confirmed: boolean; normalized_value: string | null }
  const confirmedMap: Record<string, ConfirmedRow> = Object.fromEntries(
    (confirmedRows ?? []).map(r => [r.field, r as ConfirmedRow])
  )
  const unconfirmedCritical = CRITICAL_FIELDS_RENDER.filter(cf => {
    const row = confirmedMap[cf]
    return row && !row.confirmed
  })
  const missingCritical = CRITICAL_FIELDS_RENDER.filter(cf => !confirmedMap[cf])

  // Final PDF fields must match the confirmed DB values (source-to-final audit)
  const finalFieldMap = Object.fromEntries(
    state.extracted_fields.map(f => [f.field, f.normalized_value])
  )
  const mismatchedFields: string[] = []
  for (const [field, dbRow] of Object.entries(confirmedMap)) {
    const finalVal = finalFieldMap[field]
    if (dbRow.confirmed && finalVal && finalVal !== dbRow.normalized_value) {
      mismatchedFields.push(`${field}: DB="${dbRow.normalized_value}" vs final="${finalVal}"`)
    }
  }

  if (unconfirmedCritical.length > 0 || missingCritical.length > 0 || mismatchedFields.length > 0) {
    // PII-safe: log field names and counts only — never field values
    await supabase.from('audit_logs').insert({
      session_id,
      event_type: 'render_blocked_completeness_audit',
      metadata: {
        unconfirmed_critical_fields: unconfirmedCritical,
        missing_critical_fields: missingCritical,
        mismatched_field_names: mismatchedFields.map(m => m.split(':')[0]),  // field name only, no values
        mismatched_count: mismatchedFields.length,
      },
    })
    return NextResponse.json({
      ok: false,
      error: 'Source-to-final completeness audit failed — cannot render.',
      gate: 'completeness_audit',
      unconfirmed_critical: unconfirmedCritical,
      missing_critical: missingCritical,
      mismatched_fields: mismatchedFields,
    }, { status: 422 })
  }

  // Gate 3.5: OCR/Vision result exists + evidence coverage for critical fields
  // Checks that an ocr_completed audit event exists for this session (Phase 1+).
  // Pre-Phase-1 sessions (no evidence columns) pass with a warning.
  const { data: ocrAuditRows } = await supabase
    .from('audit_logs')
    .select('id')
    .eq('session_id', session_id)
    .eq('event_type', 'ocr_completed')
    .limit(1)

  const ocrResultExists = (ocrAuditRows?.length ?? 0) > 0

  // Evidence coverage: fields with evidenceRequired='required' and no evidence_type
  // are pre-Phase-1 rows. We warn but do not hard-block (grandfathering).
  const EVIDENCE_REQUIRED_FIELDS = getEvidenceRequiredFieldsForDocumentType(sessionData.doc_type)
  const { data: evidenceRows } = await supabase
    .from('extracted_fields')
    .select('field, evidence_type')
    .eq('session_id', session_id)
    .in('field', EVIDENCE_REQUIRED_FIELDS)

  type EvidenceRow = { field: string; evidence_type: string | null }
  const criticalWithoutEvidence = (evidenceRows ?? [])
    .filter((r: EvidenceRow) => r.evidence_type === null)
    .map((r: EvidenceRow) => r.field)

  const evidenceWarnings: string[] = []
  if (!ocrResultExists) {
    evidenceWarnings.push('No OCR run found for this session — fields may be manually entered.')
  }
  if (criticalWithoutEvidence.length > 0) {
    evidenceWarnings.push(
      `${criticalWithoutEvidence.length} critical field(s) have no evidence record (pre-Phase-1 extraction): ${criticalWithoutEvidence.join(', ')}`
    )
  }
  // Hard-block only if OCR exists but critical fields have NO evidence at all
  // (meaning Phase-1 OCR ran but failed to label fields — indicates a code bug).
  if (ocrResultExists && criticalWithoutEvidence.length === EVIDENCE_REQUIRED_FIELDS.length) {
    return NextResponse.json({
      ok: false,
      error: 'Evidence audit failed: OCR completed but no critical fields have evidence records.',
      gate: 'evidence_audit',
      critical_without_evidence: criticalWithoutEvidence,
    }, { status: 422 })
  }

  // Gate 4: QA validators (merge in any evidence warnings from Gate 3.5)
  const finalText = buildFinalDocument(state)
  const qa = runQaValidators(state, finalText)
  // Carry evidence warnings forward into QA result for PDF audit trail
  if (evidenceWarnings.length > 0) {
    qa.warnings = [...(qa.warnings ?? []), ...evidenceWarnings]
  }

  if (qa.status === 'FAIL') {
    return NextResponse.json({
      ok: false,
      error: 'QA validation failed — cannot render final document',
      qa_failures: qa.failures,
      qa_required_actions: qa.required_actions,
      gate: 'qa',
    }, { status: 422 })
  }

  // All gates passed — generate real PDF
  try {
    const pdfBuffer = await generateTranslationPDF({
      scopeTitle: state.scope_title,
      documentType: state.document_type ?? 'other',
      fields: state.extracted_fields,
      sourceTraces: state.source_traces,
      certificationRecord: state.certification_record,
      sessionId: session_id,
      qaWarnings: qa.warnings,
    } as Parameters<typeof generateTranslationPDF>[0])

    // Mark session as rendered
    await supabase.from('translation_sessions').update({
      status: 'rendered',
      updated_at: new Date().toISOString(),
    }).eq('session_id', session_id)

    // Persist final_renders row
    const storageKey = `renders/${session_id}/${Date.now()}.pdf`
    await supabase.from('final_renders').insert({
      session_id,
      storage_key: storageKey,
      content_type: 'application/pdf',
      file_size_bytes: pdfBuffer.length,
      qa_passed: true,
      qa_report: { status: qa.status, warnings: qa.warnings ?? [], failures: qa.failures ?? [] },
    })

    // 7-field certification binding (CERTIFICATION_REPRODUCIBILITY_CONTRACT)
    // same canonical + same overrides + same renderer_version → same PDF output
    const certificationMetadata = {
      canonical_document_id: canonical_document_id ?? null,
      base_canonical_hash: canonicalFieldsHash,
      resolved_canonical_hash: resolvedCanonicalHash,
      override_set_hash: overrideSetHash,
      override_version: overrideVersion,
      canonical_schema_version: CANONICAL_SCHEMA_VERSION,
      renderer_version: RENDERER_VERSION,
    }

    // Audit log — PII-free: field keys/counts only, no values
    await supabase.from('audit_logs').insert({
      session_id,
      event_type: 'final_rendered',
      metadata: {
        file_size_bytes: pdfBuffer.length,
        qa_status: qa.status,
        storage_key: storageKey,
        continuity_mode: continuityMode,
        ...certificationMetadata,
      },
    })

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="translation-${session_id.slice(0,8)}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      },
    })
  } catch (err) {
    console.error('[translation/render] PDF generation failed:', err)
    // Audit failure
    await supabase.from('audit_logs').insert({
      session_id,
      event_type: 'error',
      metadata: { step: 'render', error: String(err) },
    })
    return NextResponse.json({ ok: false, error: 'PDF generation failed', details: String(err) }, { status: 500 })
  }
}
