import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('tps manual-review route strict body contract', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns 200 for valid strict body', async () => {
    vi.doMock('@/lib/security/rate-limit', () => ({
      getClientIP: vi.fn(() => '127.0.0.1'),
      rateLimit: vi.fn(async () => ({
        allowed: true,
        resetAt: new Date(Date.now() + 60_000),
      })),
    }))
    vi.doMock('@/lib/translation/manualReview/createManualReviewTicket', () => ({
      createManualReviewTicket: vi.fn(async () => ({
        ticketId: 'ticket-1',
        status: 'queued',
        reused: false,
      })),
    }))
    const { POST } = await import('@/app/api/tps/manual-review/route')
    const req = new Request('http://localhost/api/tps/manual-review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        reason: 'user_requested_human_help',
        contact_email: 'tester001@example.com',
        locale: 'ru',
        stage: 'review',
      }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(200)
  })

  it('returns 400 when body contains unknown key', async () => {
    vi.doMock('@/lib/security/rate-limit', () => ({
      getClientIP: vi.fn(() => '127.0.0.1'),
      rateLimit: vi.fn(async () => ({
        allowed: true,
        resetAt: new Date(Date.now() + 60_000),
      })),
    }))
    const { POST } = await import('@/app/api/tps/manual-review/route')
    const req = new Request('http://localhost/api/tps/manual-review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        reason: 'user_requested_human_help',
        contact_email: 'tester001@example.com',
        locale: 'ru',
        stage: 'review',
        passport_number: 'AA1234567',
      }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid email and invalid enum values', async () => {
    vi.doMock('@/lib/security/rate-limit', () => ({
      getClientIP: vi.fn(() => '127.0.0.1'),
      rateLimit: vi.fn(async () => ({
        allowed: true,
        resetAt: new Date(Date.now() + 60_000),
      })),
    }))
    const { POST } = await import('@/app/api/tps/manual-review/route')
    const req = new Request('http://localhost/api/tps/manual-review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        reason: 'not_allowed_reason',
        contact_email: 'bad-email',
        locale: 'zz',
        stage: 'unknown',
      }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })
})
