/**
 * requirePaidPacketReplay.test.ts — #184 durable packet-token replay store.
 *
 * When Supabase is configured, the replay check consumes the token through the
 * durable `consume_stripe_packet_token` ledger (cross-instance). On ledger error
 * it falls back to the in-memory set (fail-open on the replay check only — the
 * user already paid).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  rpc: vi.fn(async (_fn: string, _args: unknown): Promise<{ data: Array<{ inserted: boolean }> | null; error: { message: string } | null }> => ({ data: [{ inserted: true }], error: null })),
  rpcCalls: [] as Array<[string, unknown]>,
}))

vi.mock('@/lib/ownerAccess', () => ({ isOwnerSession: vi.fn(async () => ({ verified: false })) }))
vi.mock('../verifyPayment', () => ({
  verifyStripeSessionPaid: vi.fn(async () => ({ paid: true, correctService: true, service: 'tps-ukraine', amountTotalCents: 5000, customerEmail: null })),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => ({
    rpc: (fn: string, args: unknown) => { h.rpcCalls.push([fn, args]); return h.rpc(fn, args) },
  }),
}))

import { requirePaidPacket, __resetConsumedStore } from '../requirePaidPacket'

function req(token: string): NextRequest {
  return new NextRequest('http://localhost/x', { method: 'POST', headers: { 'x-payment-token': token } })
}

describe('#184 — durable packet-token replay store', () => {
  beforeEach(() => {
    __resetConsumedStore()
    h.rpcCalls = []
    vi.stubEnv('SUPABASE_URL', 'http://localhost')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'svc')
    h.rpc.mockResolvedValue({ data: [{ inserted: true }], error: null })
  })

  it('first consume goes through the durable ledger and allows (ok)', async () => {
    const r = await requirePaidPacket({ req: req('cs_test_dur1'), product: 'tps-ukraine' })
    expect(r.ok).toBe(true)
    expect(h.rpcCalls[0][0]).toBe('consume_stripe_packet_token')
    expect(h.rpcCalls[0][1]).toMatchObject({ p_product: 'tps-ukraine', p_token: 'cs_test_dur1' })
  })

  it('ledger says inserted=false (already consumed) → replayed/403', async () => {
    h.rpc.mockResolvedValue({ data: [{ inserted: false }], error: null })
    const r = await requirePaidPacket({ req: req('cs_test_dur2'), product: 'tps-ukraine' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('replayed')
  })

  it('ledger error → falls back to in-memory (fail-open on replay; user already paid)', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'ledger down' } })
    const first = await requirePaidPacket({ req: req('cs_test_dur3'), product: 'tps-ukraine' })
    expect(first.ok).toBe(true) // not blocked by a ledger outage
    // in-memory now holds it → a replay in the SAME instance is still caught
    const second = await requirePaidPacket({ req: req('cs_test_dur3'), product: 'tps-ukraine' })
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.code).toBe('replayed')
  })
})
