/**
 * createManualReviewTicket — server-side service for queueing a manual review.
 *
 * Wraps the existing public.manual_review_queue table (Path B additive
 * hardening). On success:
 *   1. Inserts/upserts a row in manual_review_queue with v1 fields populated.
 *   2. Writes a manual_review_events row (manual_review_queued) with PII-safe
 *      metadata only.
 *   3. Returns the ticket id.
 *
 * Idempotency: when a ticket already exists for the same (session_id,
 * document_id, status='queued'|'pending'|'in_review'|'assigned'|'needs_user_clarification'),
 * the existing ticket is updated with new reasons (union) instead of
 * creating a duplicate. This protects against double-fire from retries.
 *
 * PII safety:
 *   - safeSummary is sanitized via buildSafeSummary
 *   - audit metadata is sanitized via sanitizeEventMetadata
 *   - raw OCR text, names, DOB, addresses, document numbers, correction
 *     values must NEVER reach this function from callers. Caller is
 *     responsible for not passing raw PII; this function applies a safety
 *     net but does not guarantee scrubbing of arbitrary nested input.
 */

import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type {
  ManualReviewReason,
  ManualReviewPriority,
  ManualReviewStatus,
} from './types'
import { buildSafeSummary, sanitizeEventMetadata } from './safeMetadata'

// ── Public types ─────────────────────────────────────────────────────────────

export interface CreateTicketInput {
  /** Translation session UUID (nullable for legacy/anonymous flows) */
  sessionId?: string | null
  /** Document UUID within the session */
  documentId?: string | null
  /** Reason codes from router. At least one required. */
  reasons: readonly ManualReviewReason[]
  /** Raw classifier output (e.g. 'ua_internal_passport_booklet') */
  detectedDocumentType?: string | null
  /** Module type from registry (canonical) */
  moduleType?: string | null
  /** Triage priority (router default: normal) */
  priority?: ManualReviewPriority
  /** Optional safe summary hint — will be redacted before storage */
  safeSummary?: string | null
  /** Optional ISO timestamp */
  dueAt?: string | null
  /**
   * Backward-compat support for v0 callers (e.g. existing
   * /api/translation/manual-review POST). When set, also stores the
   * v0 columns. New callers should leave undefined.
   */
  v0Compat?: {
    docType: string
    sourceLang: string
    contactName?: string | null
    contactEmail?: string | null
    contactPhone?: string | null
    sourceFields?: Record<string, string | null> | null
  }
}

export interface CreateTicketResult {
  ticketId: string
  /** True if an existing open ticket was reused (idempotent path) */
  reused: boolean
  /** Final status of the ticket after this call */
  status: ManualReviewStatus
}

// ── Internal helpers ─────────────────────────────────────────────────────────

const OPEN_STATUSES: readonly ManualReviewStatus[] = [
  'queued',
  'pending',
  'assigned',
  'in_review',
  'needs_user_clarification',
]

interface OpenTicketRow {
  id: string
  status: string
  reasons: ManualReviewReason[] | null
  priority: ManualReviewPriority | null
}

async function findOpenTicket(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  sessionId: string | null,
  documentId: string | null,
): Promise<OpenTicketRow | null> {
  if (!sessionId && !documentId) return null

  let query = supabase
    .from('manual_review_queue')
    .select('id,status,reasons,priority')
    .in('status', OPEN_STATUSES as readonly string[])
    .order('created_at', { ascending: false })
    .limit(1)

  if (sessionId) query = query.eq('session_id', sessionId)
  if (documentId) query = query.eq('document_id', documentId)

  const { data, error } = await query
  if (error) {
    throw new Error(`findOpenTicket failed: ${error.message}`)
  }
  if (!data || data.length === 0) return null
  const row = data[0] as OpenTicketRow
  return row
}

function unionReasons(
  existing: readonly ManualReviewReason[] | null | undefined,
  incoming: readonly ManualReviewReason[],
): ManualReviewReason[] {
  const set = new Set<ManualReviewReason>(existing ?? [])
  for (const r of incoming) set.add(r)
  return Array.from(set)
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function createManualReviewTicket(
  input: CreateTicketInput,
): Promise<CreateTicketResult> {
  if (!Array.isArray(input.reasons) || input.reasons.length === 0) {
    throw new Error('createManualReviewTicket: reasons[] is required and must be non-empty')
  }

  const sessionId = input.sessionId ?? null
  const documentId = input.documentId ?? null
  const detectedDocumentType = input.detectedDocumentType ?? null
  const moduleType = input.moduleType ?? null
  const priority = input.priority ?? 'normal'
  const dueAt = input.dueAt ?? null

  const safe_summary = buildSafeSummary({
    documentType: moduleType ?? detectedDocumentType,
    reasons: input.reasons,
    hint: input.safeSummary ?? null,
  })

  const supabase = createAdminSupabaseClient()

  // ── Idempotency check ───────────────────────────────────────────────────
  const existing = await findOpenTicket(supabase, sessionId, documentId)
  if (existing) {
    const mergedReasons = unionReasons(existing.reasons, input.reasons)
    const finalPriority = bumpPriority(existing.priority ?? 'normal', priority)

    const { error } = await supabase
      .from('manual_review_queue')
      .update({
        reasons: mergedReasons,
        priority: finalPriority,
        module_type: moduleType,
        detected_document_type: detectedDocumentType,
        safe_summary,
      })
      .eq('id', existing.id)

    if (error) {
      throw new Error(`createManualReviewTicket update failed: ${error.message}`)
    }

    await writeEvent(supabase, {
      ticket_id: existing.id,
      session_id: sessionId,
      event_type: 'manual_review_queued',
      metadata: {
        reasons: mergedReasons,
        priority: finalPriority,
        module_type: moduleType ?? null,
        status: existing.status,
        count: mergedReasons.length,
        route: 'createManualReviewTicket.idempotent_update',
      },
    })

    return {
      ticketId: existing.id,
      reused: true,
      status: (existing.status as ManualReviewStatus) ?? 'queued',
    }
  }

  // ── Insert new ──────────────────────────────────────────────────────────
  // We start with v1 status 'queued'. v0 readers see 'queued' as a valid
  // status (the migration relaxed the CHECK constraint). v0 admin UI groups
  // by exact match — until the admin UI is updated to recognize 'queued',
  // we also write 'pending' for backward compatibility on the v0 path. To
  // keep one source of truth, use v1 'queued' for new rows and rely on
  // canonicalStatus() on read.

  const initialStatus: ManualReviewStatus = 'queued'

  const insertRow: Record<string, unknown> = {
    status: initialStatus,
    reasons: [...input.reasons],
    priority,
    module_type: moduleType,
    detected_document_type: detectedDocumentType,
    safe_summary,
    session_id: sessionId,
    document_id: documentId,
    due_at: dueAt,
  }

  // v0 columns — the table requires doc_type NOT NULL.
  // If the caller didn't pass v0Compat we synthesize a safe doc_type
  // value derived from the canonical module type.
  if (input.v0Compat) {
    insertRow.doc_type = input.v0Compat.docType
    insertRow.source_lang = input.v0Compat.sourceLang
    insertRow.contact_name = input.v0Compat.contactName ?? null
    insertRow.contact_email = input.v0Compat.contactEmail ?? null
    insertRow.contact_phone = input.v0Compat.contactPhone ?? null
    insertRow.source_fields = input.v0Compat.sourceFields ?? {}
  } else {
    insertRow.doc_type = moduleType ?? detectedDocumentType ?? 'unknown'
    insertRow.source_lang = 'uk' // safe default; the operator detail view shows actual
    insertRow.source_fields = {}
  }

  const { data, error } = await supabase
    .from('manual_review_queue')
    .insert(insertRow)
    .select('id')
    .single()

  if (error) {
    throw new Error(`createManualReviewTicket insert failed: ${error.message}`)
  }

  const ticketId = (data as { id: string }).id

  await writeEvent(supabase, {
    ticket_id: ticketId,
    session_id: sessionId,
    event_type: 'manual_review_queued',
    metadata: {
      reasons: [...input.reasons],
      priority,
      module_type: moduleType ?? null,
      status: initialStatus,
      count: input.reasons.length,
      route: 'createManualReviewTicket.insert',
    },
  })

  return {
    ticketId,
    reused: false,
    status: initialStatus,
  }
}

function bumpPriority(
  existing: ManualReviewPriority,
  incoming: ManualReviewPriority,
): ManualReviewPriority {
  const rank: Record<ManualReviewPriority, number> = { low: 0, normal: 1, high: 2 }
  return rank[incoming] > rank[existing] ? incoming : existing
}

// ── Audit-event writer ──────────────────────────────────────────────────────

interface EventInput {
  ticket_id: string
  session_id: string | null
  event_type:
    | 'manual_review_queued'
    | 'manual_review_assigned'
    | 'manual_review_started'
    | 'manual_review_user_clarification_requested'
    | 'manual_review_completed'
    | 'manual_review_approved_for_render'
    | 'manual_review_rejected'
    | 'manual_review_cancelled'
    | 'operator_completed'
  metadata: Record<string, unknown>
}

export async function writeManualReviewEvent(input: EventInput): Promise<void> {
  const supabase = createAdminSupabaseClient()
  await writeEvent(supabase, input)
}

async function writeEvent(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  input: EventInput,
): Promise<void> {
  const safe = sanitizeEventMetadata(input.metadata)

  const { error } = await supabase.from('manual_review_events').insert({
    ticket_id: input.ticket_id,
    session_id: input.session_id,
    event_type: input.event_type,
    metadata: safe,
  })

  if (error) {
    // Log only — never let audit-write failure cascade into ticket-creation failure.
    // The primary write (manual_review_queue) is the durable record.
    // eslint-disable-next-line no-console
    console.error('[manualReview] event write failed:', error.message)
  }
}
