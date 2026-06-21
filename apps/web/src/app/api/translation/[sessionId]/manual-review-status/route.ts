/**
 * GET /api/translation/[sessionId]/manual-review-status
 *
 * User-safe status endpoint. Returns ONLY:
 *   - canonical user-facing status string (4 buckets)
 *   - i18n message key for the localized copy
 *   - safe next-step hint
 *   - estimated timing if known
 *
 * Returns NEVER:
 *   - admin notes / operator identity
 *   - raw OCR text / source traces / bbox
 *   - source/translated field values
 *   - safe_summary (operator-only)
 *   - reasons[] (those are operator triage, not user-facing)
 *
 * Authentication:
 *   - The route is publicly callable by session id only.
 *   - We do not enforce auth because the existing translation flow itself is
 *     anonymous-by-design (session id acts as a capability token).
 *   - We deliberately do not return *which document* of the session is in
 *     review, so a leaked session id does not enable PII enumeration.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { canonicalStatus, type ManualReviewStatus } from '@/lib/translation/manualReview/types'

export const dynamic = 'force-dynamic'

interface UserStatusResponse {
  ok: true
  /**
   * Coarse, user-facing status bucket. Drives copy + UI state on the client.
   *   not_in_review   → no manual review tickets for this session
   *   in_progress     → operator working on it
   *   awaiting_you    → we need information from the user
   *   ready           → operator finished, awaiting render approval
   *   closed          → completed, rejected, or cancelled — terminal
   */
  status: 'not_in_review' | 'in_progress' | 'awaiting_you' | 'ready' | 'closed'
  /** i18n message key — client picks UA/RU/EN copy */
  messageKey: string
  /** Approximate ETA in hours, or null if unknown */
  estimatedHours: number | null
  /** Optional CTA hint for the user (i18n key, not raw copy) */
  nextStepKey: string | null
}

interface UserStatusError {
  ok: false
  error: string
}

const FINAL_STATUSES: readonly string[] = ['completed', 'rejected', 'cancelled']

function bucketOf(s: ManualReviewStatus): UserStatusResponse['status'] {
  const c = canonicalStatus(s)
  switch (c) {
    case 'queued':
    case 'assigned':
    case 'in_review':
      return 'in_progress'
    case 'needs_user_clarification':
      return 'awaiting_you'
    case 'operator_completed':
    case 'approved_for_render':
      return 'ready'
    case 'completed':
    case 'rejected':
      return 'closed'
    default:
      return 'in_progress'
  }
}

function messageKeyOf(bucket: UserStatusResponse['status']): string {
  switch (bucket) {
    case 'not_in_review': return 'mr.user.not_in_review'
    case 'in_progress':   return 'mr.user.in_progress'
    case 'awaiting_you':  return 'mr.user.awaiting_you'
    case 'ready':         return 'mr.user.ready'
    case 'closed':        return 'mr.user.closed'
  }
}

function nextStepKeyOf(bucket: UserStatusResponse['status']): string | null {
  switch (bucket) {
    case 'awaiting_you': return 'mr.user.next.check_email'
    case 'ready':        return 'mr.user.next.review_translation'
    case 'in_progress':  return 'mr.user.next.wait'
    case 'closed':       return null
    case 'not_in_review': return null
  }
}

function estimateHours(status: UserStatusResponse['status'], priority: string | null): number | null {
  if (status === 'closed' || status === 'not_in_review') return null
  if (status === 'ready') return 0
  if (status === 'awaiting_you') return null
  // in_progress
  if (priority === 'high') return 4
  if (priority === 'low') return 48
  return 24
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> },
): Promise<NextResponse<UserStatusResponse | UserStatusError>> {
  try {
    const { sessionId } = await ctx.params

    if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 8) {
      return NextResponse.json({ ok: false, error: 'invalid_session_id' }, { status: 400 })
    }

    const supabase = createAdminSupabaseClient()

    // Pick the most recent ticket for this session.
    // Open tickets first; falls back to most recent terminal ticket.
    const { data, error } = await supabase
      .from('manual_review_queue')
      .select('id,status,priority,updated_at,created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) {
      // Failure mode: pretend "not in review" rather than leak DB error.
      // Server logs hold the real error.
      // eslint-disable-next-line no-console
      console.error('[manual-review-status] db error:', error.message)
      return NextResponse.json({
        ok: true,
        status: 'not_in_review',
        messageKey: messageKeyOf('not_in_review'),
        estimatedHours: null,
        nextStepKey: null,
      })
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        ok: true,
        status: 'not_in_review',
        messageKey: messageKeyOf('not_in_review'),
        estimatedHours: null,
        nextStepKey: null,
      })
    }

    const row = data[0] as {
      id: string
      status: string
      priority: string | null
      updated_at: string
      created_at: string
    }

    const bucket = bucketOf(row.status as ManualReviewStatus)
    const isFinalRow = FINAL_STATUSES.includes(row.status)
    const finalBucket = isFinalRow ? 'closed' : bucket

    return NextResponse.json({
      ok: true,
      status: finalBucket,
      messageKey: messageKeyOf(finalBucket),
      estimatedHours: estimateHours(finalBucket, row.priority),
      nextStepKey: nextStepKeyOf(finalBucket),
    })
  } catch (e: unknown) {
    // eslint-disable-next-line no-console
    console.error('[manual-review-status] handler error:', String(e))
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
