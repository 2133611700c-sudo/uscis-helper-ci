/**
 * stripeRecipientVerifier — the production RecipientVerifier for the legacy
 * operator send actions. Kept in its own module so legacyOperatorAuth.ts (and the
 * operator page that imports maskEmail) never pull in the Stripe SDK.
 *
 * Re-verifies the ticket's payment session as a PAID 'translation' checkout and
 * returns the verified Stripe customer email. Never trusts a client value.
 */
import { verifyStripeSessionPaid } from '@/lib/stripe/verifyPayment'
import type { RecipientVerifier } from './legacyOperatorAuth'

export const stripeTranslationVerifier: RecipientVerifier = async (sessionId: string) => {
  const v = await verifyStripeSessionPaid(sessionId, { expectedService: 'translation' })
  return {
    paid: !!v.paid,
    correctService: !!v.correctService,
    email: v.customerEmail ?? null,
  }
}
