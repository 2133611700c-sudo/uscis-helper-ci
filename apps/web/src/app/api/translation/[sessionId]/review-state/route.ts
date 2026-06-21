/**
 * GET /api/translation/[sessionId]/review-state
 *
 * Returns full review state for the Evidence Review UI:
 *   - session metadata (status, doc_type, scope_title)
 *   - extracted_fields with confirmation status
 *   - uploaded document storage URL (signed, 1hr)
 *   - certification_record (if exists)
 *   - payment_confirmed
 *   - review_progress: { total, confirmed, critical_total, critical_confirmed }
 *   - gates: { can_certify, can_render, missing_confirmations }
 *
 * Hard rule: no raw DB row returned. All PII fields are present by design
 * (this is the translator's own work product).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
// CANONICAL_OVERRIDE_LOOP (P1): resolve the canonical_document_id for this session so
// the review UI can thread it into correct-field/confirm-field (dual-write). Only
// resolved when the flag is on; absent/null → UI sends nothing → legacy-only (fail-safe).
import { getOverrideLoopMode } from '@/lib/canonical/overrideLoopMode'
import { getCanonicalDocumentId } from '@/lib/canonical/persistence'

export const dynamic = 'force-dynamic'

const CRITICAL_FIELDS = [
  'surname', 'given_names', 'date_of_birth', 'place_of_birth',
  'series', 'number', 'issued_by', 'date_of_issue',
]

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: 'sessionId required' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()

  // Load session
  const { data: session, error: sessErr } = await supabase
    .from('translation_sessions')
    .select('session_id, status, doc_type, scope_title, payment_confirmed, uploaded_pages, created_at, updated_at')
    .eq('session_id', sessionId)
    .single()

  if (sessErr || !session) {
    return NextResponse.json({ ok: false, error: 'Session not found' }, { status: 404 })
  }

  // Load extracted fields (evidence_type + bbox_status added in Phase 1 migration)
  const { data: fieldRows } = await supabase
    .from('extracted_fields')
    .select('id, field, source_label, source_zone, raw_value, normalized_value, language_layer, confidence, review_required, confirmed, confirmed_at, evidence_type, bbox_status, created_at')
    .eq('session_id', sessionId)
    .order('created_at')

  const fields = fieldRows ?? []

  // Load most-recent uploaded document for image preview
  const { data: docRows } = await supabase
    .from('translation_documents')
    .select('id, storage_key, original_name, mime_type, file_size_bytes')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(1)

  let documentImageUrl: string | null = null
  if (docRows && docRows.length > 0) {
    const { data: signed } = await supabase.storage
      .from('translation-documents')
      .createSignedUrl(docRows[0].storage_key, 3600)
    documentImageUrl = signed?.signedUrl ?? null
  }

  // Load certification record
  const { data: certData } = await supabase
    .from('certification_records')
    .select('signer_full_name, signer_address, signer_phone, signer_email, source_language, signature_typed_name, certification_version, signed_at')
    .eq('session_id', sessionId)
    .single()

  // Compute review progress
  const totalFields = fields.length
  const confirmedFields = fields.filter(f => f.confirmed).length
  const criticalRows = fields.filter(f => CRITICAL_FIELDS.includes(f.field))
  const criticalTotal = criticalRows.length
  const criticalConfirmed = criticalRows.filter(f => f.confirmed).length

  const unconfirmedCritical = CRITICAL_FIELDS.filter(cf => {
    const row = fields.find(f => f.field === cf)
    return row && !row.confirmed
  })

  const missingCritical = CRITICAL_FIELDS.filter(cf => !fields.find(f => f.field === cf))

  const canCertify =
    criticalTotal > 0 &&
    criticalConfirmed === criticalTotal &&
    unconfirmedCritical.length === 0

  const canRender =
    canCertify &&
    Boolean(certData) &&
    Boolean(session.payment_confirmed)

  // CANONICAL_OVERRIDE_LOOP (P1): best-effort resolve the canonical document id so
  // the UI can dual-write corrections into the canonical chain. Flag OFF → null
  // (UI sends nothing → legacy-only). A lookup failure is swallowed → null (fail-safe).
  let canonicalDocumentId: string | null = null
  if (getOverrideLoopMode() !== 'off' && session.doc_type) {
    try {
      canonicalDocumentId = await getCanonicalDocumentId(sessionId, session.doc_type as string)
    } catch {
      canonicalDocumentId = null
    }
  }

  return NextResponse.json({
    ok: true,
    canonical_document_id: canonicalDocumentId,
    session: {
      session_id: session.session_id,
      status: session.status,
      doc_type: session.doc_type,
      scope_title: session.scope_title,
      payment_confirmed: session.payment_confirmed,
      uploaded_pages: session.uploaded_pages,
      created_at: session.created_at,
      updated_at: session.updated_at,
    },
    fields: fields.map(f => ({
      id: f.id,
      field: f.field,
      source_label: f.source_label,
      source_zone: f.source_zone,
      raw_value: f.raw_value,
      normalized_value: f.normalized_value,
      language_layer: f.language_layer,
      confidence: f.confidence,
      review_required: f.review_required,
      confirmed: f.confirmed,
      confirmed_at: f.confirmed_at,
      // Phase 1 evidence provenance — may be null for pre-Phase-1 rows
      evidence_type: (f as Record<string, unknown>).evidence_type ?? null,
      bbox_status: (f as Record<string, unknown>).bbox_status ?? null,
      is_critical: CRITICAL_FIELDS.includes(f.field),
    })),
    document_image_url: documentImageUrl,
    certification_record: certData ?? null,
    review_progress: {
      total: totalFields,
      confirmed: confirmedFields,
      critical_total: criticalTotal,
      critical_confirmed: criticalConfirmed,
      percent: totalFields > 0 ? Math.round((confirmedFields / totalFields) * 100) : 0,
    },
    gates: {
      can_certify: canCertify,
      can_render: canRender,
      unconfirmed_critical: unconfirmedCritical,
      missing_critical: missingCritical,
    },
  })
}
