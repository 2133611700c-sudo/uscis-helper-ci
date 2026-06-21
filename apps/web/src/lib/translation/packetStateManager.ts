/**
 * Packet State Manager — Messenginfo v5.0
 * Maintains the full state of a translation session.
 * Persisted to Supabase translation_orders table.
 */
import { PacketState, DocumentType, TranslationStatus, ExtractedField, CertificationRecord } from './types'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { buildScopeTitle } from './bureauStyleRenderer'

export function createPacketState(params: {
  session_id: string
  locale?: string
}): PacketState {
  const now = new Date().toISOString()
  return {
    session_id: params.session_id,
    status: 'created',
    document_type: null,
    controlling_spelling: {},
    uploaded_pages: 0,
    total_pages_declared: 1,
    extracted_fields: [],
    source_traces: [],
    user_corrections: [],
    certification_record: null,
    payment_confirmed: false,
    payment_checkout_id: null,
    qa_result: null,
    scope_title: '',
    locale: params.locale ?? 'en',
    created_at: now,
    updated_at: now,
  }
}

export function advanceStatus(state: PacketState, newStatus: TranslationStatus): PacketState {
  return { ...state, status: newStatus, updated_at: new Date().toISOString() }
}

export function setDocumentType(state: PacketState, docType: DocumentType, totalPages: number): PacketState {
  return {
    ...state,
    document_type: docType,
    total_pages_declared: totalPages,
    scope_title: buildScopeTitle(docType, 0, totalPages),
    updated_at: new Date().toISOString(),
  }
}

export function recordUpload(state: PacketState, pagesUploaded: number): PacketState {
  const uploaded = state.uploaded_pages + pagesUploaded
  return {
    ...state,
    uploaded_pages: uploaded,
    status: 'uploaded',
    scope_title: buildScopeTitle(state.document_type ?? 'other', uploaded, state.total_pages_declared),
    updated_at: new Date().toISOString(),
  }
}

export function setExtractedFields(state: PacketState, fields: ExtractedField[]): PacketState {
  return {
    ...state,
    extracted_fields: fields,
    source_traces: fields.map(f => ({
      field: f.field,
      document_type: state.document_type ?? 'other',
      source_label: f.source_label,
      source_zone: f.source_zone,
      bbox: f.bbox,
      raw_value: f.raw_value,
      normalized_value: f.normalized_value,
      language_layer: f.language_layer,
      confidence: f.confidence,
      review_required: f.review_required,
    })),
    status: 'extracted',
    updated_at: new Date().toISOString(),
  }
}

export function applyUserCorrection(
  state: PacketState,
  field: string,
  correctedValue: string,
  correctionClass: ExtractedField['correction_class']
): PacketState {
  const fields = state.extracted_fields.map(f =>
    f.field === field
      ? { ...f, normalized_value: correctedValue, user_corrected: true, correction_class: correctionClass }
      : f
  )
  const corrections = [
    ...state.user_corrections.filter(c => c.field !== field),
    { ...fields.find(f => f.field === field)! },
  ]
  return {
    ...state,
    extracted_fields: fields,
    user_corrections: corrections,
    updated_at: new Date().toISOString(),
  }
}

export function confirmPayment(state: PacketState, checkoutId: string): PacketState {
  return {
    ...state,
    payment_confirmed: true,
    payment_checkout_id: checkoutId,
    status: 'paid',
    updated_at: new Date().toISOString(),
  }
}

export function setCertificationRecord(state: PacketState, record: CertificationRecord): PacketState {
  return {
    ...state,
    certification_record: record,
    status: 'certified',
    updated_at: new Date().toISOString(),
  }
}

// Supabase persistence — writes to translation_sessions (v5 schema)
export async function persistPacketState(state: PacketState): Promise<void> {
  try {
    const supabase = createAdminSupabaseClient()
    await supabase.from('translation_sessions').upsert({
      session_id:       state.session_id,
      status:           state.status,
      doc_type:         state.document_type,
      uploaded_pages:   state.uploaded_pages,
      total_pages:      state.total_pages_declared,
      payment_confirmed: state.payment_confirmed,
      scope_title:      state.scope_title,
      locale:           state.locale,
      updated_at:       state.updated_at,
    }, { onConflict: 'session_id' })
  } catch (err) {
    console.error('[PacketStateManager] persist failed:', err)
  }
}

// Write a single audit log entry
export async function writeAuditLog(params: {
  session_id: string
  event_type: string
  actor?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    const supabase = createAdminSupabaseClient()
    await supabase.from('audit_logs').insert({
      session_id:  params.session_id,
      event_type:  params.event_type,
      actor:       params.actor ?? 'system',
      metadata:    params.metadata ?? {},
    })
  } catch (err) {
    console.error('[PacketStateManager] audit log failed:', err)
  }
}

// Persist extracted fields to normalized extracted_fields table
export async function persistExtractedFields(
  sessionId: string,
  fields: ExtractedField[]
): Promise<void> {
  try {
    const supabase = createAdminSupabaseClient()
    // Upsert by (session_id, field) — replace existing on re-extraction
    const rows = fields.map(f => ({
      session_id:       sessionId,
      field:            f.field,
      source_label:     f.source_label,
      source_zone:      f.source_zone,
      raw_value:        f.raw_value,
      normalized_value: f.normalized_value,
      language_layer:   f.language_layer,
      confidence:       f.confidence,
      review_required:  f.review_required,
      // Evidence provenance (v6 — Google Vision + DeepSeek Text)
      evidence_type:    f.evidence_type ?? null,
      bbox_status:      f.bbox_status ?? null,
      ocr_ids:          f.ocr_ids ?? null,          // jsonb array of OCR token IDs
      combined_bbox:    f.combined_bbox ?? null,    // jsonb [x0,y0,x1,y1] when multi-word
    }))
    // Delete existing rows for this session first (idempotent re-extraction)
    const { error: delErr } = await supabase.from('extracted_fields').delete().eq('session_id', sessionId)
    if (delErr) console.error('[PacketStateManager] extracted_fields delete error:', delErr)

    if (rows.length > 0) {
      const { error: insErr } = await supabase.from('extracted_fields').insert(rows)
      if (insErr) {
        console.error('[PacketStateManager] extracted_fields insert error:', JSON.stringify(insErr))
        throw insErr   // bubble to catch so it's visible in logs
      }
    }
  } catch (err) {
    console.error('[PacketStateManager] persistExtractedFields failed:', err)
  }
}

// Record a user correction with version tracking
export async function recordCorrection(params: {
  session_id: string
  field: string
  old_value: string
  new_value: string
  reason?: string
  correction_type?: string
}): Promise<void> {
  try {
    const supabase = createAdminSupabaseClient()
    // Get current version count for this field
    const { count } = await supabase
      .from('user_corrections')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', params.session_id)
      .eq('field', params.field)
    const version = (count ?? 0) + 1
    await supabase.from('user_corrections').insert({
      session_id:      params.session_id,
      field:           params.field,
      old_value:       params.old_value,
      new_value:       params.new_value,
      reason:          params.reason ?? null,
      correction_type: params.correction_type ?? 'manual',
      version,
    })
  } catch (err) {
    console.error('[PacketStateManager] recordCorrection failed:', err)
  }
}
