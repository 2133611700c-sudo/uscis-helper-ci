/**
 * Manual Review Queue v1 — state model + types (Path B additive hardening)
 *
 * Backed by the existing `public.manual_review_queue` table extended via
 * migration 20260509210000_manual_review_queue_v1_hardening.sql.
 *
 * The v0 surface (pending/in_review/completed/cancelled, 4 reason codes) is
 * preserved. v1 adds richer state and reason taxonomy without breaking v0.
 *
 * NOTHING in this file may carry raw PII. Names, DOB, document numbers,
 * addresses, OCR text, and correction values must never live in ticket
 * metadata or audit event metadata.
 */

// ── Status (extended from v0) ────────────────────────────────────────────────

/**
 * v1 status values. v0 statuses are kept as aliases for backward compatibility.
 *
 * Compatibility map:
 *   'pending'   ↔ 'queued'
 *   'cancelled' ↔ 'rejected'
 *   'in_review' = 'in_review'
 *   'completed' = 'completed'
 *
 * Use isStatusEquivalent() to compare statuses across v0/v1 rows.
 */
export type ManualReviewStatus =
  | 'not_required'              // synthetic — used by router output, never persisted
  | 'queued'                    // v1 (v0 alias: 'pending')
  | 'pending'                   // v0 alias for 'queued'
  | 'assigned'                  // v1
  | 'in_review'                 // both
  | 'needs_user_clarification'  // v1
  | 'operator_completed'        // v1
  | 'approved_for_render'       // v1
  | 'completed'                 // both — final
  | 'rejected'                  // v1 (v0 alias: 'cancelled')
  | 'cancelled'                 // v0 alias for 'rejected'

export const MANUAL_REVIEW_STATUSES: readonly ManualReviewStatus[] = [
  'not_required',
  'queued',
  'pending',
  'assigned',
  'in_review',
  'needs_user_clarification',
  'operator_completed',
  'approved_for_render',
  'completed',
  'rejected',
  'cancelled',
] as const

/**
 * Returns the canonical v1 status for an input that may be a v0 alias.
 * Used when comparing rows from mixed-vintage data.
 */
export function canonicalStatus(s: ManualReviewStatus): ManualReviewStatus {
  if (s === 'pending') return 'queued'
  if (s === 'cancelled') return 'rejected'
  return s
}

/**
 * True if two statuses represent the same lifecycle state.
 * Tolerates v0/v1 aliases on either side.
 */
export function isStatusEquivalent(
  a: ManualReviewStatus,
  b: ManualReviewStatus,
): boolean {
  return canonicalStatus(a) === canonicalStatus(b)
}

/**
 * Allowed status transitions. Used by API routes to reject invalid moves.
 * Aliases (pending/queued, cancelled/rejected) are normalized via canonicalStatus.
 *
 * Final states: completed, rejected/cancelled — no outgoing transitions.
 * not_required is synthetic (router-only) and never appears as a row state.
 */
export const STATUS_TRANSITIONS: Readonly<Record<ManualReviewStatus, readonly ManualReviewStatus[]>> = {
  not_required: [],
  queued: ['assigned', 'in_review', 'cancelled', 'rejected'],
  pending: ['assigned', 'in_review', 'cancelled', 'rejected'],
  assigned: ['in_review', 'cancelled', 'rejected'],
  in_review: ['needs_user_clarification', 'operator_completed', 'cancelled', 'rejected'],
  needs_user_clarification: ['in_review', 'cancelled', 'rejected'],
  operator_completed: ['approved_for_render', 'rejected'],
  approved_for_render: ['completed'],
  completed: [],
  rejected: [],
  cancelled: [],
} as const

export function canTransition(
  from: ManualReviewStatus,
  to: ManualReviewStatus,
): boolean {
  const allowed = STATUS_TRANSITIONS[canonicalStatus(from)] ?? []
  // also allow exact alias match (e.g. queued→queued no-op stays disallowed)
  return allowed.some(t => isStatusEquivalent(t, to))
}

// ── Reason codes ─────────────────────────────────────────────────────────────

/**
 * Why this document was routed to manual review.
 *
 * v0 reason codes ('low_confidence', 'user_requested', 'translate_error',
 * 'ocr_unreadable') are preserved as aliases in REASON_ALIASES below — the
 * router and ticket service translate them to v1 codes.
 */
export type ManualReviewReason =
  // v0-compatible (via aliases)
  | 'unknown_document_type'
  | 'unsupported_document_type'
  | 'low_classification_confidence'
  | 'image_quality_failed'
  | 'missing_critical_fields'
  | 'low_ocr_confidence'
  | 'missing_source_evidence'
  | 'unclear_handwriting'
  | 'unclear_seal_or_stamp'
  | 'complex_table_document'
  | 'long_legal_text'
  | 'legal_or_court_document'
  | 'military_document'
  | 'diploma_or_transcript'
  | 'identity_conflict'
  | 'glossary_unresolved'
  | 'user_requested_human_help'
  | 'system_error'
  // a request that FAILED after the customer already paid (L1 A-full triage; PII-free)
  | 'paid_request_failed'
  // Operator-flow product model (2026-06-11): every PAID order is reviewed by
  // the operator before the customer receives the finished PDF.
  | 'operator_review_paid'

export const MANUAL_REVIEW_REASONS: readonly ManualReviewReason[] = [
  'unknown_document_type',
  'unsupported_document_type',
  'low_classification_confidence',
  'image_quality_failed',
  'missing_critical_fields',
  'low_ocr_confidence',
  'missing_source_evidence',
  'unclear_handwriting',
  'unclear_seal_or_stamp',
  'complex_table_document',
  'long_legal_text',
  'legal_or_court_document',
  'military_document',
  'diploma_or_transcript',
  'identity_conflict',
  'glossary_unresolved',
  'user_requested_human_help',
  'system_error',
  'paid_request_failed',
  'operator_review_paid',
] as const

/**
 * Map v0 reason strings to v1 codes. Used at API boundaries to translate
 * legacy callers without changing their interface.
 */
export const REASON_ALIASES: Readonly<Record<string, ManualReviewReason>> = {
  // v0 wire codes (existing /api/translation/manual-review route)
  low_confidence: 'low_ocr_confidence',
  user_requested: 'user_requested_human_help',
  translate_error: 'system_error',
  ocr_unreadable: 'image_quality_failed',
} as const

export function normalizeReason(raw: string): ManualReviewReason | null {
  if ((MANUAL_REVIEW_REASONS as readonly string[]).includes(raw)) {
    return raw as ManualReviewReason
  }
  return REASON_ALIASES[raw] ?? null
}

// ── Priority ─────────────────────────────────────────────────────────────────

export type ManualReviewPriority = 'low' | 'normal' | 'high'

export const MANUAL_REVIEW_PRIORITIES: readonly ManualReviewPriority[] = [
  'low',
  'normal',
  'high',
] as const

// ── Ticket shape (DB row + v1 fields) ────────────────────────────────────────

/**
 * Public ticket shape returned to internal callers. Mirrors the v1 columns of
 * `manual_review_queue`. Note: contact_*, source_fields, translated_fields are
 * deliberately omitted from this type — they live in the DB row but operator
 * detail views must fetch them via authenticated admin paths only.
 */
export interface ManualReviewTicket {
  ticket_id: string
  session_id: string | null
  document_id: string | null
  document_type_detected: string | null
  module_type: string | null
  status: ManualReviewStatus
  reasons: ManualReviewReason[]
  priority: ManualReviewPriority
  assigned_to_operator_id: string | null
  created_at: string
  updated_at: string
  due_at: string | null
  safe_summary: string | null
  /**
   * PII-redacted preview (e.g. document type label only). Must not contain
   * names, DOB, document numbers, addresses, OCR text. Optional.
   */
  pii_redacted_preview?: string | null
  admin_notes?: string | null
  /**
   * Status string surfaced to the user via the public status route.
   * Distinct from ticket.status — drives copy in the user UI.
   */
  user_message_status?: 'in_progress' | 'awaiting_you' | 'ready' | 'closed' | null
}

// ── Audit event shape ────────────────────────────────────────────────────────

export type ManualReviewEventType =
  | 'manual_review_queued'
  | 'manual_review_assigned'
  | 'manual_review_started'
  | 'manual_review_user_clarification_requested'
  | 'manual_review_completed'
  | 'manual_review_approved_for_render'
  | 'manual_review_rejected'
  | 'manual_review_cancelled'
  | 'operator_completed'

export const MANUAL_REVIEW_EVENT_TYPES: readonly ManualReviewEventType[] = [
  'manual_review_queued',
  'manual_review_assigned',
  'manual_review_started',
  'manual_review_user_clarification_requested',
  'manual_review_completed',
  'manual_review_approved_for_render',
  'manual_review_rejected',
  'manual_review_cancelled',
  'operator_completed',
] as const

// ── Type guards / validators ─────────────────────────────────────────────────

export function isManualReviewStatus(x: unknown): x is ManualReviewStatus {
  return typeof x === 'string' && (MANUAL_REVIEW_STATUSES as readonly string[]).includes(x)
}

export function isManualReviewReason(x: unknown): x is ManualReviewReason {
  return typeof x === 'string' && (MANUAL_REVIEW_REASONS as readonly string[]).includes(x)
}

export function isManualReviewPriority(x: unknown): x is ManualReviewPriority {
  return typeof x === 'string' && (MANUAL_REVIEW_PRIORITIES as readonly string[]).includes(x)
}

export function isManualReviewEventType(x: unknown): x is ManualReviewEventType {
  return typeof x === 'string' && (MANUAL_REVIEW_EVENT_TYPES as readonly string[]).includes(x)
}
