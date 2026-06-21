import { describe, it, expect } from 'vitest'
import { parseMrz, checkDigit } from '../mrz'

describe('MRZ TD3 parser (controlling Latin)', () => {
  // Real passport from the bench (Ivanenko Ivan, FA000000, DOB 1990-01-01)
  const text = `УКРАЇНА / UKRAINE\nP<UKRIVANENKO<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<\nFA000000<5UKR9001011M3001019<<<<<<<<<<<<<<06`

  it('reads the controlling Latin name from MRZ (not re-transliterated)', () => {
    const r = parseMrz(text)
    expect(r.ok).toBe(true)
    expect(r.surname).toBe('IVANENKO')
    expect(r.given_names).toBe('IVAN')
  })

  it('reads passport number, DOB, sex, nationality', () => {
    const r = parseMrz(text)
    expect(r.passport_no).toBe('FA000000')
    expect(r.nationality).toBe('UKR')
    expect(r.date_of_birth).toBe('1990-01-01')
    expect(r.sex).toBe('M')
  })

  it('check digit algorithm (ICAO 7-3-1)', () => {
    expect(checkDigit('900101')).toBe(1) // matches the DOB check digit in the line above
  })

  it('no MRZ in text → not ok, review required', () => {
    const r = parseMrz('just some plain text, no machine zone here')
    expect(r.ok).toBe(false)
    expect(r.review_required).toBe(true)
  })

  it('TD3 reports format and validates expiry + composite (unified review)', () => {
    const r = parseMrz(text)
    expect(r.format).toBe('TD3')
    expect(r.expiry).toBe('2030-01-01')
    expect(r.checks.expiry).toBe(true)
    expect(r.checks.composite).toBe(true)
    expect(r.review_required).toBe(false)
  })
})

describe('MRZ TD1 parser (ID card, 3×30)', () => {
  // GOLDEN TD1 — Ivanenko Ivan, doc AA1234567, UKR, DOB 1990-01-01 M, exp 2030-01-01.
  // Check digits computed by ICAO 7-3-1; composite over the documented field spans.
  const td1 = [
    'I<UKRAA12345678<<<<<<<<<<<<<<<',
    '9001011M3001019UKR<<<<<<<<<<<0',
    'IVANENKO<<IVAN<<<<<<<<<<<<<<<<',
  ].join('\n')

  it('reads controlling Latin name + fields from a TD1 ID card', () => {
    const r = parseMrz(td1)
    expect(r.ok).toBe(true)
    expect(r.format).toBe('TD1')
    expect(r.surname).toBe('IVANENKO')
    expect(r.given_names).toBe('IVAN')
    expect(r.passport_no).toBe('AA1234567')
    expect(r.nationality).toBe('UKR')
    expect(r.date_of_birth).toBe('1990-01-01')
    expect(r.sex).toBe('M')
    expect(r.expiry).toBe('2030-01-01')
  })

  it('all check digits pass on the known-good TD1 → no review', () => {
    const r = parseMrz(td1)
    expect(r.checks).toEqual({ passport_no: true, dob: true, expiry: true, composite: true })
    expect(r.review_required).toBe(false)
  })

  it('TAMPERED TD1 (DOB digit flipped) → check fails, review_required, cannot overwrite', () => {
    // Flip the DOB from 900101 to 910101 without fixing the check digit.
    const tampered = td1.replace('9001011M', '9101011M')
    const r = parseMrz(tampered)
    expect(r.checks.dob).toBe(false)
    expect(r.review_required).toBe(true)
  })
})
