/**
 * POST /api/translation/submit-order — operator-flow entry (PIVOT Phase 2.1).
 *
 * Called by the wizard right after Stripe checkout success when
 * NEXT_PUBLIC_NEW_OPERATOR_FLOW_ENABLED=1. Instead of the customer confirming
 * every field and downloading a PDF themselves, the paid order goes to the
 * operator queue: the owner reviews/edits the fields in /admin/manual-review
 * and emails the finished PDF. The customer sees /order/{id} and waits.
 *
 * Security: the Stripe checkout token IS the auth — verified server-side
 * (paid + service=translation). The customer email comes from the VERIFIED
 * Stripe session, never from the client body. Idempotent: re-posting the same
 * checkout token reuses the open ticket (createManualReviewTicket dedupes by
 * session_id).
 *
 * PII: field values land only in manual_review_queue.source_fields (the
 * operator's working copy) — never in logs.
 */
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import { verifyStripeSessionPaid } from '@/lib/stripe/verifyPayment'
import { handleVerifiedPayment } from '@/lib/translation/orders/handleVerifiedPayment'
import { createManualReviewTicket, writeManualReviewEvent } from '@/lib/translation/manualReview/createManualReviewTicket'
import { notifyOperator } from '@/lib/translation/manualReview/notifications'
import { sendEmail } from '@/lib/email/resend'
import { orderReceivedEmail } from '@/lib/email/operatorFlowTemplates'

export const dynamic = 'force-dynamic'

interface SubmitOrderBody {
  checkout_id?: string
  doc_type?: string
  locale?: string
  fields?: Array<{ field: string; value: string | null; raw_cyrillic?: string | null; review_required?: boolean }>
}

export async function POST(req: NextRequest) {
  const ip = getClientIP(req)
  const rl = await rateLimit(`submit-order:${ip}`, 10, 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  }

  let body: SubmitOrderBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }
  const checkoutId = body.checkout_id ?? ''
  if (!checkoutId) {
    return NextResponse.json({ ok: false, error: 'missing_checkout_id' }, { status: 400 })
  }

  // Payment gate — the token is the capability. Email comes from Stripe.
  const v = await verifyStripeSessionPaid(checkoutId, { expectedService: 'translation' })
  if (!v.paid || !v.correctService) {
    return NextResponse.json({ ok: false, error: 'payment_not_confirmed', reason: v.reason }, { status: 402 })
  }

  const docType = body.doc_type || 'other'
  const locale = ['ru', 'uk', 'es', 'en'].includes(body.locale ?? '') ? (body.locale as string) : 'en'
  const sourceFields: Record<string, string> = {}
  for (const f of body.fields ?? []) {
    // Working copy for the operator: best value, else the raw Cyrillic read.
    const val = f.value ?? f.raw_cyrillic ?? ''
    if (f.field) sourceFields[f.field] = val
  }

  const ticket = await createManualReviewTicket({
    sessionId: checkoutId, // checkout id doubles as the order session key (idempotency)
    reasons: ['operator_review_paid'],
    detectedDocumentType: docType,
    moduleType: 'translation',
    priority: 'high',
    safeSummary: `Paid translation order (${docType}); operator review per the operator-flow product model.`,
    v0Compat: {
      docType,
      sourceLang: 'uk',
      contactEmail: v.customerEmail ?? undefined,
      sourceFields,
    },
  })
  if (!ticket.ticketId) {
    return NextResponse.json({ ok: false, error: 'queue_unavailable' }, { status: 503 })
  }

  // ── Translation V2 (durable order) — client reconciliation path ───────────
  // Create/get the durable V2 order keyed on the Stripe checkout_session_id
  // (UNIQUE → exactly one order per checkout, NEVER matched by email). Uses the
  // SAME server-retrieved session verifyStripeSessionPaid already validated. No
  // event dedupe here (the webhook owns the #184 ledger). Best-effort during
  // cutover: the legacy queue ticket above is the source of truth, so a V2
  // problem must not fail a PAID order.
  if (v.session) {
    try {
      await handleVerifiedPayment({
        verifiedSession: v.session,
        verifiedEventId: null,
        source: 'client_reconciliation',
      })
    } catch (e) {
      console.error('[submit-order] V2 handleVerifiedPayment threw:', e instanceof Error ? e.message : e)
    }
  }

  await writeManualReviewEvent({
    ticket_id: ticket.ticketId,
    session_id: checkoutId,
    event_type: 'manual_review_queued',
    metadata: { source: 'submit_order', doc_type: docType, reused: ticket.reused },
  }).catch(() => {})

  // Operator notification (metadata-only) + customer confirmation. Both
  // fail-open: a notification problem must never lose a PAID order — the
  // ticket is already in the queue and the admin list shows it.
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://messenginfo.com'
  const orderUrl = `${base}/${locale}/order/${ticket.ticketId}`
  if (!ticket.reused) {
    notifyOperator({
      ticketId: ticket.ticketId,
      sessionId: checkoutId,
      eventType: 'manual_review_queued',
      priority: 'high',
      moduleType: 'translation',
      metadata: { source: 'submit_order', doc_type: docType },
    }).catch(() => {})
    if (v.customerEmail) {
      const tpl = orderReceivedEmail({ locale, orderUrl, docTypeLabel: docType })
      sendEmail({
        to: v.customerEmail,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        type: 'translation_email',
      }).catch(() => {})
    }
  }

  console.info('[submit-order]', JSON.stringify({
    ticket_id: ticket.ticketId, doc_type: docType, reused: ticket.reused,
    fields: Object.keys(sourceFields).length, has_email: !!v.customerEmail,
  }))
  return NextResponse.json({ ok: true, order_id: ticket.ticketId, reused: ticket.reused, order_url: orderUrl })
}
