/**
 * POST /api/translation/manual-review
 *
 * Legacy entry point used by the wizard when the user explicitly asks for
 * human help, when low-confidence detection fires client-side, or when an
 * upstream translation API call fails.
 *
 * v1 rewrite (Path B):
 *   - Translates legacy reason codes to v1 enum (`normalizeReason`).
 *   - Routes through `createManualReviewTicket()` for idempotency, audit
 *     event, and v1 column population.
 *   - Stops sending raw OCR field values to staff email — uses
 *     `notifyOperator()` (metadata-only).
 *   - Response shape preserved: { ok, case_id, estimated_hours }.
 *
 * Backward compatibility:
 *   - Wizard callers continue to POST the same body (session_id, doc_type,
 *     source_lang, contact_*, source_fields, confidence, reason).
 *   - We now use those fields ONLY for backward-compat v0 columns
 *     (source_fields stored as-is so the existing admin detail page can
 *     still show them to the operator behind ADMIN_SECRET).
 *   - Raw fields are NEVER included in any notification or audit metadata.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createManualReviewTicket } from '@/lib/translation/manualReview/createManualReviewTicket'
import { notifyOperator } from '@/lib/translation/manualReview/notifications'
import {
  normalizeReason,
  type ManualReviewReason,
  type ManualReviewPriority,
} from '@/lib/translation/manualReview/types'

export const dynamic = 'force-dynamic'

const ESTIMATED_HOURS = 24

const LEGACY_REASONS = new Set(['low_confidence', 'user_requested', 'translate_error', 'ocr_unreadable'])
const VALID_LANGS = new Set(['ru', 'uk', 'uk-soviet'])

function pickPriority(reason: ManualReviewReason): ManualReviewPriority {
  if (reason === 'system_error') return 'high'
  if (reason === 'user_requested_human_help') return 'low'
  return 'normal'
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      session_id?: unknown
      doc_type?: unknown
      source_lang?: unknown
      contact_name?: unknown
      contact_email?: unknown
      contact_phone?: unknown
      source_fields?: unknown
      confidence?: unknown
      reason?: unknown
    }

    if (typeof body.doc_type !== 'string' || !body.doc_type) {
      return NextResponse.json({ ok: false, error: '"doc_type" is required' }, { status: 400 })
    }

    // Reason: accept v0 string, translate to v1 enum.
    const rawReason =
      typeof body.reason === 'string' && LEGACY_REASONS.has(body.reason)
        ? body.reason
        : 'low_confidence'
    const v1Reason = normalizeReason(rawReason) ?? 'low_ocr_confidence'

    const priority = pickPriority(v1Reason)

    const source_lang =
      typeof body.source_lang === 'string' && VALID_LANGS.has(body.source_lang)
        ? body.source_lang
        : 'ru'

    const sessionId = typeof body.session_id === 'string' ? body.session_id : null

    const sourceFields =
      body.source_fields && typeof body.source_fields === 'object' && !Array.isArray(body.source_fields)
        ? (body.source_fields as Record<string, string | null>)
        : {}

    const contactName  = typeof body.contact_name  === 'string' ? body.contact_name.trim()  || null : null
    const contactEmail = typeof body.contact_email === 'string' ? body.contact_email.trim().toLowerCase() || null : null
    const contactPhone = typeof body.contact_phone === 'string' ? body.contact_phone.trim() || null : null

    // Create the ticket via v1 service. Backward-compat v0 columns are
    // populated through the v0Compat path so the existing admin detail page
    // continues to work.
    const result = await createManualReviewTicket({
      sessionId,
      reasons: [v1Reason],
      detectedDocumentType: body.doc_type,
      moduleType: body.doc_type,
      priority,
      v0Compat: {
        docType: body.doc_type,
        sourceLang: source_lang,
        contactName,
        contactEmail,
        contactPhone,
        sourceFields,
      },
    }).catch((e: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[manual-review] createManualReviewTicket failed:', String(e))
      return null
    })

    if (!result) {
      return NextResponse.json(
        { ok: false, error: 'Failed to queue review request. Please contact contact@messenginfo.com directly.' },
        { status: 500 },
      )
    }

    // Operator notification — METADATA ONLY. No source field values, no contact_*.
    notifyOperator({
      ticketId: result.ticketId,
      sessionId,
      eventType: 'manual_review_queued',
      priority,
      moduleType: body.doc_type,
      metadata: {
        reasons: [v1Reason],
        from_status: 'not_required',
        to_status: result.status,
        count: 1,
        route: '/api/translation/manual-review',
      },
    }).catch((e: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[manual-review] notifyOperator failed:', String(e))
    })

    return NextResponse.json({
      ok: true,
      case_id: result.ticketId,
      estimated_hours: ESTIMATED_HOURS,
    })
  } catch (e: unknown) {
    // eslint-disable-next-line no-console
    console.error('[manual-review] handler error:', String(e))
    return NextResponse.json({ ok: false, error: 'Internal error.' }, { status: 500 })
  }
}
