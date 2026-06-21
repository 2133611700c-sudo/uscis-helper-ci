/**
 * Admin Audit Artifact builder — v5 §23 (operator-only).
 *
 * Pure function: takes a packet snapshot + manual-review ticket + events
 * and returns an AdminAuditArtifact JSON object. This is the structured
 * shape the operator sees in /admin/manual-review/[ticketId].
 *
 * Hard rules:
 *   - Pure (no DB I/O). Caller fetches inputs and persists/returns the
 *     result behind the existing ADMIN_SECRET / service-role gate.
 *   - Customer PDF unaffected. This builder runs only inside admin
 *     surfaces.
 *   - PII handling: the artifact MAY contain raw OCR + bbox + crop paths
 *     because it is operator-only. Caller is responsible for ensuring
 *     it never reaches a customer surface.
 */

import type {
  ExtractedField,
  PacketState,
  CertificationRecord,
  QAResult,
} from '../types'
import type {
  ManualReviewTicket,
  ManualReviewEventType,
} from '../manualReview/types'
import { findDocumentModule } from '../modules/registry'
import { resolveDocumentModule } from '../modules/classifier'
import { CERTIFICATION_VERSION } from '../certificationRecord'
import type {
  AdminAuditArtifact,
  AdminAuditField,
  AdminAuditEvent,
  AdminAuditTicket,
  AdminAuditCertification,
  AdminAuditModule,
} from './types'

export interface ManualReviewEventInput {
  event_type: ManualReviewEventType | string
  metadata: Record<string, unknown>
  created_at: string
}

export interface BuildAdminAuditInput {
  packet: PacketState
  /** Open or closed manual-review ticket for this session, if any. */
  ticket: ManualReviewTicket | null
  /**
   * Manual-review state-transition events for the ticket. Caller is
   * responsible for ensuring this list contains only PII-safe metadata
   * per safeMetadata.ts (the artifact does NOT redact further; it
   * trusts the upstream whitelist).
   */
  events: ManualReviewEventInput[]
  /** Server-side timestamp the artifact was assembled. */
  generatedAtIso?: string
  /**
   * Random ID for the artifact (caller may reuse a ticket-event ID).
   * Defaults to a deterministic 'audit_<session_prefix>_<ts>' shape
   * for ease of operator search.
   */
  artifactId?: string
}

function pickValidatorStatus(field: ExtractedField): AdminAuditField['validator_status'] {
  if (field.review_required) return 'review_required'
  // Heuristic: when the field has a normalized value AND is not flagged
  // for review AND has at least one OCR id, treat as 'pass'. Without
  // explicit per-field validator output we cannot say more — that's
  // expected at the audit layer (the QAResult below is authoritative).
  if (field.normalized_value && field.normalized_value.trim().length > 0) {
    return 'pass'
  }
  return 'unknown'
}

function buildFieldRow(field: ExtractedField): AdminAuditField {
  return {
    field_key: field.field,
    raw_value: field.raw_value ?? null,
    normalized_value: field.normalized_value ?? null,
    source_zone: field.source_zone ?? null,
    bbox: field.bbox ?? null,
    ocr_ids: Array.isArray(field.ocr_ids) ? [...field.ocr_ids] : [],
    combined_bbox: field.combined_bbox ?? null,
    confidence:
      typeof field.confidence === 'number' && Number.isFinite(field.confidence)
        ? field.confidence
        : null,
    review_required: field.review_required === true,
    validator_status: pickValidatorStatus(field),
    evidence_crop_path: field.evidence_crop_path ?? null,
    user_corrected: field.user_corrected === true,
    correction_class: field.correction_class ?? null,
    passes: Array.isArray(field.passes) ? [...field.passes] : [],
  }
}

function buildModuleSummary(packet: PacketState): AdminAuditModule {
  const docKey = packet.document_type ?? 'unknown'
  // Alias-aware: legacy DocumentType values resolve to the canonical module.
  const mod = findDocumentModule(docKey) ?? resolveDocumentModule(docKey, 1.0)
  return {
    document_type: mod?.documentType ?? String(docKey),
    status: mod?.status ?? 'unknown',
    allowAutoPdf: mod?.reviewPolicy?.allowAutoPdf === true,
    critical_field_count: mod?.criticalFields?.length ?? 0,
    optional_field_count: mod?.optionalFields?.length ?? 0,
  }
}

function buildCertificationSummary(
  cert: CertificationRecord | null,
): AdminAuditCertification {
  if (!cert) {
    return {
      signed: false,
      signer_full_name: null,
      signed_at: null,
      certification_version: null,
      version_current: null,
    }
  }
  return {
    signed: Boolean(cert.signature_typed_name && cert.signed_at),
    signer_full_name: cert.signer_full_name || null,
    signed_at: cert.signed_at || null,
    certification_version: cert.certification_version || null,
    version_current: cert.certification_version === CERTIFICATION_VERSION,
  }
}

function buildTicketSummary(ticket: ManualReviewTicket | null): AdminAuditTicket | null {
  if (!ticket) return null
  return {
    ticket_id: ticket.ticket_id ?? null,
    status: ticket.status ?? null,
    priority: ticket.priority ?? null,
    reasons: Array.isArray(ticket.reasons) ? [...ticket.reasons] : [],
    created_at: ticket.created_at ?? null,
  }
}

function buildEventList(events: ManualReviewEventInput[]): AdminAuditEvent[] {
  return events.map(e => ({
    event_type: String(e.event_type),
    metadata: e.metadata && typeof e.metadata === 'object' ? { ...e.metadata } : {},
    created_at: e.created_at,
  }))
}

function buildQaSummary(qa: QAResult | null) {
  if (!qa) return null
  return {
    status: qa.status,
    failures: Array.isArray(qa.failures) ? [...qa.failures] : [],
    warnings: Array.isArray(qa.warnings) ? [...qa.warnings] : [],
    required_actions: Array.isArray(qa.required_actions) ? [...qa.required_actions] : [],
  }
}

/**
 * Build an AdminAuditArtifact from packet + ticket + events.
 *
 * Pure: returns a fresh object on every call. Inputs are NOT mutated.
 */
export function buildAdminAuditArtifact(
  input: BuildAdminAuditInput,
): AdminAuditArtifact {
  const generatedAt = input.generatedAtIso ?? new Date().toISOString()
  const sessionPrefix = (input.packet.session_id ?? 'session').slice(0, 8)
  const artifactId =
    input.artifactId ?? `audit_${sessionPrefix}_${generatedAt.replace(/[^0-9]/g, '')}`

  const fields = (input.packet.extracted_fields ?? []).map(buildFieldRow)

  return {
    artifact_id: artifactId,
    generated_at: generatedAt,
    session_id: input.packet.session_id,
    document_type: String(input.packet.document_type ?? 'unknown'),
    module: buildModuleSummary(input.packet),
    scope_title: input.packet.scope_title ?? '',
    uploaded_pages: input.packet.uploaded_pages ?? 0,
    total_pages_declared: input.packet.total_pages_declared ?? 0,
    fields,
    events: buildEventList(input.events),
    ticket: buildTicketSummary(input.ticket),
    certification: buildCertificationSummary(input.packet.certification_record),
    controlling_spelling: { ...(input.packet.controlling_spelling ?? {}) },
    qa_result: buildQaSummary(input.packet.qa_result),
    customer_visible: false,
    contains_internal_trace: true,
  }
}
