/**
 * POST /api/tps/manual-review
 *
 * Wires the TPS upload/review flow into the existing manual_review_queue
 * pipeline (built in phases 1-15 for the translation product). No new
 * table, no new admin UI — the same admin queue at /admin/manual-review
 * picks these up.
 *
 * Body shape (strict):
 *   {
 *     reason: 'image_quality_failed' | 'low_ocr_confidence' |
 *             'missing_critical_fields' | 'user_requested_human_help',
 *     contact_email: string,    // user's email so an operator can reach them
 *     locale: 'uk' | 'ru' | 'en' | 'es',
 *     stage:  'upload' | 'review' | 'generate'   // where the user got stuck
 *   }
 *
 * Privacy:
 *   - NO image is attached.
 *   - NO names, DOB, addresses, passport numbers are accepted.
 *   - Only the user's email (so we can answer them) + a free-form "stage"
 *     label so an operator knows which screen they were on.
 *   - The wrapped service applies its own PII safety net via
 *     sanitizeEventMetadata + buildSafeSummary.
 *
 * Rate limit: 5 tickets per 10 min per IP — enough for a stuck user to
 * retry a couple times, low enough to discourage abuse.
 */

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import { createManualReviewTicket } from '@/lib/translation/manualReview/createManualReviewTicket'
import type { ManualReviewReason } from '@/lib/translation/manualReview/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_REASONS: readonly ManualReviewReason[] = [
  'image_quality_failed',
  'low_ocr_confidence',
  'missing_critical_fields',
  'user_requested_human_help',
]

const ALLOWED_LOCALES = ['uk', 'ru', 'en', 'es'] as const
const ALLOWED_STAGES = ['upload', 'review', 'generate'] as const

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface RequestBody {
  reason: ManualReviewReason
  contact_email: string
  locale: typeof ALLOWED_LOCALES[number]
  stage: typeof ALLOWED_STAGES[number]
}

const ALLOWED_KEYS = ['reason', 'contact_email', 'locale', 'stage'] as const

function isValidBody(b: unknown): b is RequestBody {
  if (typeof b !== 'object' || b === null) return false
  const r = b as Record<string, unknown>
  const keys = Object.keys(r)
  if (
    keys.length !== ALLOWED_KEYS.length ||
    keys.some((k) => !(ALLOWED_KEYS as readonly string[]).includes(k))
  ) {
    return false
  }
  return (
    typeof r.reason === 'string' &&
    ALLOWED_REASONS.includes(r.reason as ManualReviewReason) &&
    typeof r.contact_email === 'string' &&
    EMAIL_RX.test(r.contact_email) &&
    r.contact_email.length <= 254 &&
    typeof r.locale === 'string' &&
    (ALLOWED_LOCALES as readonly string[]).includes(r.locale) &&
    typeof r.stage === 'string' &&
    (ALLOWED_STAGES as readonly string[]).includes(r.stage)
  )
}

export async function POST(req: NextRequest) {
  const ip = getClientIP(req)
  const rl = await rateLimit(`tps-manual-review:${ip}`, 5, 10 * 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(
            Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000),
          ),
        },
      },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!isValidBody(body)) {
    return NextResponse.json(
      {
        error:
          'Body must include only { reason, contact_email, locale, stage } with allowed values',
      },
      { status: 400 },
    )
  }

  try {
    // safeSummary is a SHORT label, never PII. createManualReviewTicket
    // applies its own redaction layer, but we keep this string minimal
    // and structural-only so there is nothing to redact.
    const safeSummary = `TPS Ukraine — stuck at: ${body.stage}`

    const result = await createManualReviewTicket({
      reasons: [body.reason],
      detectedDocumentType: null,
      moduleType: 'tps_ukraine',
      priority: 'normal',
      safeSummary,
      v0Compat: {
        docType: 'tps_ukraine_help_request',
        sourceLang: body.locale,
        // Email goes into v0 column contact_email. No name, no phone, no fields.
        contactName: null,
        contactEmail: body.contact_email,
        contactPhone: null,
        sourceFields: null,
      },
    })

    return NextResponse.json({
      ok: true,
      ticket_id: result.ticketId,
      status: result.status,
      reused: result.reused,
    })
  } catch (e: unknown) {
    // Do NOT echo e.message into the response body — it could contain
    // Supabase error text that includes column values. Surface a generic
    // failure; Sentry will catch the detail on the server side.
    const detail = e instanceof Error ? e.message : 'unknown'
    console.error('[tps/manual-review] failed:', detail)
    return NextResponse.json(
      { error: 'Could not create ticket' },
      { status: 500 },
    )
  }
}
