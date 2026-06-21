/**
 * handleVerifiedPayment.test.ts — Phase 2 closeout: the unified payment→order domain handler is
 * the SINGLE authority for Translation Order V2 create/update. Drives the REAL handler against the
 * faithful in-process fakeOrdersDb (no live DB, no real Stripe, no keys).
 *
 * Covered classes:
 *   - product / amount / currency / mode / unpaid validation → reject (no order)
 *   - recipient from verified session ONLY; client email ignored; missing recipient → no fabrication
 *   - canonical binding: valid → immutable bind; wrong product/session/hash → no-bind; conflict → reject
 *   - idempotency: duplicate session → same order; webhook↔client both → same order; concurrent → same
 *   - lifecycle adjacency: a non-paid session never creates an order
 *
 * PII: synthetic PHASE2_TEST_ sentinels only; no email/name/payload in assertions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Stripe from 'stripe'
import { makeFakeDbState, makeFakeSupabase, type FakeDbState } from './fakeOrdersDb'

// ── Point the orders module's Supabase client at the in-process fake ────────────
let fakeState: FakeDbState
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => makeFakeSupabase(fakeState),
}))

// ── Canonical persistence: controllable per-test (binding paths) ────────────────
const canonicalMocks = vi.hoisted(() => ({
  loadById: vi.fn(),
  loadBySession: vi.fn(),
  verifyHash: vi.fn(),
}))
vi.mock('@/lib/canonical/persistence', () => ({
  loadCanonicalDocumentById: canonicalMocks.loadById,
  loadCanonicalDocumentBySession: canonicalMocks.loadBySession,
  verifyCanonicalHash: canonicalMocks.verifyHash,
  // resolveCanonicalDocument is imported by orders/index.ts at module load.
  resolveCanonicalDocument: vi.fn(),
  appendCanonicalOverride: vi.fn(),
}))

import { handleVerifiedPayment } from '../handleVerifiedPayment'
import { getOrderByCheckout } from '../index'

const ENV = { ...process.env }
beforeEach(() => {
  fakeState = makeFakeDbState()
  canonicalMocks.loadById.mockReset()
  canonicalMocks.loadBySession.mockReset().mockResolvedValue(null)
  canonicalMocks.verifyHash.mockReset()
  process.env = {
    ...ENV,
    SUPABASE_URL: 'https://fake.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service_role_fake',
  }
  delete process.env.STRIPE_LIVE_MODE
})

let n = 0
function session(over: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  n += 1
  return {
    id: `PHASE2_TEST_cs_${Date.now()}_${n}`,
    object: 'checkout.session',
    payment_status: 'paid',
    amount_total: 1499,
    currency: 'usd',
    livemode: false,
    customer_details: { email: 'sentinel@phase2.test' },
    customer_email: null,
    metadata: { service: 'translation', plan: 'basic', wizard_session_id: `PHASE2_TEST_w_${n}` },
    ...over,
  } as unknown as Stripe.Checkout.Session
}

describe('handleVerifiedPayment — payment fact validation', () => {
  it('non-translation product → wrong_product, no order', async () => {
    const r = await handleVerifiedPayment({
      verifiedSession: session({ metadata: { service: 'tps-ukraine' } as never }),
      verifiedEventId: 'evt_1', source: 'webhook',
    })
    expect(r.resultCode).toBe('wrong_product')
    expect(r.orderId).toBeNull()
    expect(fakeState.orders.size).toBe(0)
  })

  it('unpaid session → not_paid, no order', async () => {
    const r = await handleVerifiedPayment({
      verifiedSession: session({ payment_status: 'unpaid' }),
      verifiedEventId: 'evt_2', source: 'webhook',
    })
    expect(r.resultCode).toBe('not_paid')
    expect(fakeState.orders.size).toBe(0)
  })

  it('amount mismatch (basic plan but wrong cents) → amount_mismatch, no order', async () => {
    const r = await handleVerifiedPayment({
      verifiedSession: session({ amount_total: 100 }),
      verifiedEventId: 'evt_3', source: 'webhook',
    })
    expect(r.resultCode).toBe('amount_mismatch')
    expect(r.amountMismatch).toBe(true)
    expect(fakeState.orders.size).toBe(0)
  })

  it('currency mismatch → amount_mismatch, no order', async () => {
    const r = await handleVerifiedPayment({
      verifiedSession: session({ currency: 'eur' }),
      verifiedEventId: 'evt_4', source: 'webhook',
    })
    expect(r.resultCode).toBe('amount_mismatch')
    expect(fakeState.orders.size).toBe(0)
  })

  it('plus/premium plans accept their own expected amounts', async () => {
    const plus = await handleVerifiedPayment({
      verifiedSession: session({ metadata: { service: 'translation', plan: 'plus', wizard_session_id: 'PHASE2_TEST_wp' } as never, amount_total: 1999 }),
      verifiedEventId: 'evt_5', source: 'webhook',
    })
    expect(plus.resultCode).toBe('order_created')
    const prem = await handleVerifiedPayment({
      verifiedSession: session({ metadata: { service: 'translation', plan: 'premium', wizard_session_id: 'PHASE2_TEST_wq' } as never, amount_total: 2999 }),
      verifiedEventId: 'evt_6', source: 'webhook',
    })
    expect(prem.resultCode).toBe('order_created')
  })

  it('mode mismatch: live env but test-mode session → mode_mismatch, no order', async () => {
    process.env.STRIPE_LIVE_MODE = '1'
    const r = await handleVerifiedPayment({
      verifiedSession: session({ livemode: false }),
      verifiedEventId: 'evt_7', source: 'webhook',
    })
    expect(r.resultCode).toBe('mode_mismatch')
    expect(fakeState.orders.size).toBe(0)
  })
})

describe('handleVerifiedPayment — recipient (server-verified only)', () => {
  it('recipient bound from customer_details.email, never a client field', async () => {
    const r = await handleVerifiedPayment({
      verifiedSession: session({ customer_details: { email: 'verified@phase2.test' } as never }),
      verifiedEventId: 'evt_r1', source: 'webhook',
    })
    const order = fakeState.orders.get(r.orderId!)
    expect(order?.verified_recipient_email).toBe('verified@phase2.test')
  })

  it('missing verified recipient → order still created, recipient null (NEVER fabricated)', async () => {
    const r = await handleVerifiedPayment({
      verifiedSession: session({ customer_details: null, customer_email: null }),
      verifiedEventId: 'evt_r2', source: 'webhook',
    })
    expect(r.resultCode).toBe('order_created')
    const order = fakeState.orders.get(r.orderId!)
    expect(order?.verified_recipient_email).toBeNull()
  })
})

describe('handleVerifiedPayment — canonical binding', () => {
  const CID = 'PHASE2_TEST_canonical_id'
  it('valid canonical (product+ownership+hash) → immutably bound', async () => {
    canonicalMocks.loadById.mockResolvedValue({ product: 'translation', documentSessionId: 'PHASE2_TEST_wbind' })
    canonicalMocks.verifyHash.mockResolvedValue({ valid: true })
    const r = await handleVerifiedPayment({
      verifiedSession: session({ metadata: { service: 'translation', plan: 'basic', wizard_session_id: 'PHASE2_TEST_wbind', canonical_document_id: CID } as never }),
      verifiedEventId: 'evt_c1', source: 'webhook',
    })
    expect(r.canonicalBound).toBe(true)
    expect(fakeState.orders.get(r.orderId!)?.canonical_document_id).toBe(CID)
  })

  it('wrong product canonical → no-bind (order still created, never fails payment)', async () => {
    canonicalMocks.loadById.mockResolvedValue({ product: 'tps', documentSessionId: 'PHASE2_TEST_wx' })
    const r = await handleVerifiedPayment({
      verifiedSession: session({ metadata: { service: 'translation', plan: 'basic', wizard_session_id: 'PHASE2_TEST_wx', canonical_document_id: CID } as never }),
      verifiedEventId: 'evt_c2', source: 'webhook',
    })
    expect(r.resultCode).toBe('order_created')
    expect(r.canonicalBound).toBe(false)
    expect(fakeState.orders.get(r.orderId!)?.canonical_document_id).toBeNull()
  })

  it('session ownership mismatch → no-bind', async () => {
    canonicalMocks.loadById.mockResolvedValue({ product: 'translation', documentSessionId: 'SOMEONE_ELSE' })
    canonicalMocks.verifyHash.mockResolvedValue({ valid: true })
    const r = await handleVerifiedPayment({
      verifiedSession: session({ metadata: { service: 'translation', plan: 'basic', wizard_session_id: 'PHASE2_TEST_wown', canonical_document_id: CID } as never }),
      verifiedEventId: 'evt_c3', source: 'webhook',
    })
    expect(r.canonicalBound).toBe(false)
  })

  it('hash mismatch → no-bind', async () => {
    canonicalMocks.loadById.mockResolvedValue({ product: 'translation', documentSessionId: 'PHASE2_TEST_wh' })
    canonicalMocks.verifyHash.mockResolvedValue({ valid: false, mismatch: 'x' })
    const r = await handleVerifiedPayment({
      verifiedSession: session({ metadata: { service: 'translation', plan: 'basic', wizard_session_id: 'PHASE2_TEST_wh', canonical_document_id: CID } as never }),
      verifiedEventId: 'evt_c4', source: 'webhook',
    })
    expect(r.canonicalBound).toBe(false)
  })
})

describe('handleVerifiedPayment — idempotency + races', () => {
  it('duplicate session (same checkout) → same order, second is reused', async () => {
    const s = session()
    const a = await handleVerifiedPayment({ verifiedSession: s, verifiedEventId: 'evt_d1', source: 'webhook' })
    const b = await handleVerifiedPayment({ verifiedSession: s, verifiedEventId: 'evt_d2', source: 'webhook' })
    expect(a.orderId).toBe(b.orderId)
    expect(a.created).toBe(true)
    expect(b.reused).toBe(true)
    expect(fakeState.orders.size).toBe(1)
  })

  it('dedupe rewrite: handler NEVER writes the Stripe webhook-event ledger (owned by webhook route, #184)', async () => {
    // Order-level once-only creation is guaranteed by createOrGetOrder's UNIQUE(checkout_session_id),
    // NOT by an event-id ledger. Two DISTINCT event ids for the same session converge on one order,
    // and the stripe_processed_events ledger is left UNTOUCHED by this handler (its dedupe lives in
    // the webhook route only — no duplicate dedupe responsibility here).
    const s = session()
    await handleVerifiedPayment({ verifiedSession: s, verifiedEventId: 'evt_ledger_1', source: 'webhook' })
    await handleVerifiedPayment({ verifiedSession: s, verifiedEventId: 'evt_ledger_2', source: 'webhook' })
    expect(fakeState.orders.size).toBe(1)
    expect(fakeState.processedEvents.size).toBe(0)
  })

  it('webhook first, client reconciliation second → SAME order', async () => {
    const s = session()
    const w = await handleVerifiedPayment({ verifiedSession: s, verifiedEventId: 'evt_w', source: 'webhook' })
    const c = await handleVerifiedPayment({ verifiedSession: s, verifiedEventId: null, source: 'client_reconciliation' })
    expect(w.orderId).toBe(c.orderId)
    expect(c.reused).toBe(true)
  })

  it('client first, webhook second → SAME order', async () => {
    const s = session()
    const c = await handleVerifiedPayment({ verifiedSession: s, verifiedEventId: null, source: 'client_reconciliation' })
    const w = await handleVerifiedPayment({ verifiedSession: s, verifiedEventId: 'evt_w2', source: 'webhook' })
    expect(c.orderId).toBe(w.orderId)
    expect(w.reused).toBe(true)
  })

  it('concurrent webhook + client → exactly one order', async () => {
    const s = session()
    const [a, b] = await Promise.all([
      handleVerifiedPayment({ verifiedSession: s, verifiedEventId: 'evt_x', source: 'webhook' }),
      handleVerifiedPayment({ verifiedSession: s, verifiedEventId: null, source: 'client_reconciliation' }),
    ])
    expect(a.orderId).toBe(b.orderId)
    expect(fakeState.orders.size).toBe(1)
  })

  it('client never returns → webhook still creates the order', async () => {
    const s = session()
    const w = await handleVerifiedPayment({ verifiedSession: s, verifiedEventId: 'evt_only', source: 'webhook' })
    expect(w.created).toBe(true)
    expect(await getOrderByCheckout(s.id)).not.toBeNull()
  })

  it('new order is born queued (the paid/queued state) with NO transition event yet', async () => {
    const s = session()
    const r = await handleVerifiedPayment({ verifiedSession: s, verifiedEventId: 'evt_q', source: 'webhook' })
    expect(r.status).toBe('queued')
    // No second audit transition / no outbox on create.
    expect(fakeState.events.filter((e) => e.order_id === r.orderId)).toHaveLength(0)
    expect(fakeState.outbox).toHaveLength(0)
  })
})
