import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import {
  stripe,
  STRIPE_PRICES,
  isStripeConfigured,
  translationPriceId,
  StripeProduct,
  TranslationPlan,
} from '@/lib/stripe/client'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { REPAROLE_TIER1_PRICE_CENTS } from '@/lib/pricing'

export const dynamic = 'force-dynamic'

// ── Translation plan → cents ──────────────────────────────────────────────────
const TRANSLATION_PLAN_CENTS: Record<TranslationPlan, number> = {
  basic:   1499,
  plus:    1999,
  premium: 2999,
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const {
    session_id,
    locale = 'en',
    product = 're-parole-u4u',
    plan = 'basic',
  } = body as {
    session_id?: string
    locale?: string
    product?: StripeProduct
    plan?: TranslationPlan
  }

  if (!isStripeConfigured(product) || !stripe) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const origin = req.headers.get('origin') ?? 'https://messenginfo.com'

  // ── Translation ────────────────────────────────────────────────────────────
  if (product === 'translation') {
    const priceId = translationPriceId(plan)
    if (!priceId) {
      return NextResponse.json({ error: `Price ID not configured for plan: ${plan}` }, { status: 503 })
    }

    let checkout
    try {
      checkout = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/${locale}/services/translate-document/start?paid=1&plan=${plan}&cs={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${origin}/${locale}/services/translate-document/start?cancelled=1`,
        metadata: { service: 'translation', plan, wizard_session_id: session_id ?? '' },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[stripe/checkout] translation session create failed:', msg)
      return NextResponse.json({ error: `Stripe error: ${msg}` }, { status: 500 })
    }

    const supabase = createAdminSupabaseClient()
    after(async () => {
      await supabase.from('audit_log').insert({
        action: 'stripe_checkout_created',
        target_table: 'translation_orders',
        target_id: session_id ?? plan,
        detail: { stripe_checkout_id: checkout.id, amount_cents: TRANSLATION_PLAN_CENTS[plan], plan },
      }).then(({ error }) => {
        if (error) console.error('[audit_log] translation checkout failed:', error.message)
      })
    })

    return NextResponse.json({ url: checkout.url, checkout_id: checkout.id })
  }

  // ── TPS Ukraine ────────────────────────────────────────────────────────────
  if (product === 'tps-ukraine') {
    const priceId = STRIPE_PRICES.tpsTier1
    if (!priceId) {
      return NextResponse.json({ error: 'TPS price ID not configured' }, { status: 503 })
    }

    // TPS state lives in localStorage, not Supabase. session_id is just the
    // browser-side wizard UUID for cross-referencing audit_log entries.
    const tpsWizardId = session_id ?? `anon-${Date.now()}`

    let checkout
    try {
      checkout = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/${locale}/services/tps-ukraine/checkout/success?cs={CHECKOUT_SESSION_ID}&wizard=${tpsWizardId}`,
        cancel_url:  `${origin}/${locale}/services/tps-ukraine/start`,
        metadata: { service: 'tps-ukraine', wizard_session_id: tpsWizardId, tier: '1' },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[stripe/checkout] tps session create failed:', msg)
      return NextResponse.json({ error: `Stripe error: ${msg}` }, { status: 500 })
    }

    const supabase = createAdminSupabaseClient()
    after(async () => {
      await supabase.from('audit_log').insert({
        action: 'stripe_checkout_created',
        target_table: 'tps_packets',
        target_id: tpsWizardId,
        detail: { stripe_checkout_id: checkout.id, service_slug: 'tps-ukraine' },
      }).then(({ error }) => {
        if (error) console.error('[audit_log] tps checkout failed:', error.message)
      })
    })

    return NextResponse.json({ url: checkout.url, checkout_id: checkout.id })
  }

  // ── Re-Parole U4U ──────────────────────────────────────────────────────────
  if (!session_id) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 })
  }

  const priceId = STRIPE_PRICES.reparoleU4UTier1
  if (!priceId) {
    return NextResponse.json({ error: 'Re-parole price ID not configured' }, { status: 503 })
  }

  let checkout
  try {
    checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/${locale}/services/re-parole-u4u/checkout/success?cs={CHECKOUT_SESSION_ID}&wizard=${session_id}`,
      cancel_url:  `${origin}/${locale}/services/re-parole-u4u`,
      metadata: { service: 're-parole-u4u', wizard_session_id: session_id, tier: '1' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[stripe/checkout] reparole session create failed:', msg)
    return NextResponse.json({ error: `Stripe error: ${msg}` }, { status: 500 })
  }

  const supabase = createAdminSupabaseClient()
  after(async () => {
    await supabase.from('audit_log').insert({
      action: 'stripe_checkout_created',
      target_table: 'wizard_sessions',
      target_id: session_id,
      detail: { stripe_checkout_id: checkout.id, amount_cents: REPAROLE_TIER1_PRICE_CENTS, service_slug: 're-parole-u4u' },
    }).then(({ error }) => {
      if (error) console.error('[audit_log] reparole checkout failed:', error.message)
    })
  })

  return NextResponse.json({ url: checkout.url, checkout_id: checkout.id })
}
