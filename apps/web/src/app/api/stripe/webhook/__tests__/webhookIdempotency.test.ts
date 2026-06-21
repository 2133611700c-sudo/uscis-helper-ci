/**
 * webhookIdempotency.test.ts — security regression for #184 (webhook replay).
 *
 * Stripe delivers webhooks at-least-once. The handler claims each event id in the
 * append-only ledger (record_stripe_processed_event) BEFORE processing:
 *   - first delivery (inserted=true)  → process (audit row written), 200
 *   - duplicate    (inserted=false)   → no-op, 200 { duplicate: true }, NO audit
 *   - ledger unavailable              → log + process (no dedup), 200 — never
 *                                       stalls webhooks if the migration lags
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  event: { id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1', metadata: {}, customer_details: null } } } as unknown,
  rpcResult: { data: [{ inserted: true }], error: null } as { data: unknown; error: { message: string } | null },
  fromCalls: [] as string[],
  rpcCalls: [] as unknown[],
}))

vi.mock('next/server', async (orig) => {
  const actual = await orig<typeof import('next/server')>()
  return { ...actual, after: (cb: () => unknown) => { void cb() } }
})
vi.mock('@/lib/stripe/client', () => ({
  stripe: { webhooks: { constructEvent: vi.fn(() => h.event) } },
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => {
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
      insert: () => Promise.resolve({ error: null }),
      update: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: () => builder,
      then: (res: (v: { error: null }) => unknown) => res({ error: null }),
    })
    return {
      rpc: (...a: unknown[]) => { h.rpcCalls.push(a); return Promise.resolve(h.rpcResult) },
      from: (t: string) => { h.fromCalls.push(t); return builder },
    }
  },
}))

import { POST } from '../route'

function whReq(): Request {
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 't=1,v1=deadbeef', 'content-type': 'application/json' },
    body: '{}',
  })
}

describe('#184 — Stripe webhook idempotency', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
    h.fromCalls = []; h.rpcCalls = []
    h.event = { id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1', metadata: { service: 're-parole-u4u', wizard_session_id: 'w1' }, customer_details: null } } }
  })

  it('first delivery (inserted=true) → 200, claims the event and processes', async () => {
    h.rpcResult = { data: [{ inserted: true }], error: null }
    const res = await POST(whReq() as never)
    expect(res.status).toBe(200)
    const body = await res.json() as { received?: boolean; duplicate?: boolean }
    expect(body.received).toBe(true)
    expect(body.duplicate).toBeUndefined()
    // claimed exactly once with the event id
    expect(h.rpcCalls).toHaveLength(1)
    expect((h.rpcCalls[0] as unknown[])[0]).toBe('record_stripe_processed_event')
    // processing ran (audit row written)
    expect(h.fromCalls).toContain('audit_log')
  })

  it('duplicate delivery (inserted=false) → 200 duplicate, NO processing', async () => {
    h.rpcResult = { data: [{ inserted: false }], error: null }
    const res = await POST(whReq() as never)
    expect(res.status).toBe(200)
    const body = await res.json() as { received?: boolean; duplicate?: boolean }
    expect(body.duplicate).toBe(true)
    expect(h.fromCalls).toHaveLength(0) // no audit, no downstream writes
  })

  it('ledger unavailable → 200 + processes WITHOUT dedup (never stalls webhooks)', async () => {
    h.rpcResult = { data: null, error: { message: 'ledger down' } }
    const res = await POST(whReq() as never)
    expect(res.status).toBe(200)
    const body = await res.json() as { received?: boolean; duplicate?: boolean }
    expect(body.received).toBe(true)
    expect(body.duplicate).toBeUndefined()
    expect(h.fromCalls).toContain('audit_log') // fell through to processing
  })
})
