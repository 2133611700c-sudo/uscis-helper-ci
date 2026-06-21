/**
 * Admin Audit Artifact types — v5 §23 (operator-facing, NOT customer).
 *
 * Customer PDF is built by bureauStyleRenderer + per-module templates.
 * The artifact described here is a STRUCTURED JSON object the operator
 * gets in /admin/manual-review/[ticketId] for forensic review.
 *
 * Hard rules:
 *   - customer_visible = false on every shape we export.
 *   - Caller (admin route) MUST be behind ADMIN_SECRET / service role.
 *   - This artifact MAY contain bbox, ocr_ids, source_zone, raw_value,
 *     normalized_value, confidence, review_required, validator_status,
 *     evidence_crop_path. None of those may ever leak into the customer
 *     PDF, customer-facing API, or analytics.
 */

export interface AdminAuditField {
  /** Field key (e.g. 'series', 'date_of_birth'). */
  field_key: string
  /** Verbatim OCR raw text. */
  raw_value: string | null
  /** Post-glossary, post-normalisation value. */
  normalized_value: string | null
  /** Logical zone (personal_data, issuance_block, etc.). */
  source_zone: string | null
  /** [x0, y0, x1, y1] normalised 0..1. */
  bbox: [number, number, number, number] | null
  /** OCR token IDs that back this field. */
  ocr_ids: string[]
  /** Combined bbox when value spans multiple tokens. */
  combined_bbox: [number, number, number, number] | null
  /** OCR confidence 0..1. */
  confidence: number | null
  /** Whether this field still flagged review_required at audit time. */
  review_required: boolean
  /** Last validator decision. 'unknown' when no validators ran. */
  validator_status: 'pass' | 'fail' | 'review_required' | 'unknown'
  /** Disk path to the per-field crop image (operator-only). */
  evidence_crop_path: string | null
  /** Was this value edited by the user during Evidence Review? */
  user_corrected: boolean
  /** correctionClassifier output, when applicable. */
  correction_class: 'controlling_spelling' | 'ocr_error' | 'one_document_exception' | null
  /** Numeric-accuracy passes recorded for this field, e.g.
   *  ['visual_pass_1','visual_pass_2','digit_shape_compare']. */
  passes: string[]
}

export interface AdminAuditEvent {
  event_type: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface AdminAuditModule {
  document_type: string
  status: string
  allowAutoPdf: boolean
  critical_field_count: number
  optional_field_count: number
}

export interface AdminAuditTicket {
  ticket_id: string | null
  status: string | null
  priority: string | null
  reasons: string[]
  created_at: string | null
}

export interface AdminAuditCertification {
  signed: boolean
  signer_full_name: string | null
  signed_at: string | null
  certification_version: string | null
  version_current: boolean | null
}

export interface AdminAuditArtifact {
  artifact_id: string
  generated_at: string
  session_id: string
  /** Active document type (canonical key, e.g. 'ua_internal_passport_booklet'). */
  document_type: string
  /** Module this audit was generated against. */
  module: AdminAuditModule
  /** Render scope ("English Translation of …" or partial form). */
  scope_title: string
  /** Number of pages the user uploaded. */
  uploaded_pages: number
  /** Number of pages declared on the document. */
  total_pages_declared: number
  /** All extracted fields with full provenance. */
  fields: AdminAuditField[]
  /** Manual review events (state transitions, operator notes). */
  events: AdminAuditEvent[]
  /** Manual review ticket summary, if one is open or closed. */
  ticket: AdminAuditTicket | null
  /** Certification record summary. */
  certification: AdminAuditCertification
  /** controlling_spelling snapshot at audit time. */
  controlling_spelling: Record<string, string>
  /** Render gate verdict (last QAResult, if any). */
  qa_result: {
    status: 'PASS' | 'FAIL' | 'REVIEW_REQUIRED'
    failures: string[]
    warnings: string[]
    required_actions: string[]
  } | null
  /** Customer-visible flag. ALWAYS false. The whole shape is operator-only. */
  customer_visible: false
  /** Marker that this shape contains internal trace metadata. */
  contains_internal_trace: true
}
