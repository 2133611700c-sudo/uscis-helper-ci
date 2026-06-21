/**
 * Payment Gate Validator — v5 §21.
 *
 * Final-render endpoints MUST call this before producing a customer PDF.
 * It is a thin pure-function so it can be unit-tested without standing
 * up Stripe.
 *
 * Rules:
 *   1. payment_confirmed must be true
 *   2. payment_checkout_id must be set (a Stripe session ID or pilot
 *      coupon ID)
 *   3. for pilot coupons, the prefix is "pilot_" (free pilot mode)
 *   4. for Stripe checkout sessions, the prefix is "cs_" (live)
 *      or "cs_test_" (sandbox); pilot mode rejects "cs_test_"
 *
 * No HTTP calls — verifying the Stripe session against the API is the
 * caller's responsibility (it should already be done in the webhook
 * handler that flips payment_confirmed). This validator answers the
 * structural question only.
 */

import type { PacketState } from './types'

export interface PaymentGateResult {
  ok: boolean
  reason?:
    | 'payment_not_confirmed'
    | 'checkout_id_missing'
    | 'invalid_checkout_id_shape'
    | 'sandbox_id_in_production_mode'
  passes: string[]
}

const STRIPE_LIVE_PREFIX = 'cs_live_'
const STRIPE_TEST_PREFIX = 'cs_test_'
const PILOT_PREFIX = 'pilot_'

export interface PaymentGateOptions {
  /** When 'production', sandbox-only checkout IDs are rejected. */
  mode?: 'production' | 'sandbox'
}

export function validatePaymentGate(
  packet: PacketState,
  opts: PaymentGateOptions = {},
): PaymentGateResult {
  const mode = opts.mode ?? 'production'

  if (packet.payment_confirmed !== true) {
    return {
      ok: false,
      reason: 'payment_not_confirmed',
      passes: ['payment_gate_check'],
    }
  }

  const id = (packet.payment_checkout_id ?? '').trim()
  if (!id) {
    return {
      ok: false,
      reason: 'checkout_id_missing',
      passes: ['payment_gate_check'],
    }
  }

  const isPilot = id.startsWith(PILOT_PREFIX)
  const isLive = id.startsWith(STRIPE_LIVE_PREFIX)
  const isTest = id.startsWith(STRIPE_TEST_PREFIX)

  if (!isPilot && !isLive && !isTest) {
    return {
      ok: false,
      reason: 'invalid_checkout_id_shape',
      passes: ['payment_gate_check'],
    }
  }

  if (mode === 'production' && isTest) {
    return {
      ok: false,
      reason: 'sandbox_id_in_production_mode',
      passes: ['payment_gate_check'],
    }
  }

  return { ok: true, passes: ['payment_gate_check'] }
}
