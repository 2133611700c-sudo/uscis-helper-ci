/**
 * nameNoSilentRecase.test.ts — S3 safety: a person name must not be silently
 * re-cased into a WRONG controlling spelling. Locks the corruptions the naive
 * `s[0] + s.slice(1).toLowerCase()` title-cast produced in the EAD/passport
 * modules.
 */
import { describe, it, expect } from 'vitest'
import { formatLatinName } from '@uscis-helper/knowledge'

describe('S3 — name no-silent-recase (formatLatinName)', () => {
  it('keeps the capital after an apostrophe (O\'BRIEN → O\'Brien, not O\'brien)', () => {
    expect(formatLatinName("O'BRIEN")).toBe("O'Brien")
  })

  it('keeps the capital after a hyphen (PETRENKO-VASYLENKO → Petrenko-Vasylenko)', () => {
    expect(formatLatinName('PETRENKO-VASYLENKO')).toBe('Petrenko-Vasylenko')
  })

  it('capitalizes every space-separated part (VAN DER BERG → Van Der Berg, not "Van der berg")', () => {
    expect(formatLatinName('VAN DER BERG')).toBe('Van Der Berg')
  })

  it('preserves a deliberately mixed-case read (McDonald stays McDonald, not Mcdonald)', () => {
    expect(formatLatinName('McDonald')).toBe('McDonald')
    expect(formatLatinName("O'Brien")).toBe("O'Brien")
  })

  it('still title-cases a simple all-caps name (no regression: KOVALENKO → Kovalenko)', () => {
    expect(formatLatinName('KOVALENKO')).toBe('Kovalenko')
    expect(formatLatinName('IVAN')).toBe('Ivan')
    expect(formatLatinName('ivan')).toBe('Ivan')
  })

  it('trims and tolerates empty input', () => {
    expect(formatLatinName('  KOVALENKO  ')).toBe('Kovalenko')
    expect(formatLatinName('')).toBe('')
  })
})
