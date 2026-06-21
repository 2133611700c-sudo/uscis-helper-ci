import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Stripe client singleton. vi.mock is hoisted above imports, so we
// use vi.hoisted to share the mock fn between the factory and the tests.
const { retrieveMock } = vi.hoisted(() => ({ retrieveMock: vi.fn() }))
vi.mock('@/lib/stripe/client', () => ({
  stripe: { checkout: { sessions: { retrieve: retrieveMock } } },
}))

import { verifyStripeSessionPaid } from '../verifyPayment'

describe('verifyStripeSessionPaid', () => {
  beforeEach(() => retrieveMock.mockReset())

  it('paid + correct service → paid:true, correctService:true', async () => {
    retrieveMock.mockResolvedValueOnce({ payment_status: 'paid', metadata: { service: 'translation' }, amount_total: 1500 })
    const r = await verifyStripeSessionPaid('cs_test_123', { expectedService: 'translation' })
    expect(r.paid).toBe(true)
    expect(r.correctService).toBe(true)
    expect(r.customerEmail).toBe(null)
    expect(r.service).toBe('translation')
    expect(r.amountTotalCents).toBe(1500)
    expect(r.sessionId).toBe('cs_test_123')
    // operator flow: the verified Stripe session is the only trusted email source
    expect('customerEmail' in r).toBe(true)
  })

  it('paid but wrong service → reason: wrong_service', async () => {
    retrieveMock.mockResolvedValueOnce({ payment_status: 'paid', metadata: { service: 'tps-ukraine' } })
    const r = await verifyStripeSessionPaid('cs_test_123', { expectedService: 'translation' })
    expect(r.paid).toBe(true)
    expect(r.correctService).toBe(false)
    expect(r.reason).toBe('wrong_service')
  })

  it('unpaid session → reason: not_paid', async () => {
    retrieveMock.mockResolvedValueOnce({ payment_status: 'unpaid', metadata: { service: 'translation' } })
    const r = await verifyStripeSessionPaid('cs_test_123', { expectedService: 'translation' })
    expect(r.paid).toBe(false)
    expect(r.reason).toBe('not_paid')
  })

  it('invalid token format → never hits Stripe', async () => {
    const r = await verifyStripeSessionPaid('not_a_session_id')
    expect(r.paid).toBe(false)
    expect(r.reason).toBe('invalid_session_id_format')
    expect(retrieveMock).not.toHaveBeenCalled()
  })

  it('empty token → invalid_session_id_format', async () => {
    const r = await verifyStripeSessionPaid('')
    expect(r.reason).toBe('invalid_session_id_format')
  })

  it('accepts py_* PaymentIntent prefix (Stripe legacy/test variants)', async () => {
    retrieveMock.mockResolvedValueOnce({ payment_status: 'paid', metadata: {} })
    const r = await verifyStripeSessionPaid('py_live_456')
    expect(r.paid).toBe(true)
  })

  it('expectedService omitted → correctService is true regardless of metadata', async () => {
    retrieveMock.mockResolvedValueOnce({ payment_status: 'paid', metadata: { service: 'tps-ukraine' } })
    const r = await verifyStripeSessionPaid('cs_test_123')
    expect(r.paid).toBe(true)
    expect(r.correctService).toBe(true)
  })

  it('Stripe API throws → stripe_api_error, never throws to caller', async () => {
    retrieveMock.mockRejectedValueOnce(new Error('network down'))
    const r = await verifyStripeSessionPaid('cs_test_123', { expectedService: 'translation' })
    expect(r.paid).toBe(false)
    expect(r.reason).toBe('stripe_api_error')
  })
})
