/**
 * requirePaidPacket — shared, fail-closed server-side payment gate for paid
 * packet-generation endpoints (Re-Parole I-131, and TPS-compatible).
 *
 * Why this exists
 * ----------------
 * Before this gate, /api/reparole/generate-packet minted a paid $15 packet
 * with NO server-side payment verification — the client set `paid` purely from
 * a `?paid=1` URL param. Any direct POST produced a free packet.
 *
 * Security model (fail-closed):
 *   1. Owner session (same HMAC-cookie mechanism TPS uses) → bypass, allowed.
 *   2. Otherwise an `X-Payment-Token` header MUST be present (else 402).
 *   3. Token must look like a Stripe id (cs_* / py_*) (else 403).
 *   4. Stripe must confirm the session is `payment_status === 'paid'` (else 402).
 *   5. Session `metadata.service` MUST equal the expected product — a TPS token
 *      must NOT mint a Re-Parole packet (else 403, cross-product).
 *   6. If an expected amount is supplied and Stripe reports a different
 *      amount_total, reject (else 403).
 *   7. Replay: a token already consumed for this product cannot mint a second
 *      packet (in-memory per-instance store; documented best-effort).
 *
 * Client `paid=1`, body fields and query params are NEVER authoritative — only
 * the owner cookie or a Stripe-verified token can unlock generation.
 *
 * The gate is product-generic so TPS can adopt it later WITHOUT changing TPS in
 * this PR. It is deliberately decoupled from any single answers contract.
 */

import type { NextRequest } from 'next/server'
import { isOwnerSession } from '@/lib/ownerAccess'
import { verifyStripeSessionPaid } from './verifyPayment'

export type PaidGateCode =
  | 'no_token'              // 403 — neither owner nor X-Payment-Token
  | 'unpaid'               // 402 — Stripe session not paid (or not retrievable as paid)
  | 'bad_token_format'      // 403 — token is not a cs_/py_ Stripe id
  | 'wrong_product'         // 403 — token belongs to a different product (cross-product)
  | 'wrong_amount'          // 403 — Stripe amount_total != expected
  | 'replayed'             // 403 — token already consumed for this product
  | 'stripe_unavailable'    // 402 — Stripe not configured / API error (fail-closed)

export type PaidGateResult =
  | { ok: true; owner: boolean; token: string | null; service: string | null; customerEmail?: string | null }
  | { ok: false; status: 402 | 403; code: PaidGateCode; reason?: string }

export interface RequirePaidPacketOptions {
  req: NextRequest
  /** Expected Stripe metadata.service value, e.g. 're-parole-u4u'. */
  product: string
  /** If set, Stripe amount_total (cents) must equal exactly one of these. */
  expectedAmountCents?: number | readonly number[]
  /** Allow owner-session bypass (default true; same mechanism as TPS). */
  allowOwner?: boolean
}

const STRIPE_ID = /^(cs_|py_)/

// ── Replay / idempotency store ────────────────────────────────────────────
// A payment-verified Stripe token may mint exactly ONE packet per product. This
// is NOT a payment check (payment is verified above) — it only prevents re-use
// of an already-spent token.
//
// DURABLE first: when Supabase is configured, the consume goes through the
// append-only `stripe_consumed_tokens` ledger (cross-instance, survives
// serverless recycles). The per-instance in-memory set is the fallback when no
// store is configured (tests/local) or if the ledger is briefly unavailable —
// in that degraded case we fail OPEN on the replay check only (the user already
// paid; blocking their own download on a ledger outage is worse than allowing a
// rare double-download).
const consumed = new Set<string>()

function consumeKey(product: string, token: string): string {
  return `${product}:${token}`
}

function durableStoreConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

/**
 * Consume a token for a product exactly once. Returns 'fresh' the first time and
 * 'replayed' on any subsequent attempt. Uses the durable ledger when configured,
 * falling back to the in-memory set otherwise / on ledger error.
 */
async function consumeToken(product: string, token: string): Promise<'fresh' | 'replayed'> {
  if (durableStoreConfigured()) {
    try {
      const { createAdminSupabaseClient } = await import('@/lib/supabase/admin')
      const supabase = createAdminSupabaseClient()
      const { data, error } = await supabase.rpc('consume_stripe_packet_token', {
        p_product: product,
        p_token: token,
      })
      if (!error) {
        const inserted = Array.isArray(data)
          ? Boolean((data[0] as { inserted?: boolean } | undefined)?.inserted)
          : Boolean((data as { inserted?: boolean } | null)?.inserted)
        return inserted ? 'fresh' : 'replayed'
      }
      console.error('[requirePaidPacket] consume ledger error, falling back to memory:', error.message)
    } catch (e) {
      console.error('[requirePaidPacket] consume ledger threw, falling back to memory:', e instanceof Error ? e.message : e)
    }
  }
  // In-memory fallback (also the test/local path).
  const key = consumeKey(product, token)
  if (consumed.has(key)) return 'replayed'
  consumed.add(key)
  return 'fresh'
}

/** Test helper: reset the per-instance replay store. Not used in production. */
export function __resetConsumedStore(): void {
  consumed.clear()
}

/**
 * Gate a paid packet-generation request. Returns a typed allow/deny result;
 * the caller maps `{ status, code }` to an HTTP response and fails closed.
 *
 * Owner sessions bypass payment (parity with TPS). Everyone else must present a
 * Stripe-verified, product-matched, correctly-priced, unconsumed token.
 */
export async function requirePaidPacket(
  opts: RequirePaidPacketOptions,
): Promise<PaidGateResult> {
  const { req, product, expectedAmountCents, allowOwner = true } = opts

  // 1. Owner bypass — same HMAC cookie mechanism TPS uses.
  if (allowOwner) {
    const owner = await isOwnerSession(req)
    if (owner.verified) {
      return { ok: true, owner: true, token: null, service: null }
    }
  }

  // 2. X-Payment-Token must be present.
  const token = req.headers.get('x-payment-token')
  if (!token) {
    return { ok: false, status: 403, code: 'no_token', reason: 'payment_token_missing' }
  }

  // 3. Token must be a Stripe id shape. Client placeholders (e.g. the
  //    'stripe-checkout-complete' fallback) are NOT accepted — fail closed.
  if (!STRIPE_ID.test(token)) {
    return { ok: false, status: 403, code: 'bad_token_format', reason: 'token_not_stripe_id' }
  }

  // 4–5. Verify paid + product via the shared Stripe verifier.
  const v = await verifyStripeSessionPaid(token, { expectedService: product })

  if (v.reason === 'stripe_not_configured' || v.reason === 'stripe_api_error') {
    // Fail closed: if we cannot positively confirm payment, do not mint a packet.
    return { ok: false, status: 402, code: 'stripe_unavailable', reason: v.reason }
  }
  if (!v.paid) {
    return { ok: false, status: 402, code: 'unpaid', reason: v.reason ?? 'not_paid' }
  }
  if (!v.correctService) {
    // Cross-product: a TPS token used for Re-Parole lands here.
    return { ok: false, status: 403, code: 'wrong_product', reason: v.reason ?? 'wrong_service' }
  }

  // 6. Amount check (if the caller can determine the expected price).
  if (expectedAmountCents !== undefined) {
    const allowed = Array.isArray(expectedAmountCents)
      ? expectedAmountCents
      : [expectedAmountCents as number]
    const actual = v.amountTotalCents
    if (typeof actual === 'number' && !allowed.includes(actual)) {
      return { ok: false, status: 403, code: 'wrong_amount', reason: `amount_${actual}` }
    }
  }

  // 7. Replay: a token already consumed for this product cannot mint again.
  if ((await consumeToken(product, token)) === 'replayed') {
    return { ok: false, status: 403, code: 'replayed', reason: 'token_already_consumed' }
  }

  return {
    ok: true,
    owner: false,
    token,
    service: v.service ?? product,
    customerEmail: v.customerEmail ?? null,
  }
}
