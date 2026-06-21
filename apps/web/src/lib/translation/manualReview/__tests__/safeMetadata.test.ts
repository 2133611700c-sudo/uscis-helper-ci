/**
 * PII-safety tests for sanitizeEventMetadata, isSafeMetadata, redactValue,
 * buildSafeSummary.
 */
import { describe, it, expect } from 'vitest'
import {
  sanitizeEventMetadata,
  isSafeMetadata,
  redactValue,
  buildSafeSummary,
  SAFE_METADATA_KEYS,
} from '../safeMetadata'

describe('redactValue', () => {
  it('redacts emails', () => {
    expect(redactValue('john@example.com')).toBe('[redacted-email]')
  })
  it('redacts phone-like strings', () => {
    expect(redactValue('+380 67 123 4567')).toBe('[redacted-phone]')
    expect(redactValue('(212) 555-1212')).toBe('[redacted-phone]')
  })
  it('redacts long digit runs', () => {
    expect(redactValue('FN123456')).toBe('[redacted-digits]')
    expect(redactValue('19850315')).toBe('[redacted-digits]')
  })
  it('redacts cyrillic text (likely names/OCR)', () => {
    expect(redactValue('Іван Петренко')).toBe('[redacted-text]')
    expect(redactValue('Свідоцтво про народження')).toBe('[redacted-text]')
  })
  it('passes through safe enum-like strings', () => {
    expect(redactValue('low_ocr_confidence')).toBe('low_ocr_confidence')
    expect(redactValue('queued')).toBe('queued')
  })
  it('passes through numbers and booleans', () => {
    expect(redactValue(42)).toBe(42)
    expect(redactValue(true)).toBe(true)
    expect(redactValue(false)).toBe(false)
  })
  it('handles null/undefined', () => {
    expect(redactValue(null)).toBe(null)
    expect(redactValue(undefined)).toBe(null)
  })
  it('truncates long free-form strings', () => {
    const long = 'a'.repeat(200)
    const out = redactValue(long)
    expect(typeof out).toBe('string')
    expect(String(out).length).toBeLessThan(60)
    expect(String(out)).toContain('truncated')
  })
})

describe('sanitizeEventMetadata', () => {
  it('strips disallowed keys', () => {
    const out = sanitizeEventMetadata({
      contact_name: 'John Doe',
      passport_number: 'FN123456',
      raw_ocr: 'some text',
      reason_code: 'low_ocr_confidence',  // allowed
    })
    expect(out).not.toHaveProperty('contact_name')
    expect(out).not.toHaveProperty('passport_number')
    expect(out).not.toHaveProperty('raw_ocr')
    expect(out.reason_code).toBe('low_ocr_confidence')
  })

  it('drops nested objects', () => {
    const out = sanitizeEventMetadata({
      reason_code: 'foo',
      ticket_id: { id: 'x' }, // disallowed shape
    })
    expect(out).not.toHaveProperty('ticket_id')
  })

  it('keeps reasons as string array', () => {
    const out = sanitizeEventMetadata({
      reasons: ['low_ocr_confidence', 'identity_conflict'],
    })
    expect(out.reasons).toEqual(['low_ocr_confidence', 'identity_conflict'])
  })

  it('redacts string values that look like PII even under whitelisted keys', () => {
    const out = sanitizeEventMetadata({
      route: 'login@user.com',  // value-level redaction
    })
    expect(out.route).toBe('[redacted-email]')
  })

  it('returns empty object for non-objects', () => {
    expect(sanitizeEventMetadata(null)).toEqual({})
    expect(sanitizeEventMetadata('string')).toEqual({})
    expect(sanitizeEventMetadata(42)).toEqual({})
    expect(sanitizeEventMetadata([1, 2])).toEqual({})
  })
})

describe('isSafeMetadata', () => {
  it('true for empty object', () => {
    expect(isSafeMetadata({})).toBe(true)
  })
  it('true for safe metadata', () => {
    expect(
      isSafeMetadata({
        ticket_id: '8812d2d7-b4cf-eaae-d50e-45555dc1c583',
        session_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        status: 'queued',
        priority: 'normal',
        count: 3,
        reasons: ['low_ocr_confidence'],
        operator_id_hash: 'op_abcd1234',
      }),
    ).toBe(true)
  })
  it('false when key is not whitelisted', () => {
    expect(isSafeMetadata({ contact_name: 'John' })).toBe(false)
  })
  it('false when value contains email pattern', () => {
    expect(isSafeMetadata({ route: 'a@b.com' })).toBe(false)
  })
  it('false when value contains long digit run', () => {
    expect(isSafeMetadata({ ticket_id: 'FN123456' })).toBe(false)
  })
  it('false when value contains cyrillic block', () => {
    expect(isSafeMetadata({ status: 'Іванкомплет' })).toBe(false)
  })
  it('false for arrays at top level', () => {
    expect(isSafeMetadata([1, 2])).toBe(false)
  })
  it('false for non-objects', () => {
    expect(isSafeMetadata(null)).toBe(false)
    expect(isSafeMetadata('foo')).toBe(false)
  })
})

describe('SAFE_METADATA_KEYS contract', () => {
  it('does not include any PII-shaped key names', () => {
    const banned = [
      'name', 'first_name', 'last_name', 'surname', 'email',
      'phone', 'date_of_birth', 'dob', 'address', 'city',
      'passport_number', 'document_number', 'series', 'raw_ocr',
      'ocr_text', 'source_field', 'translated_field', 'value',
      'correction', 'note',
    ]
    for (const b of banned) {
      expect(SAFE_METADATA_KEYS as readonly string[]).not.toContain(b)
    }
  })
})

describe('buildSafeSummary', () => {
  it('produces a short summary with redacted parts', () => {
    const summary = buildSafeSummary({
      documentType: 'ua_internal_passport_booklet',
      reasons: ['low_ocr_confidence', 'missing_critical_fields'],
      hint: null,
    })
    expect(summary).toContain('ua_internal_passport_booklet')
    expect(summary).toContain('low_ocr_confidence')
    expect(summary.length).toBeLessThan(200)
  })

  it('redacts hint with cyrillic text', () => {
    const summary = buildSafeSummary({
      documentType: 'ua_internal_passport_booklet',
      reasons: ['low_ocr_confidence'],
      hint: 'Іван Петренко',
    })
    expect(summary).not.toContain('Іван')
    expect(summary).toContain('redacted-text')
  })

  it('drops malformed reason codes', () => {
    const summary = buildSafeSummary({
      documentType: 'ok',
      reasons: ['valid_code', '<script>'],
    })
    expect(summary).toContain('valid_code')
    expect(summary).not.toContain('<script>')
  })

  it('caps length', () => {
    const summary = buildSafeSummary({
      documentType: 'a'.repeat(500),
      reasons: Array.from({ length: 50 }).map((_, i) => `r_${i}`),
      hint: 'x'.repeat(500),
    })
    expect(summary.length).toBeLessThanOrEqual(200)
  })
})
