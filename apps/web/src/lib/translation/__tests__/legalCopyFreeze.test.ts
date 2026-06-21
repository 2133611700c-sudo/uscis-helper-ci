/**
 * legalCopyFreeze.test.ts — Legal Copy Freeze (master plan §5).
 *
 * The 8 CFR §103.2(b)(3) self-certification statement is legal text the user
 * signs. It must NOT change silently: any edit requires a deliberate version bump
 * AND a new ADR. This test pins the statement's SHA-256 + the version string, so
 * an accidental or unreviewed change to the legal copy fails the build.
 *
 * To change the certification text (legitimately):
 *   1. write an ADR in docs/adr/ recording why + the new wording;
 *   2. bump CERTIFICATION_VERSION;
 *   3. update PINNED_VERSION + PINNED_STATEMENT_SHA256 below to match.
 */
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { CERTIFICATION_STATEMENT, CERTIFICATION_VERSION } from '../certificationRecord'

// Pinned 2026-05-30. Change ONLY via ADR + version bump (see header).
const PINNED_VERSION = 'v1.0-8cfr-2026'
const PINNED_STATEMENT_SHA256 = 'efc6017aafb32eeb307b65fb9ed1f3fe31a0a3653dbf7245746ee5ff187f2c4c'

describe('Legal Copy Freeze — certification statement', () => {
  it('the certification version is pinned (bump only via ADR)', () => {
    expect(CERTIFICATION_VERSION).toBe(PINNED_VERSION)
  })

  it('the certification statement text is pinned by hash (no silent edits)', () => {
    const sha = createHash('sha256').update(CERTIFICATION_STATEMENT).digest('hex')
    expect(
      sha,
      'Certification legal text changed. If intended: write an ADR, bump CERTIFICATION_VERSION, ' +
        'and update PINNED_STATEMENT_SHA256 in this test.',
    ).toBe(PINNED_STATEMENT_SHA256)
  })

  it('the statement still references the controlling regulation', () => {
    expect(CERTIFICATION_STATEMENT).toContain('8 CFR §103.2(b)(3)')
  })
})
