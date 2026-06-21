# PAYMENT / REFUND / LEGACY-GATE CONTRACT (P0 design lock)

Date: 2026-06-10
Status: DRAFT — requires owner business/legal decision before code.
Backs: `generate-pdf/route.ts` (payment gate, pre-payment review check, confirmed-value guard).

## The risk this addresses

We changed the output door this session:
1. pre-payment 400 `fields_require_review` (blocks BEFORE Stripe charge),
2. always-on confirmed-value guard (blocks Cyrillic/garbage in critical fields).

This creates **in-flight edge cases**: a user on an old front-end, or a session
that paid before the new gate, can now hit a 403 AFTER payment. Stripe supports
refunds, but **when** we refund is a business decision we must define, not improvise.

## Current ordering (implemented, verified)

```
1. parse payload
2. pre-payment review check → 400 if any field review_required  (BEFORE charge)
3. payment gate → 402 if Stripe session not paid
4. reviewGate → 403 if signer/checkboxes/signature missing or OCR review unresolved
5. confirmed-value guard (ALWAYS ON) → 403 if critical release value is a defect
6. OCR_FIELD_SAFETY machine-read gate (flag OFF in prod) → 403 if unresolved critical
7. render PDF (reads finalValue-first)
```

Charge happens at step 3. Steps 4–6 can still block AFTER a charge.

## [OWNER DECISION] required policy

For a user who **already paid** and then hits a 403 at steps 4–6:

- **DO NOT** silently fail (current behavior shows an alert with the error string — acceptable short term, not a policy).
- Show the blocked reason + which field (name only).
- Allow correction/review and retry (the same Stripe session is reusable — verify `verifyStripeSessionPaid` is idempotent and the session id persists for retry).
- If generation is impossible because a critical `finalValue` is null after correction attempts, choose ONE:
  - **Option A** — manual support review (human fixes/contacts user).
  - **Option B** — refund request flow (Stripe refund; define the trigger + who approves).
  - **Option C** — admin override with audit event (ADR-019), PDF marks the value user-confirmed.

Owner must pick the default and the escalation order.

## [OWNER DECISION] legacy front-end

The old wizard build may post payloads without the new fields. Decide:
- grace window where old payloads still generate (with a logged warning), OR
- hard cutover with a "please refresh" message.

## Non-negotiable invariants (locked)

- A charge must never produce a certified PDF containing a critical field that
  failed the guard. Blocking after charge is acceptable; releasing a defect is not.
- No PII in any blocked response (field names + reason codes only).
- Refund logic, when added, must reuse `lib/stripe/verifyPayment.ts` patterns — no
  ad-hoc Stripe calls.

## What is NOT decided here

Refund amounts, partial refunds, and SLA for support review are owner/legal calls.
No refund code is written until the policy above is approved.
