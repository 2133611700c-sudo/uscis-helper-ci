# Stripe Integration TODO

**Status:** NOT IMPLEMENTED — planned for after OCR + packet generation proven in production  
**Last Updated:** 2026-05-03

---

## Overview

Messenginfo will use Stripe for one-time payment on translation/document packet orders.

---

## Planned Products & Prices

| Product | Description | Price |
|---------|-------------|-------|
| Translation (solo) | 1 family member | $15 |
| Translation (couple) | 2 family members | $25 |
| Translation (family 3) | 3 family members | $35 |
| Translation (family 4) | 4 family members | $45 |
| Translation (family 5) | 5 family members | $55 |
| Translation (family 6+) | 6+ family members | $65 |

**Note:** Prices are for machine-assisted translation review. NOT certified translation. UI must clearly state this.

---

## When to Implement

**Prerequisites (must be proven first):**
1. OCR pipeline working end-to-end in production
2. Packet generation (PDF/DOCX/ZIP) verified with real documents
3. Translation order flow tested with 10+ real users
4. Supabase `translation_orders` table stable (no more schema changes)
5. Email delivery confirmed (Resend BCC working)

**Do NOT implement Stripe until all 5 prerequisites are met.**

---

## Architecture Plan

### Webhook Endpoint (required)
```
POST /api/webhooks/stripe
```

Handler must:
- Verify `Stripe-Signature` header with `STRIPE_WEBHOOK_SECRET`
- Handle events: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`
- On `checkout.session.completed`: update `translation_orders.status → 'paid'`, trigger packet generation
- Idempotent: use `payment_intent_id` to prevent duplicate processing

### Checkout Flow
```
User submits order → create Stripe Checkout Session → redirect to Stripe
→ Stripe redirects to /[locale]/services/translate-document?order_id=XXX&payment=success
→ Webhook triggers packet generation
→ User receives email with download link
```

### Stripe Checkout vs Payment Element

**Recommendation: Stripe Checkout (hosted page)**
- Reason: no PCI scope, no card data touches our servers, easier compliance
- Hosted Stripe page handles all card input
- Redirect back to our URL on success/cancel
- Payment Element (embedded) requires more work + PCI SAQ A-EP

---

## Required Vercel Environment Variables

| Variable | Description | When to add |
|----------|-------------|-------------|
| `STRIPE_SECRET_KEY` | Server-side API key (sk_live_* or sk_test_*) | Before first live charge |
| `STRIPE_PUBLISHABLE_KEY` | Client-side key (pk_live_* or pk_test_*) | Before first live charge |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret (whsec_*) | After registering webhook in Stripe |
| `STRIPE_PRICE_ID_1` | Stripe Price ID for $15 (1 member) | After creating prices in Stripe |
| `STRIPE_PRICE_ID_2` | Stripe Price ID for $25 (2 members) | After creating prices in Stripe |
| `STRIPE_PRICE_ID_3` | Stripe Price ID for $35 (3 members) | After creating prices in Stripe |
| `STRIPE_PRICE_ID_4` | Stripe Price ID for $45 (4 members) | After creating prices in Stripe |
| `STRIPE_PRICE_ID_5` | Stripe Price ID for $55 (5 members) | After creating prices in Stripe |
| `STRIPE_PRICE_ID_6` | Stripe Price ID for $65 (6+ members) | After creating prices in Stripe |

---

## Security & Compliance Notes

- **NEVER** store raw card numbers or CVVs — Stripe handles all card data
- **NEVER** log the `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET`
- **ALWAYS** verify the webhook signature before processing events
- **ALWAYS** use test mode (`sk_test_*`) for development/staging
- Live keys (`sk_live_*`) only in production Vercel environment
- Stripe webhook events can arrive multiple times — all handlers must be idempotent
- Store `stripe_payment_intent_id` on `translation_orders` for deduplication

---

## What NOT to Do Yet

- Do NOT create a Stripe account or products until prerequisites are met
- Do NOT add real live API keys to any environment
- Do NOT implement recurring subscriptions (not planned)
- Do NOT implement refund logic in code yet (handle manually via Stripe dashboard)
- Do NOT expose Stripe secret key to any client-side code

---

## Database Changes Needed (when implementing)

Add to `translation_orders` table:
```sql
ALTER TABLE translation_orders ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;
ALTER TABLE translation_orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
ALTER TABLE translation_orders ADD COLUMN IF NOT EXISTS amount_paid_cents integer;
ALTER TABLE translation_orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;
```

---

## Implementation Stage

**Stage 4** — after Stage 3 (current) is proven in production.
Estimated: after 30+ real translation orders processed without issues.
