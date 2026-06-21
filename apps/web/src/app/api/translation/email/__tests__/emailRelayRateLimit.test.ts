/**
 * emailRelayRateLimit.test.ts — security regression for #195 P0-1.
 *
 * /api/translation/email self-emails a generated draft and is anonymous by
 * design. It must be rate-limited so it cannot be used as an open email relay
 * (attacker-supplied field text → any address). 5 sends/hour per IP, then 429.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  send: vi.fn(async () => ({ ok: true as const })),
}))
vi.mock('@/lib/email/resend', () => ({ sendTranslationEmail: h.send }))
vi.mock('@/lib/translation/generateTranslationHTML', () => ({
  generateTranslationHTML: () => '<html>draft</html>',
}))

import { POST } from '../route'

function req(ip: string): NextRequest {
  return new NextRequest('http://localhost/api/translation/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ email: 'me@example.com', prodId: 'passport', fieldValues: { name: 'X' }, srcLang: 'Ukrainian', docLabel: 'doc' }),
  })
}

describe('#195 P0-1 — translation email relay is rate-limited', () => {
  beforeEach(() => h.send.mockClear())

  it('allows 5 sends/hour then 429s the 6th from the same IP', async () => {
    const ip = '203.0.113.55' // unique window
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) statuses.push((await POST(req(ip))).status)
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200])
    expect(statuses[5]).toBe(429)
    expect(h.send).toHaveBeenCalledTimes(5) // the throttled request never reaches the mailer
  })

  it('a different IP is independent (own quota)', async () => {
    const res = await POST(req('203.0.113.66'))
    expect(res.status).toBe(200)
  })
})
