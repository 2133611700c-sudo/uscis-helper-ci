/**
 * resendRecipient.security.test.ts — #195 P0-2.
 *
 * /api/order/[id]/resend must send ONLY to the Stripe-verified recipient
 * (resolveVerifiedRecipient), never to the client-written contact_email.
 * Source-invariant test (same approach as actions.security.test.ts).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(join(__dirname, '..', 'resend', 'route.ts'), 'utf-8')

describe('#195 P0-2 — resend recipient is Stripe-verified', () => {
  it('re-verifies the recipient via resolveVerifiedRecipient + stripeTranslationVerifier', () => {
    expect(SRC).toContain('resolveVerifiedRecipient(supabase, id, stripeTranslationVerifier)')
  })

  it('sends to the verified recipient, NOT the client-written contact_email', () => {
    // the send must target the resolved `recipient`, and contact_email must not be the `to:`
    expect(SRC).toMatch(/to:\s*recipient/)
    expect(SRC).not.toMatch(/to:\s*String\(data\.contact_email\)/)
  })

  it('denies (no send) when the recipient cannot be verified', () => {
    expect(SRC).toContain("error: 'recipient_not_verified'")
  })
})
