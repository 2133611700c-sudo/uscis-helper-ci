# P001 — Operator Notes

**Pilot user ID:** P001  
**Date:** 2026-05-09

---

## Pre-send Checklist

- [x] Production deployment READY: `dpl_3ciMbuxavU6WVb4KjdRhTw4qVLRS`
- [x] Deployed commit matches main: `6ef8437` (updated 2026-05-09)
- [x] TypeScript: 0 errors
- [x] Tests: 325/325 pass
- [x] Build: exit 0
- [x] Content guard: 0 violations
- [x] User message EN prepared: `P001_USER_MESSAGE_EN.txt`
- [x] User message RU prepared: `P001_USER_MESSAGE_RU.txt`
- [ ] User message sent to P001
- [ ] P001 acknowledged instructions

---

## Payment Mode Decision

**🚨 BLOCKER — DO NOT SEND P001 LINK UNTIL THIS IS RESOLVED**

Stripe is in **LIVE mode** (`cs_live_` prefix confirmed in prior smoke test).  
Real money will be charged to P001 unless one of the options below is implemented first.

### Options (choose exactly one before sending):

| Option | How to implement | Risk |
|--------|-----------------|------|
| **A — Stripe 100% coupon** | Create coupon in Stripe dashboard → Products → Coupons. Set 100% off, single-use. Add coupon code to user message. | LOW — Stripe handles it cleanly |
| **B — DB override** | Set `payment_confirmed = true` in `extraction_runs` for P001's session after upload. Requires operator to watch for session creation and patch DB. | MEDIUM — manual, timing-dependent |
| **C — P001 pays real money** | No change needed. Inform P001 they will be charged the real price (e.g. $24.99 or applicable plan). Update user message with price. | HIGH — pilot user pays real money |
| **D — Switch to Stripe TEST mode** | Change `STRIPE_SECRET_KEY` env var in Vercel to `sk_test_...` and redeploy. P001 uses test card `4242 4242 4242 4242`. | MEDIUM — requires redeployment |

### Status: ✅ DECIDED — Option A

payment_mode: Option A — Stripe 100% coupon
payment_decision_by: Operator
date: 2026-05-09
notes: No real charge for P001. First controlled pilot. Manual PDF QA required before delivery. Coupon must be created in Stripe dashboard before sending link. Stripe remains LIVE — do not send link until coupon is confirmed active.
risk: LOW — Stripe handles cleanly; coupon is single-use; real checkout path is tested without charging user.

**⚠️ REMAINING BLOCKER: Create the Stripe 100% coupon in dashboard before sending link.**
Steps:
1. Go to Stripe Dashboard → Products → Coupons → Create
2. Set: 100% off, Duration = once, Redemption limit = 1
3. Copy coupon code
4. Add to user message (replace placeholder in P001_USER_MESSAGE_EN.txt and P001_USER_MESSAGE_RU.txt)
5. Send link to P001

---

## Issue Log

| Date | Issue | Action | Resolved |
|---|---|---|---|
| 2026-05-09 | awaiting_upload | Prepared messages, waiting for P001 | no |

---

## Rules

- Do not enter real names, passport numbers, or dates in this file.
- Do not share this file with P001.
- Update this file after each significant event.
