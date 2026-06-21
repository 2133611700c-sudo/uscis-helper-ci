import { describe, it, expect } from 'vitest'
import {
  buildEvent,
  assertPiiSafe,
  durationBucket,
  truncateHash,
  PiiSafetyError,
  PHASE2_EVENT_CODES,
  ALLOWED_DIM_KEYS,
  type Phase2EventDims,
} from '../events'

describe('phase2 events — PII gate', () => {
  it('builds a clean event with allowed dims', () => {
    const ev = buildEvent('orders_created_total', {
      product: 'translation',
      route: 'submit-order',
      mode: 'shadow',
      internal_uuid: '11111111-2222-3333-4444-555555555555',
      has_canonical: true,
    })
    expect(ev.domain).toBe('orders')
    expect(ev.code).toBe('orders_created_total')
    expect(ev.dims.product).toBe('translation')
    expect(typeof ev.ts).toBe('string')
  })

  it('strips undefined keys', () => {
    const ev = buildEvent('delivery_success_total', { route: 'x', internal_uuid: undefined })
    expect('internal_uuid' in ev.dims).toBe(false)
  })

  // The core safety assertion: NO forbidden field ever survives the gate.
  const forbidden: Array<[string, unknown]> = [
    ['email', 'jane@example.com'],
    ['customer_email', 'a@b.co'],
    ['name', 'Jane Doe'],
    ['given_name', 'Jane'],
    ['dob', '1990-01-01'],
    ['date_of_birth', '1990-01-01'],
    ['address', '1 Main St'],
    ['passport_number', 'AB123'],
    ['a_number', 'A123'],
    ['i94', '12345'],
    ['phone', '+1555'],
    ['recipient_email', 'a@b.co'],
    ['ocr_text', 'raw'],
    ['raw_value', 'x'],
    ['evidence', 'snippet'],
    ['stripe_payload', '{}'],
    ['payload', '{}'],
    ['canonical_id', 'full-uuid-here'],
    ['full_canonical', 'x'],
  ]

  it.each(forbidden)('rejects forbidden dim key %s', (key, val) => {
    expect(() => assertPiiSafe({ [key]: val })).toThrow(PiiSafetyError)
    // and buildEvent must drop it (never throw into caller via emitEvent path)
    expect(() => buildEvent('orders_created_total', { [key]: val } as unknown as Phase2EventDims)).toThrow(
      PiiSafetyError,
    )
  })

  it('rejects email-looking values even in an allowed key', () => {
    expect(() => assertPiiSafe({ route: 'jane@example.com' })).toThrow(/email-like/)
  })

  it('rejects over-long free-text in an allowed key', () => {
    expect(() => assertPiiSafe({ route: 'x'.repeat(100) })).toThrow(/over-long/)
  })

  it('rejects an email hidden inside field_keys array', () => {
    expect(() => assertPiiSafe({ field_keys: ['given_name', 'a@b.co'] })).toThrow(/email-like/)
  })

  it('rejects unknown keys not in the allowlist', () => {
    expect(() => assertPiiSafe({ totally_new_key: 1 })).toThrow(/forbidden\/unknown/)
  })

  it('every emitted event for every code carries only allowed keys', () => {
    for (const code of PHASE2_EVENT_CODES) {
      const ev = buildEvent(code, {
        product: 'translation',
        route: 'r',
        mode: 'shadow',
        status_code: 200,
        state: 'queued',
        field_count: 2,
        field_keys: ['given_name', 'surname'],
        truncated_hash: 'abc123',
        synthetic: true,
        duration_bucket: 'lt1s',
        internal_uuid: 'uuid',
        attempt_count: 1,
        error_code: 'ORDER_VERSION_CONFLICT',
        hash_verified: true,
        has_canonical: true,
        age_seconds: 5,
        value: 3,
      })
      for (const k of Object.keys(ev.dims)) {
        expect(ALLOWED_DIM_KEYS.has(k)).toBe(true)
      }
    }
  })

  it('truncated_hash never exceeds 16 chars', () => {
    expect(() => assertPiiSafe({ truncated_hash: 'a'.repeat(17) })).toThrow(/over-long/)
    expect(() => assertPiiSafe({ truncated_hash: 'a'.repeat(16) })).not.toThrow()
  })
})

describe('phase2 events — helpers', () => {
  it('durationBucket maps correctly', () => {
    expect(durationBucket(500)).toBe('lt1s')
    expect(durationBucket(2000)).toBe('lt5s')
    expect(durationBucket(10_000)).toBe('lt30s')
    expect(durationBucket(60_000)).toBe('lt5m')
    expect(durationBucket(600_000)).toBe('gte5m')
  })

  it('truncateHash returns <=16 hex and strips non-hex', () => {
    expect(truncateHash('deadBEEF1234567890abcdef')).toBe('deadBEEF12345678')
    expect(truncateHash(null)).toBeUndefined()
    expect(truncateHash('')).toBeUndefined()
  })
})
