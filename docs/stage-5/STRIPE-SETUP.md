# Stage 5 — Stripe Setup (Re-Parole U4U Tier 1 Only)

## Status
SCAFFOLD only. No live keys. Test mode required first.

## Why now
- PR #16 merged
- after() audit_log verified working in production
- Block list confirmed: subscriptions, TPS, EAD, translations marketplace, attorney directory all OUT of Stage 5

## Required Vercel env vars (TEST MODE FIRST)
- STRIPE_SECRET_KEY (sk_test_...)
- STRIPE_WEBHOOK_SECRET (whsec_...)
- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (pk_test_...)
- STRIPE_PRICE_ID_REPAROLE_TIER1 (price_...)

## Stripe dashboard setup
1. Create test mode account
2. Add product: "Re-Parole U4U Packet — Tier 1" — $15.00 USD one-time
3. Copy price_id → STRIPE_PRICE_ID_REPAROLE_TIER1
4. Add webhook endpoint: POST https://messenginfo.com/api/stripe/webhook
   Events: checkout.session.completed
5. Copy webhook signing secret → STRIPE_WEBHOOK_SECRET

## Test flow (mandatory before live keys)
1. Set test env vars in Vercel Production
2. Trigger /api/stripe/checkout with valid session_id
3. Use Stripe test card 4242 4242 4242 4242 / any future date / any CVC / any ZIP
4. Verify Supabase audit_log:
   - action='stripe_checkout_created' (from /api/stripe/checkout)
   - action='stripe_payment_succeeded' (from webhook)
5. Only after both events appear → switch to live keys

## audit_log expected event chain
1. wizard_session_created
2. packet_generated
3. stripe_checkout_created
4. stripe_payment_succeeded (via webhook)

## Block list (NOT in Stage 5)
- Subscriptions
- Multiple products beyond Re-Parole Tier 1
- TPS, EAD as paid services
- Translations marketplace
- Attorney directory
- Refund automation (manual via Stripe dashboard)
