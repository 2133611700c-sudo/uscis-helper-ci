/**
 * webhookV2OrderWiring.test.ts — #195 W5: the webhook creates the durable V2
 * translation order (handleVerifiedPayment) for a paid translation checkout,
 * LAYERED on the #184 event-dedupe (single ledger). Non-translation events do
 * not invoke it; a V2 failure never fails the webhook (Stripe would retry).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  event: {} as unknown,
  pending: [] as Promise<unknown>[],
  hvp: vi.fn(async (_input: { source: string; verifiedEventId: string | null; verifiedSession: { id: string } }) => ({ orderId: 'o1', created: true, reused: false, status: 'queued', resultCode: 'order_created' })),
}))

vi.mock('next/server', async (orig) => {
  const actual = await orig<typeof import('next/server')>()
  return { ...actual, after: (cb: () => unknown) => { h.pending.push((async () => cb())()) } }
})
vi.mock('@/lib/stripe/client', () => ({ stripe: { webhooks: { constructEvent: vi.fn(() => h.event) } } }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => {
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      insert: () => Promise.resolve({ error: null }),
      update: () => b, eq: () => b, order: () => b, limit: () => b,
      then: (res: (v: { error: null }) => unknown) => res({ error: null }),
    })
    return { rpc: () => Promise.resolve({ data: [{ inserted: true }], error: null }), from: () => b }
  },
}))
vi.mock('@/lib/translation/orders/handleVerifiedPayment', () => ({ handleVerifiedPayment: h.hvp }))

import { POST } from '../route'

function whReq(): Request {
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 't=1,v1=x', 'content-type': 'application/json' },
    body: '{}',
  })
}
async function deliver() { await POST(whReq() as never); await Promise.all(h.pending); h.pending = [] }

describe('#195 W5 — webhook wires the durable V2 translation order', () => {
  beforeEach(() => { vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test'); h.hvp.mockClear(); h.pending = [] })

  it('paid translation checkout → handleVerifiedPayment({source:webhook, verifiedEventId})', async () => {
    h.event = { id: 'evt_tr', type: 'checkout.session.completed', data: { object: { id: 'cs_tr', metadata: { service: 'translation', plan: 'basic' }, customer_details: { email: 'u@x.io' }, amount_total: 1499 } } }
    await deliver()
    expect(h.hvp).toHaveBeenCalledTimes(1)
    const arg = h.hvp.mock.calls[0][0]
    expect(arg.source).toBe('webhook')
    expect(arg.verifiedEventId).toBe('evt_tr')
    expect(arg.verifiedSession.id).toBe('cs_tr')
  })

  it('non-translation checkout → V2 handler NOT invoked', async () => {
    h.event = { id: 'evt_rp', type: 'checkout.session.completed', data: { object: { id: 'cs_rp', metadata: { service: 're-parole-u4u', wizard_session_id: 'w1' }, customer_details: null } } }
    await deliver()
    expect(h.hvp).not.toHaveBeenCalled()
  })

  it('a V2 handler throw never fails the webhook (200, Stripe would retry on real errors)', async () => {
    h.hvp.mockRejectedValueOnce(new Error('db down'))
    h.event = { id: 'evt_tr2', type: 'checkout.session.completed', data: { object: { id: 'cs_tr2', metadata: { service: 'translation', plan: 'basic' }, customer_details: { email: 'u@x.io' }, amount_total: 1499 } } }
    const res = await POST(whReq() as never)
    await Promise.all(h.pending); h.pending = []
    expect(res.status).toBe(200)
  })
})
