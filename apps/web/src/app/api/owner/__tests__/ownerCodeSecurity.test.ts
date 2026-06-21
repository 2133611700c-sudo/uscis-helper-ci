/**
 * ownerCodeSecurity.test.ts — security regression for #184 E1 + E2.
 *
 *   E1: the owner code-verify endpoint throttles attempts (no brute-force of the
 *       6-digit code).
 *   E2: the request-code endpoint NEVER logs the live code in production.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  verifyCode: vi.fn(() => false),
  setOwnerSessionCookie: vi.fn(async () => {}),
  isOwnerEmail: vi.fn(() => true),
  createVerificationCode: vi.fn(() => '424242'),
}))

vi.mock('@/lib/ownerAccess', () => ({
  verifyCode: h.verifyCode,
  setOwnerSessionCookie: h.setOwnerSessionCookie,
  isOwnerEmail: h.isOwnerEmail,
  createVerificationCode: h.createVerificationCode,
}))

import { POST as VERIFY } from '../verify-code/route'
import { POST as REQUEST } from '../request-code/route'

const EMAIL = 'owner@example.com'

function verifyReq(ip: string): NextRequest {
  return new NextRequest('http://localhost/api/owner/verify-code', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ email: EMAIL, code: '000000' }),
  })
}

describe('#184 E1 — owner verify-code brute-force throttle', () => {
  beforeEach(() => { h.verifyCode.mockReturnValue(false) })

  it('blocks after 5 failed attempts from the same IP+email (6th → 429)', async () => {
    const ip = '192.0.2.77' // unique window for this test
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) statuses.push((await VERIFY(verifyReq(ip))).status)
    // First 5 are allowed through to verifyCode (401, wrong code); the 6th is throttled.
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401])
    expect(statuses[5]).toBe(429)
  })
})

describe('#184 E2 — owner request-code never logs the live code in production', () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.stubEnv('RESEND_API_KEY', '') // force the "no provider" branch
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    logSpy.mockRestore(); errSpy.mockRestore()
  })

  function requestReq(): NextRequest {
    return new NextRequest('http://localhost/api/owner/request-code', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL }),
    })
  }

  it('in production: the code is NEVER written to console', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const res = await REQUEST(requestReq())
    expect(res.status).toBe(200)
    const allLogged = logSpy.mock.calls.flat().join(' ')
    expect(allLogged).not.toContain('424242')
    expect(allLogged).not.toContain('OWNER_CODE')
  })

  it('in development: a dev-only code line is allowed (so local dev still works)', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    await REQUEST(requestReq())
    const allLogged = logSpy.mock.calls.flat().join(' ')
    expect(allLogged).toContain('424242')
  })
})
