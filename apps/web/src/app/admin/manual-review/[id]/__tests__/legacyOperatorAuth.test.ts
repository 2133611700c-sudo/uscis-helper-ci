import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock next/headers cookies() — the helper calls `await cookies()` then `.get`.
const cookieStore = { value: undefined as { value: string } | undefined }
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (_name: string) => cookieStore.value }),
}))

import {
  requireTranslationOperator,
  OperatorAuthError,
  resolveVerifiedRecipient,
  maskEmail,
  type RecipientVerifier,
} from '../legacyOperatorAuth'

const SECRET = 'test-admin-secret'

// Mock supabase: returns the ticket's session_id.
function clientReturning(sessionId: string | null | undefined, opts: { missing?: boolean; error?: unknown } = {}) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: opts.missing ? null : { session_id: sessionId },
            error: opts.error ?? null,
          }),
        }),
      }),
    }),
  }
}

const verifierOk = (email: string): RecipientVerifier =>
  async () => ({ paid: true, correctService: true, email })
const verifierNotPaid: RecipientVerifier = async () => ({ paid: false, correctService: false, email: 'x@y.com' })
const verifierWrongService: RecipientVerifier = async () => ({ paid: true, correctService: false, email: 'x@y.com' })
const verifierThrows: RecipientVerifier = async () => { throw new Error('stripe down') }

describe('requireTranslationOperator — fail-closed operator gate', () => {
  beforeEach(() => { cookieStore.value = undefined })
  afterEach(() => { delete process.env.ADMIN_SECRET })

  it('not_configured (403) when ADMIN_SECRET is missing', async () => {
    delete process.env.ADMIN_SECRET
    cookieStore.value = { value: 'anything' }
    await expect(requireTranslationOperator()).rejects.toMatchObject({ code: 'not_configured', httpStatus: 403 })
    await expect(requireTranslationOperator()).rejects.toBeInstanceOf(OperatorAuthError)
  })

  it('unauthenticated (401) when cookie is missing', async () => {
    process.env.ADMIN_SECRET = SECRET
    cookieStore.value = undefined
    await expect(requireTranslationOperator()).rejects.toMatchObject({ code: 'unauthenticated', httpStatus: 401 })
  })

  it('unauthenticated (401) when cookie does not match the secret', async () => {
    process.env.ADMIN_SECRET = SECRET
    cookieStore.value = { value: 'wrong-secret' }
    await expect(requireTranslationOperator()).rejects.toMatchObject({ code: 'unauthenticated' })
  })

  it('passes with a valid admin cookie and returns an actor', async () => {
    process.env.ADMIN_SECRET = SECRET
    cookieStore.value = { value: SECRET }
    await expect(requireTranslationOperator()).resolves.toEqual({ actor: 'translation_operator' })
  })
})

describe('resolveVerifiedRecipient — re-verifies Stripe, never trusts client', () => {
  it('returns the VERIFIED Stripe email (lowercased) for a paid translation session', async () => {
    const r = await resolveVerifiedRecipient(clientReturning('cs_abc') as never, 'ticket-1', verifierOk('Paid@Stripe.COM'))
    expect(r).toEqual({ email: 'paid@stripe.com', reason: 'ok' })
  })

  it('fails closed when the session is not paid', async () => {
    const r = await resolveVerifiedRecipient(clientReturning('cs_abc') as never, 'ticket-1', verifierNotPaid)
    expect(r).toEqual({ email: null, reason: 'not_verified_paid' })
  })

  it('fails closed when the session is for the wrong service', async () => {
    const r = await resolveVerifiedRecipient(clientReturning('cs_abc') as never, 'ticket-1', verifierWrongService)
    expect(r).toEqual({ email: null, reason: 'not_verified_paid' })
  })

  it('fails closed when Stripe verification throws', async () => {
    const r = await resolveVerifiedRecipient(clientReturning('cs_abc') as never, 'ticket-1', verifierThrows)
    expect(r).toEqual({ email: null, reason: 'verify_error' })
  })

  it('fails closed when the ticket has no payment session_id (e.g. legacy client-created ticket)', async () => {
    const r = await resolveVerifiedRecipient(clientReturning(null) as never, 'ticket-1', verifierOk('a@b.com'))
    expect(r).toEqual({ email: null, reason: 'no_payment_session' })
  })

  it('fails closed when the ticket row is missing or the query errors', async () => {
    expect((await resolveVerifiedRecipient(clientReturning(undefined, { missing: true }) as never, 'x', verifierOk('a@b.com'))).reason).toBe('ticket_not_found')
    expect((await resolveVerifiedRecipient(clientReturning('cs_x', { error: { message: 'boom' } }) as never, 'x', verifierOk('a@b.com'))).reason).toBe('ticket_not_found')
  })

  it('fails closed when the verified session has no usable email', async () => {
    const r = await resolveVerifiedRecipient(clientReturning('cs_abc') as never, 'ticket-1', verifierOk('not-an-email'))
    expect(r).toEqual({ email: null, reason: 'no_verified_email' })
  })

  it('fails closed for an empty ticket id (no DB call needed)', async () => {
    const r = await resolveVerifiedRecipient(clientReturning('cs_abc') as never, '', verifierOk('a@b.com'))
    expect(r).toEqual({ email: null, reason: 'no_ticket_id' })
  })
})

describe('maskEmail', () => {
  it('masks the local part and keeps the domain', () => {
    expect(maskEmail('client@example.com')).toBe('c****t@example.com')
    expect(maskEmail('ab@x.com')).toBe('a*@x.com')
  })
  it('returns a dash for empty / invalid input', () => {
    expect(maskEmail(null)).toBe('—')
    expect(maskEmail('')).toBe('—')
    expect(maskEmail('nope')).toBe('—')
  })
})
