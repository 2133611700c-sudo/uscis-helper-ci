/**
 * recordGuardBlock.test.ts — the flag boundary. OFF (default) ⇒ no-op that resolves
 * without constructing a client (byte-identical, zero cost). Never throws.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { isGuardBlockMetricsEnabled, recordGuardBlock, asUuidOrNull } from '../recordGuardBlock'

afterEach(() => { delete process.env.GUARD_BLOCK_METRICS_ENABLED })

describe('GUARD_BLOCK_METRICS_ENABLED gate', () => {
  it('OFF by default', () => {
    delete process.env.GUARD_BLOCK_METRICS_ENABLED
    expect(isGuardBlockMetricsEnabled()).toBe(false)
    expect(isGuardBlockMetricsEnabled({ GUARD_BLOCK_METRICS_ENABLED: '1' })).toBe(true)
  })

  it('recordGuardBlock resolves without throwing when OFF (no client constructed)', async () => {
    delete process.env.GUARD_BLOCK_METRICS_ENABLED
    await expect(
      recordGuardBlock({ gateType: 'confirmed_value_guard', reasonCode: 'cyrillic_in_latin_field', wouldBlock: true, fieldName: 'dob', docType: 'ua_birth_certificate', sessionId: 's1' }),
    ).resolves.toBeUndefined()
  })
})

describe('asUuidOrNull — session_id is a uuid column', () => {
  it('passes a valid uuid, nulls a non-uuid (legacy/empty)', () => {
    expect(asUuidOrNull('123e4567-e89b-12d3-a456-426614174000')).toBe('123e4567-e89b-12d3-a456-426614174000')
    expect(asUuidOrNull('legacy')).toBeNull()
    expect(asUuidOrNull('')).toBeNull()
    expect(asUuidOrNull(null)).toBeNull()
  })
})
