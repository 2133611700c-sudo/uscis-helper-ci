/**
 * Server-side payment gate for /api/reparole/generate-packet (P1 security).
 *
 * Proves the free-packet bypass is closed: without an owner session or a
 * Stripe-verified, product-matched, correctly-priced, unconsumed X-Payment-Token,
 * the route refuses to generate a packet. Client paid=1 / body / query are never
 * authoritative.
 *
 * Stripe + owner session are mocked — no real charge, no network, no PII.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mock Stripe client singleton (shared retrieve mock) ─────────────────────
const { retrieveMock } = vi.hoisted(() => ({ retrieveMock: vi.fn() }))
vi.mock('@/lib/stripe/client', () => ({
  stripe: { checkout: { sessions: { retrieve: retrieveMock } } },
  // STRIPE_PRICES is imported by some siblings; keep a benign shape.
  STRIPE_PRICES: { reparoleU4UTier1: 'price_test' },
}))

// ── Mock owner session (default: NOT owner) ─────────────────────────────────
const { ownerMock } = vi.hoisted(() => ({ ownerMock: vi.fn() }))
vi.mock('@/lib/ownerAccess', () => ({
  isOwnerSession: ownerMock,
}))

// ── Mock the heavy packet builder so a "success" path is observable cheaply.
const { buildMock } = vi.hoisted(() => ({ buildMock: vi.fn() }))
vi.mock('@/lib/reparole/packetBuilder', () => ({
  buildReParoleI131: buildMock,
}))

import { NextRequest } from 'next/server'
import { POST } from '../generate-packet/route'
import {
  requirePaidPacket,
  __resetConsumedStore,
} from '@/lib/stripe/requirePaidPacket'
import { REPAROLE_TIER1_PRICE_CENTS } from '@/lib/pricing'

const URL = 'http://localhost/api/reparole/generate-packet'

const VALID_ANSWERS = {
  family_name: 'Shevchenko',
  given_name: 'Taras',
  dob: '03/09/1814',
  mailing_street: '1 Main St',
  mailing_city: 'Kyiv',
  mailing_state: 'CA',
  mailing_zip: '90038',
  country_of_birth: 'Ukraine',
}

function req(headers: Record<string, string> = {}, body: unknown = VALID_ANSWERS): NextRequest {
  return new NextRequest(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

function paidReparoleSession() {
  return {
    payment_status: 'paid',
    metadata: { service: 're-parole-u4u' },
    amount_total: REPAROLE_TIER1_PRICE_CENTS,
  }
}

beforeEach(() => {
  retrieveMock.mockReset()
  ownerMock.mockReset()
  buildMock.mockReset()
  __resetConsumedStore()
  ownerMock.mockResolvedValue({ verified: false, email: null })
  buildMock.mockResolvedValue({
    i131_bytes: new Uint8Array([1, 2, 3]),
    i131: { applied: 1, skipped: 0, firstSkips: [] },
  })
})

// ── Route-level: the security matrix ────────────────────────────────────────
describe('/api/reparole/generate-packet — payment gate (route)', () => {
  it('no token, not owner → 403 (free-packet bypass closed)', async () => {
    const res = await POST(req())
    expect(res.status).toBe(403)
    const j = await res.json()
    expect(j.reason).toBe('no_token')
    expect(buildMock).not.toHaveBeenCalled()
  })

  it('fake/garbage token → 403 bad_token_format, never hits Stripe', async () => {
    const res = await POST(req({ 'x-payment-token': 'stripe-checkout-complete' }))
    expect(res.status).toBe(403)
    const j = await res.json()
    expect(j.reason).toBe('bad_token_format')
    expect(retrieveMock).not.toHaveBeenCalled()
    expect(buildMock).not.toHaveBeenCalled()
  })

  it('TPS-product token used for Re-Parole → 403 wrong_product (cross-product)', async () => {
    retrieveMock.mockResolvedValueOnce({
      payment_status: 'paid',
      metadata: { service: 'tps-ukraine' },
      amount_total: 1500,
    })
    const res = await POST(req({ 'x-payment-token': 'cs_test_tps' }))
    expect(res.status).toBe(403)
    const j = await res.json()
    expect(j.reason).toBe('wrong_product')
    expect(buildMock).not.toHaveBeenCalled()
  })

  it('unpaid session → 402 unpaid', async () => {
    retrieveMock.mockResolvedValueOnce({
      payment_status: 'unpaid',
      metadata: { service: 're-parole-u4u' },
      amount_total: REPAROLE_TIER1_PRICE_CENTS,
    })
    const res = await POST(req({ 'x-payment-token': 'cs_test_unpaid' }))
    expect(res.status).toBe(402)
    const j = await res.json()
    expect(j.reason).toBe('unpaid')
    expect(buildMock).not.toHaveBeenCalled()
  })

  it('wrong amount → 403 wrong_amount', async () => {
    retrieveMock.mockResolvedValueOnce({
      payment_status: 'paid',
      metadata: { service: 're-parole-u4u' },
      amount_total: 1, // not $15
    })
    const res = await POST(req({ 'x-payment-token': 'cs_test_cheap' }))
    expect(res.status).toBe(403)
    const j = await res.json()
    expect(j.reason).toBe('wrong_amount')
    expect(buildMock).not.toHaveBeenCalled()
  })

  it('Stripe API error → 402 stripe_unavailable (fail-closed)', async () => {
    retrieveMock.mockRejectedValueOnce(new Error('network down'))
    const res = await POST(req({ 'x-payment-token': 'cs_test_err' }))
    expect(res.status).toBe(402)
    const j = await res.json()
    expect(j.reason).toBe('stripe_unavailable')
    expect(buildMock).not.toHaveBeenCalled()
  })

  it('valid paid Re-Parole token → 200 zip (packet generated)', async () => {
    retrieveMock.mockResolvedValueOnce(paidReparoleSession())
    const res = await POST(req({ 'x-payment-token': 'cs_test_good' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/zip')
    expect(buildMock).toHaveBeenCalledTimes(1)
  })

  it('replay: same valid token cannot mint a second packet', async () => {
    retrieveMock.mockResolvedValue(paidReparoleSession())
    const first = await POST(req({ 'x-payment-token': 'cs_test_replay' }))
    expect(first.status).toBe(200)
    const second = await POST(req({ 'x-payment-token': 'cs_test_replay' }))
    expect(second.status).toBe(403)
    const j = await second.json()
    expect(j.reason).toBe('replayed')
    expect(buildMock).toHaveBeenCalledTimes(1) // only the first minted
  })

  it('owner session → bypass, allowed without token', async () => {
    ownerMock.mockResolvedValue({ verified: true, email: 'owner@example.com' })
    const res = await POST(req()) // no x-payment-token
    expect(res.status).toBe(200)
    expect(retrieveMock).not.toHaveBeenCalled()
    expect(buildMock).toHaveBeenCalledTimes(1)
  })
})

// ── Unit-level: the shared gate in isolation ────────────────────────────────
describe('requirePaidPacket (shared gate unit)', () => {
  function gateReq(headers: Record<string, string> = {}): NextRequest {
    return new NextRequest(URL, { method: 'POST', headers })
  }

  it('no token, not owner → {ok:false, 403, no_token}', async () => {
    ownerMock.mockResolvedValue({ verified: false, email: null })
    const r = await requirePaidPacket({ req: gateReq(), product: 're-parole-u4u' })
    expect(r).toMatchObject({ ok: false, status: 403, code: 'no_token' })
  })

  it('owner → {ok:true, owner:true} without Stripe', async () => {
    ownerMock.mockResolvedValue({ verified: true, email: 'o@x.com' })
    const r = await requirePaidPacket({ req: gateReq(), product: 're-parole-u4u' })
    expect(r).toMatchObject({ ok: true, owner: true })
    expect(retrieveMock).not.toHaveBeenCalled()
  })

  it('allowOwner:false ignores owner cookie and demands a token', async () => {
    ownerMock.mockResolvedValue({ verified: true, email: 'o@x.com' })
    const r = await requirePaidPacket({
      req: gateReq(),
      product: 're-parole-u4u',
      allowOwner: false,
    })
    expect(r).toMatchObject({ ok: false, code: 'no_token' })
  })

  it('cross-product token → {ok:false, 403, wrong_product}', async () => {
    ownerMock.mockResolvedValue({ verified: false, email: null })
    retrieveMock.mockResolvedValueOnce({
      payment_status: 'paid',
      metadata: { service: 'tps-ukraine' },
      amount_total: 1500,
    })
    const r = await requirePaidPacket({
      req: gateReq({ 'x-payment-token': 'cs_x' }),
      product: 're-parole-u4u',
    })
    expect(r).toMatchObject({ ok: false, status: 403, code: 'wrong_product' })
  })

  it('valid paid token → {ok:true, owner:false, token}', async () => {
    ownerMock.mockResolvedValue({ verified: false, email: null })
    retrieveMock.mockResolvedValueOnce(paidReparoleSession())
    const r = await requirePaidPacket({
      req: gateReq({ 'x-payment-token': 'cs_ok' }),
      product: 're-parole-u4u',
      expectedAmountCents: REPAROLE_TIER1_PRICE_CENTS,
    })
    expect(r).toMatchObject({ ok: true, owner: false, token: 'cs_ok', service: 're-parole-u4u' })
  })

  it('TPS-compatible: gate works for product=tps-ukraine (no TPS refactor needed)', async () => {
    ownerMock.mockResolvedValue({ verified: false, email: null })
    retrieveMock.mockResolvedValueOnce({
      payment_status: 'paid',
      metadata: { service: 'tps-ukraine' },
      amount_total: 1500,
    })
    const r = await requirePaidPacket({
      req: gateReq({ 'x-payment-token': 'cs_tps' }),
      product: 'tps-ukraine',
    })
    expect(r).toMatchObject({ ok: true, service: 'tps-ukraine' })
  })
})
