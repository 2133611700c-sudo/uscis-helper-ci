/**
 * Manual Review pipeline integration helpers.
 *
 * Thin wrappers around `shouldRouteToManualReview` + `createManualReviewTicket`
 * that each route handler calls at its own gate. Goals:
 *   - Single function per gate. Caller passes context (sessionId, docType, etc.)
 *     but NEVER raw PII (no field values, no OCR text, no user names).
 *   - Never throws. DB failures are swallowed and logged so the route's
 *     primary response is unaffected.
 *   - Returns stable, safe metadata that the route can surface back to the user.
 *
 * Wired callers:
 *   G2  ocr-from-storage          → preprocess image quality failure
 *   G3  ocr-from-storage          → ocr provider blocked (system_error, high)
 *   G4  ocr-from-storage          → smart-retake exhausted
 *   G5  ocr-from-storage          → DeepSeek field-mapping failure
 *   G6  ocr-from-storage          → missing critical fields after extraction
 *   G7  ocr-from-storage          → module not active (draft/manual_only/disabled)
 *   G9  render                    → hard gate via getOpenManualReviewForSession
 *   G10 manual-review (legacy)    → rewrites direct-insert path
 */

import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import {
  createManualReviewTicket,
  type CreateTicketInput,
  type CreateTicketResult,
} from './createManualReviewTicket'
import {
  shouldRouteToManualReview,
  type RouterInput,
} from './router'
import type { ManualReviewReason, ManualReviewStatus } from './types'
import { canonicalStatus } from './types'

// ── Common pipeline-side helper ──────────────────────────────────────────────

export interface PipelineGateInput extends RouterInput {
  /** Translation session UUID. Required. */
  sessionId: string
  /** Document UUID, optional. */
  documentId?: string | null
  /**
   * Optional safe label for the ticket safe_summary. Will be redacted.
   * Pass enum-shaped strings only (e.g. canonical doc type), never raw user input.
   */
  safeSummary?: string | null
}

export interface PipelineGateResult {
  /** True if the router decided manual review is needed. */
  routed: boolean
  /** True if a ticket row was created or reused. */
  ticketCreated: boolean
  /** Ticket id if created/reused. */
  ticketId?: string | null
  /** Stable reasons enum from the router. */
  reasons: ManualReviewReason[]
  /** i18n key for user-facing copy. */
  userMessageKey: string
}

/**
 * Single entry point for any pipeline gate that wants to route to manual review.
 * Computes routing decision, creates a ticket, and returns safe metadata.
 *
 * Never throws.
 */
export async function routePipelineToManualReview(
  input: PipelineGateInput,
): Promise<PipelineGateResult> {
  const decision = shouldRouteToManualReview(input)

  if (!decision.manualReviewRequired) {
    return {
      routed: false,
      ticketCreated: false,
      ticketId: null,
      reasons: [],
      userMessageKey: decision.userMessageKey,
    }
  }

  let ticketResult: CreateTicketResult | null = null
  try {
    const ticketInput: CreateTicketInput = {
      sessionId: input.sessionId,
      documentId: input.documentId ?? null,
      reasons: decision.reasons,
      detectedDocumentType: input.documentType ?? null,
      moduleType: input.documentType ?? null,
      priority: decision.priority,
      safeSummary: input.safeSummary ?? null,
    }
    ticketResult = await createManualReviewTicket(ticketInput)
  } catch (e: unknown) {
    // eslint-disable-next-line no-console
    console.error('[manualReview/integrations] createManualReviewTicket failed:', String(e))
  }

  return {
    routed: true,
    ticketCreated: Boolean(ticketResult?.ticketId),
    ticketId: ticketResult?.ticketId ?? null,
    reasons: decision.reasons,
    userMessageKey: decision.userMessageKey,
  }
}

// ── Render gate helper ───────────────────────────────────────────────────────

export interface OpenManualReviewSummary {
  open: boolean
  ticketId?: string
  status?: ManualReviewStatus
  /** Stable user-facing key for the bucket-level message */
  userMessageKey?: string
}

/**
 * Check whether the given session has an open manual_review_queue ticket
 * that should block render. Returns `{ open: false }` if:
 *   - no ticket exists, OR
 *   - the most-recent ticket is in `approved_for_render` or `completed` state.
 *
 * Never throws. On DB error, returns `{ open: false }` (fail-open by design —
 * the existing render gates (payment, cert, completeness, evidence, QA) are
 * still in front of this).
 */
export async function getOpenManualReviewForSession(
  sessionId: string,
): Promise<OpenManualReviewSummary> {
  if (!sessionId) return { open: false }

  try {
    const supabase = createAdminSupabaseClient()
    const { data, error } = await supabase
      .from('manual_review_queue')
      .select('id,status,updated_at,created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[manualReview/integrations] open-ticket query failed:', error.message)
      return { open: false }
    }

    if (!data || data.length === 0) return { open: false }

    const row = data[0] as { id: string; status: string }
    const status = row.status as ManualReviewStatus
    const canon = canonicalStatus(status)

    // Allow render only for fully approved or completed tickets.
    const renderAllowed = canon === 'approved_for_render' || canon === 'completed'
    if (renderAllowed) return { open: false }

    // Closed-but-rejected tickets should also not block render — operator
    // explicitly closed the case and the user should be told via a different path.
    if (canon === 'rejected') return { open: false }

    return {
      open: true,
      ticketId: row.id,
      status,
      userMessageKey: bucketKey(status),
    }
  } catch (e: unknown) {
    // eslint-disable-next-line no-console
    console.error('[manualReview/integrations] open-ticket exception:', String(e))
    return { open: false }
  }
}

function bucketKey(s: ManualReviewStatus): string {
  const c = canonicalStatus(s)
  switch (c) {
    case 'queued':
    case 'assigned':
    case 'in_review':
      return 'mr.user.in_progress'
    case 'needs_user_clarification':
      return 'mr.user.awaiting_you'
    case 'operator_completed':
    case 'approved_for_render':
      return 'mr.user.ready'
    case 'completed':
    case 'rejected':
      return 'mr.user.closed'
    default:
      return 'mr.user.in_progress'
  }
}

// ── Critical-field helper for G6 ─────────────────────────────────────────────

/**
 * Build router input from extraction-route signals so callers don't have to
 * shape the full RouterInput object themselves.
 *
 * Supports the most common pipeline scenarios:
 *   - "extraction succeeded but K critical fields are missing"
 *   - "extraction failed: smart-retake exhausted"
 *   - "module not active"
 *   - "image quality failed"
 *   - "ocr provider blocked"
 *   - "deepseek mapping failed"
 *
 * Caller is expected to pass at most a few signals — undefined ones are ignored.
 */
export interface ExtractionGateSignals {
  sessionId: string
  documentId?: string | null
  /** Canonical document type (e.g. 'ua_internal_passport_booklet'). */
  documentType?: string | null
  /** Module status from registry. */
  moduleStatus?: 'active' | 'draft' | 'manual_only' | 'disabled' | null
  /** Classifier confidence 0–1. */
  classifierConfidence?: number | null
  /** OCR aggregated confidence 0–1. */
  ocrConfidence?: number | null
  /** Image quality verdict. */
  imageQuality?: { failed: boolean; retries: number } | null
  /** Critical-field extraction outcome (no values, no labels). */
  criticalFieldResults?: { fieldKey: string; present: boolean; hasEvidence: boolean }[] | null
  /** Free-text error tags from upstream (route slugs / error codes only). */
  extractionErrors?: string[] | null
  /** True when smart-retake budget is exhausted. */
  retakeExhausted?: boolean
  /** Repeat OCR failures across attempts. */
  ocrFailureCount?: number | null
  /** Whether the user has paid (priority bump). */
  paidUser?: boolean
}

export function gateInputFromSignals(s: ExtractionGateSignals): PipelineGateInput {
  // Translate retakeExhausted into the router's image-quality model — when
  // exhausted, we treat the situation as image_quality_failed.
  const imageQuality = s.imageQuality ?? (s.retakeExhausted ? { failed: true, retries: 999 } : null)

  return {
    sessionId: s.sessionId,
    documentId: s.documentId ?? null,
    documentType: s.documentType ?? null,
    moduleStatus: s.moduleStatus ?? null,
    classifierConfidence: s.classifierConfidence ?? null,
    ocrConfidence: s.ocrConfidence ?? null,
    imageQuality,
    criticalFieldResults: s.criticalFieldResults ?? null,
    extractionErrors: s.extractionErrors ?? null,
    ocrFailureCount: s.ocrFailureCount ?? null,
    paidUser: s.paidUser ?? false,
    safeSummary: null,
  }
}
