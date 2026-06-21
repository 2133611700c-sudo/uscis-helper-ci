/**
 * POST /api/admin/manual-review/[ticketId]/transition
 *
 * Operator-driven status transition endpoint. Replaces multiple verb-named
 * endpoints (assign / start / request-user-clarification / complete /
 * approve-render / reject / cancel) with a single typed transition.
 *
 * Auth: ADMIN_SECRET cookie required.
 *
 * Body (JSON):
 *   { to: ManualReviewStatus,
 *     operator_id?: string,            // optional, for assigned-to + audit
 *     metadata?: Record<string, ...> } // safe metadata only
 *
 * Side-effects:
 *   - manual_review_queue row updated (status, optionally assigned_to)
 *   - manual_review_events row written with the matching event_type
 *
 * Validation:
 *   - rejects unknown statuses
 *   - rejects illegal transitions (uses STATUS_TRANSITIONS table)
 *   - sanitizes metadata (no PII permitted in audit log)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { requireAdminAuth } from '@/lib/translation/manualReview/adminAuth'
import {
  canTransition,
  isManualReviewStatus,
  type ManualReviewStatus,
  type ManualReviewEventType,
} from '@/lib/translation/manualReview/types'
import { writeManualReviewEvent } from '@/lib/translation/manualReview/createManualReviewTicket'

export const dynamic = 'force-dynamic'

const STATUS_TO_EVENT: Readonly<Record<ManualReviewStatus, ManualReviewEventType | null>> = {
  not_required: null,
  queued: 'manual_review_queued',
  pending: 'manual_review_queued',
  assigned: 'manual_review_assigned',
  in_review: 'manual_review_started',
  needs_user_clarification: 'manual_review_user_clarification_requested',
  operator_completed: 'manual_review_completed',
  approved_for_render: 'manual_review_approved_for_render',
  completed: 'manual_review_approved_for_render',
  rejected: 'manual_review_rejected',
  cancelled: 'manual_review_cancelled',
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ ticketId: string }> },
): Promise<NextResponse> {
  const denied = requireAdminAuth(req)
  if (denied) return denied

  const { ticketId } = await ctx.params
  if (!ticketId || ticketId.length < 8) {
    return NextResponse.json({ ok: false, error: 'invalid_ticket_id' }, { status: 400 })
  }

  let body: { to?: unknown; operator_id?: unknown; metadata?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  if (!isManualReviewStatus(body.to) || body.to === 'not_required') {
    return NextResponse.json({ ok: false, error: 'invalid_target_status' }, { status: 400 })
  }
  const target = body.to

  const supabase = createAdminSupabaseClient()
  const { data: existing, error: loadErr } = await supabase
    .from('manual_review_queue')
    .select('id,status,session_id,assigned_to')
    .eq('id', ticketId)
    .single()

  if (loadErr || !existing) {
    return NextResponse.json({ ok: false, error: 'ticket_not_found' }, { status: 404 })
  }

  const row = existing as { id: string; status: string; session_id: string | null; assigned_to: string | null }

  if (!isManualReviewStatus(row.status)) {
    return NextResponse.json({ ok: false, error: 'corrupt_status' }, { status: 500 })
  }

  if (!canTransition(row.status, target)) {
    return NextResponse.json(
      { ok: false, error: 'illegal_transition', from: row.status, to: target },
      { status: 409 },
    )
  }

  // Operator id — used only as 'assigned_to' string (operator email/handle).
  // Never logged into event metadata as raw — we hash for audit.
  const operatorId = typeof body.operator_id === 'string' ? body.operator_id.slice(0, 120) : null
  const updatePayload: Record<string, unknown> = { status: target }
  if (target === 'assigned' && operatorId) {
    updatePayload.assigned_to = operatorId
  }

  const { error: updErr } = await supabase
    .from('manual_review_queue')
    .update(updatePayload)
    .eq('id', ticketId)

  if (updErr) {
    return NextResponse.json({ ok: false, error: 'update_failed' }, { status: 500 })
  }

  const eventType = STATUS_TO_EVENT[target]
  if (eventType) {
    await writeManualReviewEvent({
      ticket_id: ticketId,
      session_id: row.session_id,
      event_type: eventType,
      metadata: {
        from_status: row.status,
        to_status: target,
        operator_id_hash: operatorId ? hashOperatorId(operatorId) : null,
        // anything in body.metadata is sanitized inside writeManualReviewEvent
        ...(typeof body.metadata === 'object' && body.metadata !== null && !Array.isArray(body.metadata)
          ? (body.metadata as Record<string, unknown>)
          : {}),
      },
    })
  }

  return NextResponse.json({ ok: true, ticketId, status: target })
}

/**
 * Cheap, non-cryptographic hash of operator id for audit trail.
 * Goal: avoid storing full operator email/handle in event metadata.
 */
function hashOperatorId(input: string): string {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h) + input.charCodeAt(i)
    h |= 0
  }
  return `op_${(h >>> 0).toString(16).slice(0, 8)}`
}
