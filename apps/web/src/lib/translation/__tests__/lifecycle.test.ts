import { describe, it, expect } from 'vitest'
import {
  getRetentionPolicy,
  planSignedUrl,
  isSignedUrlValid,
  isExpired,
  planCustomerDeletion,
  decideExpiredArtifactAccess,
} from '../lifecycle'

describe('lifecycle — signed URL TTL', () => {
  it('is short-lived, private, and non-reusable after expiry', () => {
    const now = new Date('2026-06-13T00:00:00Z')
    const plan = planSignedUrl(now)
    expect(plan.isPublic).toBe(false)
    expect(plan.reusableAfterExpiry).toBe(false)
    expect(plan.ttlSeconds).toBeGreaterThanOrEqual(30)
    expect(plan.ttlSeconds).toBeLessThanOrEqual(3600)
    const exp = Date.parse(plan.expiresAt)
    expect(exp).toBe(now.getTime() + plan.ttlSeconds * 1000)
  })

  it('TTL is clamped to <= 1 hour even with a huge env override', () => {
    const prev = process.env.ARTIFACT_SIGNED_URL_TTL_SECONDS
    process.env.ARTIFACT_SIGNED_URL_TTL_SECONDS = '999999'
    const policy = getRetentionPolicy()
    expect(policy.signedUrlTtlSeconds).toBe(3600)
    if (prev === undefined) delete process.env.ARTIFACT_SIGNED_URL_TTL_SECONDS
    else process.env.ARTIFACT_SIGNED_URL_TTL_SECONDS = prev
  })

  it('isSignedUrlValid is false after expiry and true before', () => {
    const now = new Date('2026-06-13T00:00:00Z')
    const plan = planSignedUrl(now)
    expect(isSignedUrlValid(plan.expiresAt, now)).toBe(true)
    const after = new Date(Date.parse(plan.expiresAt) + 1)
    expect(isSignedUrlValid(plan.expiresAt, after)).toBe(false)
    expect(isSignedUrlValid('not-a-date')).toBe(false)
  })
})

describe('lifecycle — expiry', () => {
  it('isExpired respects the retention window', () => {
    const created = '2026-01-01T00:00:00Z'
    expect(isExpired(created, 90, new Date('2026-02-01T00:00:00Z'))).toBe(false)
    expect(isExpired(created, 90, new Date('2026-06-01T00:00:00Z'))).toBe(true)
    expect(isExpired('garbage', 90)).toBe(false)
  })
})

describe('lifecycle — customer deletion plan', () => {
  const artifacts = [
    { id: 'a1', storageBucket: 'translation-artifacts', storageKey: 'order1/hashA.pdf' },
    { id: 'a2', storageBucket: 'translation-artifacts', storageKey: 'order1/hashB.pdf' },
  ]

  it('computes every storage key (no orphan objects) and preserves a non-PII audit stub', () => {
    const plan = planCustomerDeletion({ orderId: 'order1', artifacts })
    expect(plan.blockedByLegalHold).toBe(false)
    expect(plan.storageKeysToDelete).toHaveLength(2)
    expect(plan.storageKeysToDelete.map((s) => s.key)).toEqual(['order1/hashA.pdf', 'order1/hashB.pdf'])
    expect(plan.purgePiiFromOrder).toBe(true)
    // audit stub preserved, and it is non-PII (just the opaque order id + reason)
    expect(plan.preserveAuditStub).toEqual({ orderId: 'order1', reason: 'customer_deletion' })
  })

  it('legal hold blocks all deletion', () => {
    const plan = planCustomerDeletion({ orderId: 'order1', artifacts, legalHold: true })
    expect(plan.blockedByLegalHold).toBe(true)
    expect(plan.storageKeysToDelete).toHaveLength(0)
    expect(plan.purgePiiFromOrder).toBe(false)
    // audit stub is STILL preserved
    expect(plan.preserveAuditStub.orderId).toBe('order1')
  })
})

describe('lifecycle — expired artifact access', () => {
  it('denies an expired artifact, allows a fresh one', () => {
    const policy = { ...getRetentionPolicy(), artifactDays: 90 }
    const created = '2026-01-01T00:00:00Z'
    expect(decideExpiredArtifactAccess(created, {}, policy, new Date('2026-02-01T00:00:00Z')).allowed).toBe(true)
    const expired = decideExpiredArtifactAccess(created, {}, policy, new Date('2026-06-01T00:00:00Z'))
    expect(expired.allowed).toBe(false)
    expect(expired.reason).toBe('expired')
  })

  it('legal hold keeps an expired artifact accessible to authorized review', () => {
    const policy = { ...getRetentionPolicy(), artifactDays: 90 }
    const created = '2026-01-01T00:00:00Z'
    const d = decideExpiredArtifactAccess(created, { legalHold: true }, policy, new Date('2026-06-01T00:00:00Z'))
    expect(d.allowed).toBe(true)
    expect(d.reason).toBe('legal_hold_overrides_expiry')
  })
})
