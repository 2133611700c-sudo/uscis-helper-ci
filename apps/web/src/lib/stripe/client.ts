import Stripe from 'stripe'

const secretKey = process.env.STRIPE_SECRET_KEY

export const stripe = secretKey
  ? new Stripe(secretKey, { apiVersion: '2026-04-22.dahlia' })
  : null

// TPS Ukraine Tier 1: $15 one-time. The live Price ID is public (it appears in
// the Stripe Checkout URL); the actual secret is STRIPE_SECRET_KEY, which stays
// in env. Set STRIPE_PRICE_ID_TPS_TIER1 in env to override the default.
const TPS_TIER1_DEFAULT = 'price_1TYvxFLQzhPNaqEsqmFrydKh'

export const STRIPE_PRICES = {
  reparoleU4UTier1:      process.env.STRIPE_PRICE_ID_REPAROLE_TIER1 ?? '',
  tpsTier1:              process.env.STRIPE_PRICE_ID_TPS_TIER1 ?? TPS_TIER1_DEFAULT,
  translationBasic:      process.env.STRIPE_PRICE_ID_TRANSLATION_BASIC ?? '',
  translationPlus:       process.env.STRIPE_PRICE_ID_TRANSLATION_PLUS ?? '',
  translationPremium:    process.env.STRIPE_PRICE_ID_TRANSLATION_PREMIUM ?? '',
  /** @deprecated use translationBasic/Plus/Premium */
  translationSingle:     process.env.STRIPE_PRICE_ID_TRANSLATION_SINGLE ?? '',
} as const

export type StripeProduct = 're-parole-u4u' | 'tps-ukraine' | 'translation'
export type TranslationPlan = 'basic' | 'plus' | 'premium'

export const translationPriceId = (plan: TranslationPlan): string => {
  switch (plan) {
    case 'basic':   return STRIPE_PRICES.translationBasic
    case 'plus':    return STRIPE_PRICES.translationPlus
    case 'premium': return STRIPE_PRICES.translationPremium
  }
}

export const isStripeConfigured = (product?: StripeProduct) => {
  if (!stripe) return false
  if (product === 'translation') return !!(STRIPE_PRICES.translationBasic || STRIPE_PRICES.translationSingle)
  if (product === 're-parole-u4u') return !!STRIPE_PRICES.reparoleU4UTier1
  if (product === 'tps-ukraine') return !!STRIPE_PRICES.tpsTier1
  return !!STRIPE_PRICES.reparoleU4UTier1
}
