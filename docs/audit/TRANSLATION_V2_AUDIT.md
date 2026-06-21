# TRANSLATION_V2_AUDIT — Audit Agent 1

Compare PR #119 `origin/architecture/translation-operator-canonical-v2` (head `96a543c`, "FROZEN") vs main `02eb595`.
Method: `git diff main...origin/...v2 --stat`, `git show` on both branches, real Supabase MCP.

## Branch position (re-verified)

- V2 forked from `bd98667` (#118), is **6 commits ahead, 13 commits behind main**. It does NOT contain PR #120 (PII containment), #121-#123 (release-state), **#122 (legacy translation operator-auth + Stripe recipient re-verification)**, or #124-#133 (V1 ledger stack).
- V2 last commit `96a543c` = "FREEZE PR #119 — full live DB invariants 9/9 PASS + security review PASS; Stripe E2E deferred". **These PASS claims are UNVERIFIED** (see below).
- RELEASE_STATE.yaml:36-41 marks #119 `state: OPEN, draft: true, frozen: true`.

## What V2 adds (51 files, +7801/-60) — all NEW files, NONE on main

| V2 artifact | Purpose | On main? | Status |
|---|---|---|---|
| `lib/translation/orders/index.ts` (694) | Orders data model / state machine | NO | CODE_ONLY |
| `lib/translation/orders/handleVerifiedPayment.ts` (345) | Stripe-verified payment → create canonical-bound order | NO | CODE_ONLY |
| `lib/translation/orders/renderFromCanonical.ts` (178) | Render artifact from canonical doc | NO | CODE_ONLY |
| `lib/translation/lifecycle.ts` (182) | Order lifecycle/state transitions | NO | CODE_ONLY |
| `lib/translation/observability/events.ts` (303) | PII-free event taxonomy | NO | CODE_ONLY |
| `lib/auth/requireTranslationOperator.ts` (63) | Operator auth (ADMIN_SECRET cookie) | NO (but main has equivalent — see conflict) | DUPLICATE |
| `app/api/translation/submit-order/route.ts` (+266) | Rewrites submit-order to V2 orders | MODIFIES main's 125-ln file | CONFLICT |
| `lib/stripe/verifyPayment.ts` (+13), `lib/email/resend.ts` (+69) | extend | MODIFIES main | CONFLICT (both changed on main since fork) |
| migrations `20260614000001-4` | translation_orders_v2, artifacts/outbox/security, sentinel-guard, stripe_processed_events | **NOT in main's migration files** | see DB DRIFT below |
| 11 runbooks + 3 observability docs | ops docs | NO | docs-only |

## DB DRIFT — CRITICAL (P1)

The V2 tables **already exist in the production database** but their migration `.sql` files are **NOT in main**:

| Table (live, 0 rows) | Migration applied to prod DB | In main `supabase/migrations/`? |
|---|---|---|
| `translation_orders_v2` | `20260614005529 translation_orders_v2_and_state_machine` | **NO** |
| `document_artifacts`, `delivery_outbox` | `20260614005615 translation_artifacts_outbox_and_security` | **NO** |
| (canonical sentinel widen) | `20260614005650 widen_canonical_guards_for_phase2_sentinel` | **NO** |
| `stripe_processed_events` | `20260614032529 stripe_processed_events` | **NO** (table exists, 0 rows) |

Verified: `mcp list_migrations` shows these 4 versions APPLIED; `git ls-files '*.sql'` on main shows the latest migration is `20260614010000_wizard_drafts` — the four V2 migrations are absent from main and present only in the unmerged #119 diff.

**Root cause:** The V2 migrations were applied directly to the production Supabase project (likely to run the "phase2DataModel.live.test.ts" / "9/9 invariants live" checks) from the draft branch, but the corresponding code + migration files were never merged to main. **Production schema is now ahead of `main` by 4 migrations whose definitions live only in a frozen draft PR.** This is a schema/code-of-record divergence and a rollback hazard: anyone reconstructing prod from main migrations would NOT get these tables; the `widen_canonical_guards_for_phase2_sentinel` migration even alters canonical guards that the LIVE canonical persistence depends on.

## "9/9 invariants PASS" / "security review PASS" — UNVERIFIED

- `phase2DataModel.live.test.ts` and `phase2OrdersInvariants.live.test.ts` are `.live.test` files → they hit the real DB and are NOT part of the default CI suite; they require the prod tables (which is why the migrations were applied out-of-band). Their PASS is self-reported on the frozen branch, not reproducible from main.
- `translation_orders_v2`=0 rows, `document_artifacts`=0, `delivery_outbox`=0, `stripe_processed_events`=0 → **the V2 pipeline has NEVER processed a real order.** "proven" = schema-shape only.

## Already in main (do NOT re-transplant)

- **Operator auth is already live on main** via `requireAdminAuth` (ADMIN_SECRET cookie) on `admin/manual-review/[ticketId]/transition` and PR #122's per-action auth + Stripe recipient re-verification on the legacy delivery path. V2's `requireTranslationOperator.ts` is a SECOND implementation of the same ADMIN_SECRET-cookie check → **DUPLICATE, do not transplant as-is; consolidate onto the main `requireAdminAuth` already deployed.**
- The Stripe-verified recipient hardening (#122) is on main but NOT on the V2 branch → if #119 is ever merged via its own submit-order rewrite, it could REGRESS the #122 security fix. Must rebase.

## Legacy translation prod flow as it runs TODAY (re-verified live)

`submit-order/route.ts` (main, 125 ln): `verifyStripeSessionPaid(checkoutId, {expectedService:'translation'})` (:55) → insert `manual_review_queue` (5 rows) with `reasons:['operator_review_paid']` → emit `manual_review_queued` event → `sendEmail` order-received template (:110). Operator then works the ticket in `/admin/manual-review` (auth: ADMIN_SECRET) and manually emails the finished PDF. DB: `translation_orders`=2, `translation_payments`=1, `manual_review_queue`=5, `user_corrections`=10. **Status: PROVEN_PRODUCTION (manual operator flow), positive paid auto-delivery RUNTIME_UNVERIFIED (RELEASE_STATE:47).**

## Recommendation per V2 component

- **must-rebase-before-anything:** V2 is 13 commits stale and missing the #122 security fix → merging as-is REGRESSES live security. Rebase onto `02eb595` first.
- **must-reconcile DB drift (P1):** Either (a) merge #119 (bringing the 4 migration files into main so code-of-record matches prod), or (b) if #119 stays frozen, BACK-PORT just the 4 migration `.sql` files into main so `main` describes the real prod schema. Current state (prod ahead of main, definitions only in a frozen draft) is unsafe.
- **delete/consolidate:** `requireTranslationOperator.ts` → fold into existing `requireAdminAuth`.
- **transplant (if V2 productized):** orders/state-machine + outbox is a genuine improvement over manual email, but it is CODE_ONLY with 0 real orders — needs Stripe-test E2E on staging before it can replace the working manual flow.
- **do NOT touch #119 per mandate** — audited only.

P0: 0. P1: 2 (DB schema/code drift from out-of-band migration; #119-as-is would regress #122 security).
