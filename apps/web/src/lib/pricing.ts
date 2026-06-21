/**
 * apps/web/src/lib/pricing.ts
 *
 * Single source of truth for Messenginfo service pricing.
 * All API routes, UI components, and email templates must import from here.
 *
 * To update pricing: change the constant here and redeploy — no code changes needed elsewhere.
 */

// ─── Translation document service ────────────────────────────────────────────

/** Translation price in US cents (used by Stripe). */
export const TRANSLATION_PRICE_CENTS = 1500 as const

/** Translation price as a display string — $0.00 during launch beta. */
export const TRANSLATION_PRICE_DISPLAY = '$0.00' as const

/** Translation price as a short display string — $0.00 during launch beta. */
export const TRANSLATION_PRICE_SHORT = '$0.00' as const

/** Translation price as a plain number (USD). */
export const TRANSLATION_PRICE_USD = 15 as const

// ─── Re-Parole / U4U service ──────────────────────────────────────────────────

/** Re-Parole tier-1 price in US cents (used by Stripe). */
export const REPAROLE_TIER1_PRICE_CENTS = 1500 as const

/** Re-Parole tier-1 display string. */
export const REPAROLE_TIER1_PRICE_DISPLAY = '$15.00' as const

/** Re-Parole tier-1 short display string. */
export const REPAROLE_TIER1_PRICE_SHORT = '$15' as const

/** Re-Parole tier-1 plain number (USD). */
export const REPAROLE_TIER1_PRICE_USD = 15 as const
