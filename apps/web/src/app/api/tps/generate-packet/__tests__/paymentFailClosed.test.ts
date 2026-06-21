/**
 * paymentFailClosed.test.ts — security regression for #184 E5.
 *
 * The TPS packet generator must FAIL CLOSED. It now delegates entitlement to the
 * shared `requirePaidPacket` gate (the same vetted, fail-closed gate reparole +
 * ead use; the gate's own deny logic — no_token / bad format / unpaid / stripe
 * unavailable / replay — is covered end-to-end by reparolePaymentGate.test.ts).
 * These tests prove the TPS route (a) calls the gate for the tps-ukraine product
 * and (b) denies with the gate's status and NEVER builds a packet when the gate
 * says no — i.e. the old "junk token / retrieve error falls through" bypass is
 * gone.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  gate: { ok: false, status: 403, code: 'no_token' } as
    | { ok: true; owner: boolean; token: string | null; service: string | null }
    | { ok: false; status: 402 | 403; code: string },
  requirePaidPacket: vi.fn(async (_opts: { product: string }) => h.gate),
  buildPacket: vi.fn(async () => ({ zipBytes: new Uint8Array([1, 2, 3]), files: ['I-821.pdf'] })),
}))

vi.mock('@/lib/stripe/requirePaidPacket', () => ({ requirePaidPacket: h.requirePaidPacket }))
vi.mock('@/lib/tps/packetBuilder', () => ({ buildPacket: h.buildPacket }))

const requirePaidPacket = h.requirePaidPacket
const buildPacket = h.buildPacket

import { POST } from '../route'

function req(headers: Record<string, string> = {}, body: unknown = {}): NextRequest {
  return new NextRequest('http://localhost/api/tps/generate-packet', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

let ip = 0
const fresh = () => ({ 'x-forwarded-for': `203.0.113.${(ip += 1)}` })

describe('#184 E5 — generate-packet delegates to the fail-closed gate', () => {
  beforeEach(() => { buildPacket.mockClear(); requirePaidPacket.mockClear() })

  it('calls requirePaidPacket for the tps-ukraine product', async () => {
    h.gate = { ok: false, status: 403, code: 'no_token' }
    await POST(req(fresh()))
    expect(requirePaidPacket).toHaveBeenCalledTimes(1)
    expect(requirePaidPacket.mock.calls[0][0]).toMatchObject({ product: 'tps-ukraine' })
  })

  it.each([
    ['no_token', 403],
    ['bad_token_format', 403],
    ['unpaid', 402],
    ['stripe_unavailable', 402],
    ['replayed', 403],
  ] as const)('gate deny (%s → %d): route returns that status and NEVER builds', async (code, status) => {
    h.gate = { ok: false, status, code }
    const res = await POST(req(fresh(), {}))
    expect(res.status).toBe(status)
    const body = await res.json() as { reason?: string }
    expect(body.reason).toBe(code)
    expect(buildPacket).not.toHaveBeenCalled()
  })
})
