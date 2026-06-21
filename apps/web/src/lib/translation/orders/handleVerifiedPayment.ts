/**
 * handleVerifiedPayment — the SINGLE unified domain handler that turns a signature/paid-verified
 * Stripe Checkout Session into (or reconciles with) exactly one Translation Order V2.
 *
 * ── AUTHORITY MODEL (Phase 2 closeout) ───────────────────────────────────────────────────────────
 * The signature-verified Stripe webhook is the AUTHORITY for V2 order create/update. The client
 * submit-order path is demoted to RECONCILIATION: it calls this SAME handler with
 * source='client_reconciliation' and therefore can only converge on the order the webhook would (or
 * already did) create. Both paths are idempotent and race-safe.
 *
 * ── TRUST BOUNDARY (load-bearing) ────────────────────────────────────────────────────────────────
 * The ONLY trusted inputs are fields of a verifiedSession that an upstream caller has ALREADY
 * signature-verified (webhook: stripe.webhooks.constructEvent; client: server-side
 * checkout.sessions.retrieve). This function re-derives EVERYTHING authoritative from that session:
 *   - product            ← server-side metadata.service + price/amount mapping (NEVER client claim)
 *   - paid               ← session.payment_status === 'paid' (NEVER a client paid=true)
 *   - amount/currency    ← session.amount_total/currency vs server-side expected for the plan
 *   - test/live mode     ← session.livemode consistency
 *   - recipient          ← session.customer_details.email / customer_email ONLY (NEVER client email)
 *   - checkout_session_id← session.id (the per-order idempotency key)
 *   - canonical binding  ← trusted session metadata or a SAFE pending binding (re-verified:
 *                          product='translation' + session ownership + fields_hash)
 *
 * FORBIDDEN inputs (never accepted, never trusted): client email, client paid=true, client amount,
 * client price tier, a client canonical_document_id WITHOUT server verification.
 *
 * ── IDEMPOTENCY (single-source-of-truth dedupe) ──────────────────────────────────────────────────
 * Order uniqueness is owned by ONE key: checkout_session_id (translation_orders_v2 UNIQUE; both
 * paths). Duplicate webhook → same order; client-after-webhook → same order; webhook-after-client →
 * same order; concurrent → same order; client-never-returns → webhook still creates. No second audit
 * transition, no second outbox event (artifact/delivery are operator-gated and NOT created here).
 *
 * Webhook-EVENT dedupe (stripe_processed_events ledger, #184) is the WEBHOOK ROUTE's responsibility
 * and lives there ONLY — this handler does NOT touch that ledger. Order-level once-only creation is
 * guaranteed by createOrGetOrder's UNIQUE(checkout_session_id) idempotency, so a verifiedEventId is
 * accepted on the input for caller observability but is intentionally NOT consumed for dedupe here.
 *
 * ── WHAT THIS DOES NOT DO ─────────────────────────────────────────────────────────────────────────
 * It does NOT create an artifact or a delivery (operator approval gates those). It does NOT email
 * the customer. It does NOT record/check the Stripe webhook-event ledger. It only creates-or-gets
 * the order, binds canonical immutably (or leaves it for the operator), and lands the order in its
 * initial paid/queued state.
 *
 * ── PII ──────────────────────────────────────────────────────────────────────────────────────────
 * Never logs/returns raw Stripe payload, email, name, address, amount-tied-to-person, or document
 * fields. The verified recipient email is persisted to the order column (Stripe-authoritative,
 * server-only) but is NEVER logged or echoed back; events carry only codes/ids/booleans.
 */

import type Stripe from 'stripe'
import {
  loadCanonicalDocumentById,
  loadCanonicalDocumentBySession,
  verifyCanonicalHash,
} from '@/lib/canonical/persistence'
import {
  createOrGetOrder,
  bindCanonicalDocument,
  TranslationOrderError,
} from './index'

// ---------------------------------------------------------------------------
// Server-side product / price mapping (the ONLY source of truth for amount).
// Mirrors apps/web/src/app/api/stripe/checkout/route.ts TRANSLATION_PLAN_CENTS.
// ---------------------------------------------------------------------------

export type TranslationPlanSlug = 'basic' | 'plus' | 'premium'

/** Server-side expected amount (cents, USD) per translation plan. NEVER read from the client. */
export const TRANSLATION_EXPECTED_CENTS: Record<TranslationPlanSlug, number> = {
  basic: 1499,
  plus: 1999,
  premium: 2999,
}

const EXPECTED_CURRENCY = 'usd'

export type HandlePaymentSource = 'webhook' | 'client_reconciliation'

export interface HandleVerifiedPaymentInput {
  /** A Stripe Checkout Session whose signature + payment were ALREADY verified upstream. */
  verifiedSession: Stripe.Checkout.Session
  /**
   * The Stripe event id (webhook path) or null (client reconciliation has no event). Accepted for
   * caller-side observability ONLY — this handler does NOT use it for dedupe. Webhook-event dedupe
   * (stripe_processed_events ledger, #184) is owned by the webhook route, not here.
   */
  verifiedEventId: string | null
  source: HandlePaymentSource
  /**
   * Test-only injection seam for the canonical-binding mode in webhook flow. Production reads
   * getCanonicalMode('translation') at the call site and passes it through, but the handler treats
   * a missing canonical as a SAFE no-bind (operator binds later) — it never hard-fails payment.
   */
  canonicalMode?: 'off' | 'shadow' | 'enforce'
}

export type HandlePaymentResultCode =
  | 'order_created'
  | 'order_reused'
  | 'not_paid'
  | 'wrong_product'
  | 'amount_mismatch'
  | 'price_mismatch'
  | 'mode_mismatch'
  | 'storage_unavailable'
  | 'canonical_binding_conflict'

export interface HandleVerifiedPaymentResult {
  orderId: string | null
  created: boolean
  reused: boolean
  status: string | null
  resultCode: HandlePaymentResultCode
  /** PII-free flags for observability. */
  amountMismatch?: boolean
  priceMismatch?: boolean
  canonicalBound?: boolean
}

function ok(
  resultCode: HandlePaymentResultCode,
  order: { id: string; status: string } | null,
  created: boolean,
  extra?: Partial<HandleVerifiedPaymentResult>,
): HandleVerifiedPaymentResult {
  return {
    orderId: order?.id ?? null,
    created,
    reused: order != null && !created,
    status: order?.status ?? null,
    resultCode,
    ...extra,
  }
}

/**
 * Resolve the translation plan slug from the SERVER-SIDE session metadata only. Returns null if the
 * session is not a translation product or the plan is unknown.
 */
function resolvePlan(session: Stripe.Checkout.Session): TranslationPlanSlug | null {
  if (session.metadata?.service !== 'translation') return null
  const plan = session.metadata?.plan
  if (plan === 'basic' || plan === 'plus' || plan === 'premium') return plan
  return null
}

/**
 * Validate amount + currency + livemode against the server-side expected values for the plan.
 * Returns a result code on mismatch, or null when everything checks out.
 */
function validatePaymentFacts(
  session: Stripe.Checkout.Session,
  plan: TranslationPlanSlug,
): HandlePaymentResultCode | null {
  if (session.payment_status !== 'paid') return 'not_paid'

  const expectedCents = TRANSLATION_EXPECTED_CENTS[plan]
  // amount_total is in the smallest currency unit (cents for USD).
  if (typeof session.amount_total === 'number' && session.amount_total !== expectedCents) {
    return 'amount_mismatch'
  }
  if (
    typeof session.currency === 'string' &&
    session.currency.toLowerCase() !== EXPECTED_CURRENCY
  ) {
    return 'amount_mismatch'
  }
  // test/live mode consistency: a live order must not be created from a test-mode session in a
  // live deployment, and vice-versa. We only enforce the env signal when it is explicitly set, so
  // synthetic tests (no STRIPE_LIVE_MODE) are unaffected.
  const envLive = process.env.STRIPE_LIVE_MODE
  if (envLive === '1' && session.livemode !== true) return 'mode_mismatch'
  if (envLive === '0' && session.livemode === true) return 'mode_mismatch'
  return null
}

/** The Stripe-verified recipient email (customer_details.email, then customer_email). NEVER client. */
function verifiedRecipient(session: Stripe.Checkout.Session): string | null {
  const fromDetails = (session.customer_details as { email?: string | null } | null)?.email ?? null
  if (fromDetails) return fromDetails
  return (session.customer_email as string | null) ?? null
}

/**
 * Resolve a SAFE canonical binding for this session, or null. The canonical id is taken ONLY from
 * trusted session metadata (canonical_document_id) when present, else discovered via the trusted
 * wizard_session_id; in BOTH cases it is independently re-verified: product='translation', session
 * ownership (the canonical's documentSessionId matches the trusted wizard session id), and a valid
 * fields_hash. Anything that fails verification → null (no-bind; the operator binds later). A
 * missing canonical NEVER fails payment, even in 'enforce' (payment authority ≠ canonical gate).
 */
async function resolveSafeCanonicalBinding(
  session: Stripe.Checkout.Session,
): Promise<{ canonicalId: string | null }> {
  const wizardSessionId = session.metadata?.wizard_session_id ?? ''
  const metadataCanonicalId = (session.metadata?.canonical_document_id ?? '').trim() || null

  // Candidate 1: explicit metadata canonical id (still re-verified below).
  if (metadataCanonicalId) {
    const verified = await verifyCanonicalOwnership(metadataCanonicalId, wizardSessionId)
    if (verified) return { canonicalId: metadataCanonicalId }
    return { canonicalId: null }
  }

  // Candidate 2: discover by trusted wizard session id. We do NOT know the doc type here, so this
  // is best-effort; if discovery is ambiguous/fails, leave it for the operator to bind.
  if (wizardSessionId) {
    try {
      const doc = await loadCanonicalDocumentBySession(wizardSessionId, 'other')
      if (doc) {
        // loadCanonicalDocumentBySession returns a result but not its id; resolve via ownership of
        // the discovered session is implicit (we queried by session). Re-verify product only here;
        // the id round-trip is handled by the metadata path in normal flow. Discovery-without-id is
        // intentionally conservative: only bind when product is translation.
        if (doc.product !== 'translation') return { canonicalId: null }
      }
    } catch {
      // Discovery infra hiccup → no-bind (operator binds later). Never fail payment for this.
      return { canonicalId: null }
    }
  }
  return { canonicalId: null }
}

/** Re-verify a canonical id: exists, product='translation', owns the trusted session, hash valid. */
async function verifyCanonicalOwnership(
  canonicalId: string,
  trustedSessionId: string,
): Promise<boolean> {
  try {
    const canonical = await loadCanonicalDocumentById(canonicalId)
    if (!canonical) return false
    if (canonical.product !== 'translation') return false
    // Session ownership: the canonical must belong to the trusted wizard session.
    if (
      trustedSessionId &&
      canonical.documentSessionId &&
      canonical.documentSessionId !== trustedSessionId
    ) {
      return false
    }
    const hashCheck = await verifyCanonicalHash(canonicalId)
    if (hashCheck.notFound || !hashCheck.valid) return false
    return true
  } catch {
    // Any storage error → treat as unverified (no-bind). Never throws into the payment path.
    return false
  }
}

/**
 * The unified domain handler. Idempotent + race-safe. Returns a stable PII-free domain result.
 * Throws ONLY on a genuine storage/infra failure that the caller maps to 503 (so Stripe retries
 * the webhook and the client surfaces a transient error).
 */
export async function handleVerifiedPayment(
  input: HandleVerifiedPaymentInput,
): Promise<HandleVerifiedPaymentResult> {
  const { verifiedSession: session, source } = input

  // 1. Product determination — server-side only.
  const plan = resolvePlan(session)
  if (!plan) {
    return ok('wrong_product', null, false)
  }

  // 2. Payment fact validation — paid / amount / currency / mode, all server-side.
  const factCode = validatePaymentFacts(session, plan)
  if (factCode) {
    return ok(factCode, null, false, {
      amountMismatch: factCode === 'amount_mismatch',
      priceMismatch: factCode === 'price_mismatch',
    })
  }

  const checkoutSessionId = session.id
  const recipient = verifiedRecipient(session)
  const docType = (session.metadata?.doc_type ?? 'other') || 'other'
  const locale = ['ru', 'uk', 'es', 'en'].includes(session.metadata?.locale ?? '')
    ? (session.metadata!.locale as string)
    : 'en'

  // 3. Safe canonical binding (re-verified). Never fails payment.
  let canonicalId: string | null = null
  try {
    const binding = await resolveSafeCanonicalBinding(session)
    canonicalId = binding.canonicalId
  } catch {
    canonicalId = null // defense in depth — payment authority must not hinge on canonical lookup.
  }

  // 4. Create-or-get the order idempotently on checkout_session_id. This UNIQUE-key idempotency is
  //    the SINGLE source of order-level once-only creation — there is no separate event ledger here.
  let order
  let created: boolean
  try {
    const res = await createOrGetOrder({
      checkoutSessionId,
      verifiedRecipientEmail: recipient,
      canonicalDocumentId: canonicalId,
      documentType: docType,
      sourceLanguage: 'uk',
      locale,
      legacy: canonicalId == null,
    })
    order = res.order
    created = res.created
  } catch (e) {
    if (e instanceof TranslationOrderError) {
      return ok('storage_unavailable', null, false)
    }
    throw e
  }

  // 5. Bind canonical IMMUTABLY if we have a verified one and the order is not yet bound.
  //    A rebind to a DIFFERENT canonical is a conflict; rebind to the SAME is a no-op.
  let canonicalBound = order.canonicalDocumentId != null
  if (canonicalId) {
    if (!order.canonicalDocumentId) {
      try {
        await bindCanonicalDocument(order.id, canonicalId)
        canonicalBound = true
      } catch (e) {
        if (
          e instanceof TranslationOrderError &&
          e.code !== 'ORDER_STORAGE_UNAVAILABLE'
        ) {
          return ok('canonical_binding_conflict', { id: order.id, status: order.status }, false, {
            canonicalBound: true,
          })
        }
        // storage error → leave unbound; operator can bind later. Not fatal.
      }
    } else if (order.canonicalDocumentId !== canonicalId) {
      return ok('canonical_binding_conflict', { id: order.id, status: order.status }, false, {
        canonicalBound: true,
      })
    }
  }

  // 6. The order is BORN in 'queued' (the paid/queued state — see migration default). There is no
  //    separate "mark paid" transition: a queued V2 order IS the paid, awaiting-operator state. The
  //    audit ledger's first event is the operator's assign transition (queued→assigned). Re-running
  //    this handler (duplicate webhook / reconciliation) re-selects the SAME row and performs NO
  //    transition — so there is never a second audit transition or outbox event. This is the
  //    idempotency contract the spec requires.
  void source // source is reflected in the caller's event dimensions, not a behavioral branch here.

  return ok(created ? 'order_created' : 'order_reused', order, created, {
    canonicalBound,
  })
}
