import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe/client'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { handleVerifiedPayment } from '@/lib/translation/orders/handleVerifiedPayment'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!stripe) return NextResponse.json({ error: 'Stripe disabled' }, { status: 503 })

  const sig = req.headers.get('stripe-signature')
  const whsec = process.env.STRIPE_WEBHOOK_SECRET
  if (!sig || !whsec) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  const body = await req.text()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, whsec)
  } catch (e) {
    console.error('[webhook] signature verification failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()

  // ── Idempotency (#184 webhook replay) ──────────────────────────────────────
  // Stripe delivers at-least-once: the same event id can arrive multiple times
  // (network retries, replays). Claim the event id in the append-only ledger
  // BEFORE processing. inserted=false ⇒ already processed ⇒ no-op (skip the
  // audit row + every downstream side-effect). This is the standard "claim then
  // process" pattern on the globally-unique Stripe event id.
  const checkoutId =
    event.type === 'checkout.session.completed'
      ? (event.data.object as Stripe.Checkout.Session).id
      : null
  const { data: rec, error: recErr } = await supabase.rpc('record_stripe_processed_event', {
    p_stripe_event_id: event.id,
    p_event_type: event.type,
    p_checkout_session_id: checkoutId,
    p_order_id: null,
    p_result_code: 'received',
  })
  if (recErr) {
    // Ledger unavailable (e.g. the migration is not yet applied to this DB, or a
    // transient error). Deliberately do NOT 500 here: that would stall ALL
    // webhook processing whenever the ledger is missing/unreachable. Instead log
    // and fall through to process this event — exactly today's behavior (no
    // dedup). Full idempotency activates automatically once the ledger exists.
    console.error('[webhook] processed-events ledger unavailable, processing without dedup:', recErr.message)
  } else {
    const inserted = Array.isArray(rec)
      ? Boolean((rec[0] as { inserted?: boolean } | undefined)?.inserted)
      : Boolean((rec as { inserted?: boolean } | null)?.inserted)
    if (!inserted) {
      // Duplicate / replayed delivery — already processed. Acknowledge, do nothing.
      return NextResponse.json({ received: true, duplicate: true })
    }
  }

  if (event.type === 'checkout.session.completed') {
    const cs = event.data.object as Stripe.Checkout.Session
    const service     = cs.metadata?.service ?? ''
    const plan        = cs.metadata?.plan ?? ''
    const wizardId    = cs.metadata?.wizard_session_id ?? ''
    const customerEmail = (cs.customer_details as { email?: string } | null)?.email ?? null

    after(async () => {
      // ── Audit log for every payment ───────────────────────────────────────
      await supabase.from('audit_log').insert({
        action: 'stripe_payment_succeeded',
        target_table: service === 'translation' ? 'translation_orders' : 'wizard_sessions',
        target_id: wizardId || cs.id,
        detail: {
          stripe_checkout_id: cs.id,
          amount_total: cs.amount_total,
          customer_email: customerEmail,
          service_slug: service,
          plan,
        },
      }).then(({ error }) => {
        if (error) console.error('[webhook] audit_log insert failed:', error.message)
      })

      // ── Translation (legacy): update order status to 'emailed' ────────────
      if (service === 'translation' && customerEmail) {
        const { error } = await supabase
          .from('translation_orders')
          .update({ status: 'emailed', stripe_checkout_id: cs.id })
          .eq('email', customerEmail)
          .eq('status', 'signed')
          .order('created_at', { ascending: false })
          .limit(1)
        if (error) console.error('[webhook] translation_orders update failed:', error.message)
      }

      // ── Translation V2 (durable order) ────────────────────────────────────
      // Create the durable V2 order keyed on checkout_session_id (UNIQUE), layered
      // ON TOP of the #184 event-dedupe above — handleVerifiedPayment owns NO event
      // dedupe (single ledger), and createOrGetOrder is itself idempotent, so this
      // is safe to re-run. Server-side amount/product/paid are re-validated inside
      // the handler. Best-effort during cutover: a V2 problem must NEVER fail the
      // webhook (Stripe would retry); the operator path also reconciles via
      // submit-order. Recipient is taken from the Stripe-verified session only.
      if (service === 'translation') {
        try {
          const r = await handleVerifiedPayment({
            verifiedSession: cs,
            verifiedEventId: event.id,
            source: 'webhook',
          })
          if (r.resultCode !== 'order_created' && r.resultCode !== 'order_reused') {
            console.error('[webhook] V2 order not created:', r.resultCode)
          }
        } catch (e) {
          console.error('[webhook] V2 handleVerifiedPayment threw:', e instanceof Error ? e.message : e)
        }
      }

      // ── Re-Parole: update wizard session status ───────────────────────────
      if (service === 're-parole-u4u' && wizardId) {
        const { error } = await supabase
          .from('wizard_sessions')
          .update({ payment_status: 'paid', stripe_checkout_id: cs.id })
          .eq('id', wizardId)
        if (error) console.error('[webhook] wizard_sessions update failed:', error.message)
      }
    })
  }

  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object as Stripe.PaymentIntent
    console.error('[webhook] payment failed:', pi.id, pi.last_payment_error?.message)
    // No action needed — user stays on Stripe page and can retry
  }

  return NextResponse.json({ received: true })
}
