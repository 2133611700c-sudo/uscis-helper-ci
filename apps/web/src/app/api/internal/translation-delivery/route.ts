/**
 * POST/GET /api/internal/translation-delivery — idempotent delivery worker.
 *
 * Drains the delivery_outbox: claims one due row atomically (claim_outbox_event →
 * FOR UPDATE SKIP LOCKED so concurrent/duplicate workers cannot double-send),
 * loads the EXACT stored artifact bytes (verifying SHA-256 — never re-renders),
 * sends the email with the outbox idempotency_key, then transitions the order.
 *
 * Outcomes:
 *   success            → markOutboxDelivered + transition delivery_pending→delivered
 *   transient failure  → markOutboxFailed (state=retry) with backoff (next_attempt_at)
 *   permanent failure  → markOutboxPermanentlyFailed + transition →delivery_failed
 *
 * NEVER: re-generate the PDF on retry; log the recipient or document content.
 *
 * Auth: internal-only via CRON_SECRET (Authorization: Bearer) — same pattern as
 * /api/cron/cleanup. Each invocation drains up to MAX_BATCH due rows.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  claimOutboxEvent,
  getArtifactById,
  getOrderById,
  downloadArtifactBytes,
  markOutboxDelivered,
  markOutboxFailed,
  markOutboxPermanentlyFailed,
  transitionOrder,
  TranslationOrderError,
  type ClaimedOutboxEvent,
} from '@/lib/translation/orders'
import { sendEmail } from '@/lib/email/resend'
import { orderCompletedEmail } from '@/lib/email/operatorFlowTemplates'
import { emitEvent } from '@/lib/translation/observability/events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BATCH = 10
const MAX_ATTEMPTS = 5
const WORKER_ID = 'translation-delivery-worker'

/** Exponential backoff: 1,2,4,8,16 minutes (capped). */
function backoffMs(attempt: number): number {
  return Math.min(2 ** Math.max(0, attempt - 1), 16) * 60_000
}

interface DeliveryOutcome {
  outbox_id: string
  result: 'delivered' | 'retry' | 'failed'
}

async function processOne(claim: ClaimedOutboxEvent): Promise<DeliveryOutcome> {
  emitEvent('delivery_attempts_total', {
    route: 'translation-delivery',
    internal_uuid: claim.id,
    attempt_count: claim.attemptCount,
  })
  // Load the immutable artifact + its order. The order carries the verified
  // recipient (the outbox only holds an opaque recipient_ref hash).
  const artifact = await getArtifactById(claim.artifactId)
  const order = await getOrderById(claim.orderId)

  if (!artifact || !order) {
    // The artifact/order is gone — nothing recoverable. Permanent fail.
    await markOutboxPermanentlyFailed(claim.id, 'artifact_or_order_missing')
    return { outbox_id: claim.id, result: 'failed' }
  }
  if (!order.verifiedRecipientEmail) {
    await markOutboxPermanentlyFailed(claim.id, 'no_verified_recipient')
    return { outbox_id: claim.id, result: 'failed' }
  }

  // Load the EXACT stored bytes (hash-verified inside). NEVER re-render.
  let bytes: Buffer
  try {
    bytes = await downloadArtifactBytes(artifact)
  } catch {
    // Storage hiccup or hash mismatch → transient (a hash mismatch should not
    // silently deliver; a retry re-verifies, and a persistent mismatch ages out
    // to permanent after MAX_ATTEMPTS).
    // A hash mismatch (download verifies sha) is a critical artifact integrity event.
    emitEvent('artifact_hash_mismatch_total', {
      route: 'translation-delivery',
      internal_uuid: claim.artifactId,
      error_code: 'artifact_unavailable',
      hash_verified: false,
    })
    if (claim.attemptCount >= MAX_ATTEMPTS) {
      await markOutboxPermanentlyFailed(claim.id, 'artifact_unavailable')
      await failOrder(order, claim)
      emitEvent('delivery_failure_total', {
        route: 'translation-delivery',
        internal_uuid: claim.id,
        error_code: 'artifact_unavailable',
      })
      return { outbox_id: claim.id, result: 'failed' }
    }
    await markOutboxFailed(claim.id, 'artifact_unavailable', new Date(Date.now() + backoffMs(claim.attemptCount)))
    return { outbox_id: claim.id, result: 'retry' }
  }

  // Send. The idempotency_key is passed to Resend so a duplicate send is a no-op.
  const docTypeLabel = (order.documentType ?? 'document').replace(/_/g, ' ')
  const tpl = orderCompletedEmail({ locale: 'en', docTypeLabel })
  const sendResult = await sendEmail({
    to: order.verifiedRecipientEmail,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    type: 'translation_email',
    attachment: {
      filename: 'translation.pdf',
      content: bytes.toString('base64'),
      encoding: 'base64',
    },
    idempotencyKey: claim.idempotencyKey,
  })

  if (sendResult.ok) {
    await markOutboxDelivered(claim.id)
    // Transition delivery_pending → delivered (guarded mutator; PII-free).
    try {
      await transitionOrder({
        orderId: order.id,
        expectedVersion: order.version,
        expectedStatus: 'delivery_pending',
        toStatus: 'delivered',
        actor: 'system',
        reason: 'delivery_succeeded',
        metadata: { outbox_id: claim.id, attempt: claim.attemptCount },
      })
    } catch {
      // Order may already be 'delivered' (a duplicate claim raced) — outbox is
      // the exactly-once gate; a late transition conflict is benign. The outbox
      // claim (FOR UPDATE SKIP LOCKED) is what prevented the duplicate send.
      emitEvent('delivery_duplicate_prevented_total', {
        route: 'translation-delivery',
        internal_uuid: claim.id,
      })
    }
    emitEvent('delivery_success_total', {
      route: 'translation-delivery',
      internal_uuid: claim.id,
      attempt_count: claim.attemptCount,
    })
    return { outbox_id: claim.id, result: 'delivered' }
  }

  // Send failed. Retry with backoff until MAX_ATTEMPTS, then permanent.
  if (claim.attemptCount >= MAX_ATTEMPTS) {
    await markOutboxPermanentlyFailed(claim.id, 'email_send_failed')
    await failOrder(order, claim)
    emitEvent('delivery_failure_total', {
      route: 'translation-delivery',
      internal_uuid: claim.id,
      error_code: 'email_send_failed',
    })
    return { outbox_id: claim.id, result: 'failed' }
  }
  await markOutboxFailed(claim.id, 'email_send_failed', new Date(Date.now() + backoffMs(claim.attemptCount)))
  return { outbox_id: claim.id, result: 'retry' }
}

async function failOrder(
  order: { id: string; version: number; status: string },
  claim: ClaimedOutboxEvent,
): Promise<void> {
  try {
    await transitionOrder({
      orderId: order.id,
      expectedVersion: order.version,
      expectedStatus: 'delivery_pending',
      toStatus: 'delivery_failed',
      actor: 'system',
      reason: 'delivery_exhausted',
      metadata: { outbox_id: claim.id, attempt: claim.attemptCount },
    })
  } catch {
    // benign: a concurrent worker may have transitioned it already
  }
}

async function drain(): Promise<{ processed: DeliveryOutcome[] }> {
  const processed: DeliveryOutcome[] = []
  for (let i = 0; i < MAX_BATCH; i++) {
    let claim: ClaimedOutboxEvent | null
    try {
      claim = await claimOutboxEvent(WORKER_ID)
    } catch (e) {
      if (e instanceof TranslationOrderError) {
        emitEvent('outbox_claim_failures_total', {
          route: 'translation-delivery',
          error_code: e.code,
        })
        break
      }
      throw e
    }
    if (!claim) break // nothing due
    processed.push(await processOne(claim))
  }
  return { processed }
}

async function handle(req: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const { processed } = await drain()
  const counts = processed.reduce(
    (acc, p) => ({ ...acc, [p.result]: (acc[p.result] ?? 0) + 1 }),
    {} as Record<string, number>,
  )
  // PII-free response: counts + outbox ids only.
  return NextResponse.json({ ok: true, claimed: processed.length, counts, outbox_ids: processed.map((p) => p.outbox_id) })
}

export async function POST(req: NextRequest) {
  return handle(req)
}

export async function GET(req: NextRequest) {
  return handle(req)
}
