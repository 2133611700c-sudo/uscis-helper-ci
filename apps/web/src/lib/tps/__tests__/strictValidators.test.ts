/**
 * Regression tests for the strict shape validator added in the
 * 2026-05-21 FIX_TPS_PASSPORT_MRZ_REAL_DOCUMENT_FAILURE audit.
 *
 * The motivating real-world failure: another person's Ukrainian booklet
 * uploaded, DOB row surfaced "Date of birth 13 CEP / AUG 60" as the
 * final value because backend emitted raw_value with normalized_value=null.
 * After this fix, garbage like that is REJECTED at the wizard intake
 * boundary and the user sees "Не найдено — введите вручную".
 */
import { describe, it, expect } from 'vitest'
import {
  isStrictValidValue,
  normalizeDate,
  normalizeSex,
  normalizeAndValidate,
} from '../strictValidators'

describe('isStrictValidValue — dob', () => {
  it('accepts valid ISO YYYY-MM-DD', () => {
    expect(isStrictValidValue('dob', '1990-01-01')).toBe(true)
    expect(isStrictValidValue('dob', '1960-08-13')).toBe(true)
    expect(isStrictValidValue('dob', '2000-01-01')).toBe(true)
    expect(isStrictValidValue('dob', '2099-12-31')).toBe(true)
  })

  it('REJECTS raw OCR garbage that prompted this fix', () => {
    expect(isStrictValidValue('dob', 'Date of birth 13 CEP / AUG 60')).toBe(false)
    expect(isStrictValidValue('dob', '13 CEP / AUG 60')).toBe(false)
    expect(isStrictValidValue('dob', '01 січня 1990')).toBe(false)
    expect(isStrictValidValue('dob', '01.01.1990')).toBe(false) // not ISO yet
  })

  it('rejects bogus dates that pass shape but are obviously wrong', () => {
    expect(isStrictValidValue('dob', '1986-13-25')).toBe(false) // month 13
    expect(isStrictValidValue('dob', '1986-02-32')).toBe(false) // day 32
    expect(isStrictValidValue('dob', '1800-01-01')).toBe(false) // year too low
    expect(isStrictValidValue('dob', '')).toBe(false)
  })

  it('applies same rule to all canonical-date fields', () => {
    for (const field of ['last_entry_date', 'i94_admit_until', 'passport_expiration_date', 'ead_expiration_date']) {
      expect(isStrictValidValue(field, '2026-09-07')).toBe(true)
      expect(isStrictValidValue(field, 'Some text')).toBe(false)
    }
  })
})

describe('isStrictValidValue — sex', () => {
  it('accepts M, F, X', () => {
    expect(isStrictValidValue('sex', 'M')).toBe(true)
    expect(isStrictValidValue('sex', 'F')).toBe(true)
    expect(isStrictValidValue('sex', 'X')).toBe(true)
  })

  it('rejects raw OCR text or full words', () => {
    expect(isStrictValidValue('sex', 'Male')).toBe(false)
    expect(isStrictValidValue('sex', 'мужской')).toBe(false)
    expect(isStrictValidValue('sex', 'm')).toBe(false) // lowercase
    expect(isStrictValidValue('sex', 'M F')).toBe(false)
  })
})

describe('isStrictValidValue — passport_number', () => {
  it('accepts Ukrainian international + booklet formats', () => {
    expect(isStrictValidValue('passport_number', 'FA000000')).toBe(true)
    expect(isStrictValidValue('passport_number', 'EK 790396')).toBe(true)
    expect(isStrictValidValue('passport_number', 'AB1234567')).toBe(true)
  })

  it('rejects raw OCR garbage masquerading as a passport number', () => {
    expect(isStrictValidValue('passport_number', 'Passport No: FA000000')).toBe(false)
    expect(isStrictValidValue('passport_number', '123')).toBe(false) // too short
    expect(isStrictValidValue('passport_number', 'FU 262 473 extra')).toBe(false)
    expect(isStrictValidValue('passport_number', 'just-text')).toBe(false)
  })
})

describe('isStrictValidValue — a_number', () => {
  it('accepts 9 digits with or without separators', () => {
    expect(isStrictValidValue('a_number', '231853474')).toBe(true)
    expect(isStrictValidValue('a_number', '000-000-000')).toBe(true)
    expect(isStrictValidValue('a_number', '231 853 474')).toBe(true)
  })

  it('rejects wrong length / non-digit garbage', () => {
    expect(isStrictValidValue('a_number', '12345678')).toBe(false) // 8 digits
    expect(isStrictValidValue('a_number', '1234567890')).toBe(false) // 10 digits
    expect(isStrictValidValue('a_number', 'A123456789')).toBe(false) // letter
  })
})

describe('isStrictValidValue — us_address_state, us_address_zip', () => {
  it('accepts 2-letter state and 5/9-digit zip', () => {
    expect(isStrictValidValue('us_address_state', 'CA')).toBe(true)
    expect(isStrictValidValue('us_address_state', 'NY')).toBe(true)
    expect(isStrictValidValue('us_address_zip', '90029')).toBe(true)
    expect(isStrictValidValue('us_address_zip', '90029-1234')).toBe(true)
  })

  it('rejects malformed state / zip', () => {
    expect(isStrictValidValue('us_address_state', 'California')).toBe(false)
    expect(isStrictValidValue('us_address_state', 'C')).toBe(false)
    expect(isStrictValidValue('us_address_zip', '9002')).toBe(false)
    expect(isStrictValidValue('us_address_zip', 'ABCDE')).toBe(false)
  })
})

describe('isStrictValidValue — unknown fields pass through', () => {
  it('returns true for any value on fields without a rule', () => {
    expect(isStrictValidValue('family_name', "О'Коннор")).toBe(true)
    expect(isStrictValidValue('us_address_street', '4341 Willow Brook Ave 111')).toBe(true)
    expect(isStrictValidValue('us_address_city', 'Los Angeles')).toBe(true)
    expect(isStrictValidValue('i94_admission_number', '000000000A0')).toBe(true)
  })

  it('rejects empty value regardless of field', () => {
    expect(isStrictValidValue('family_name', '')).toBe(false)
    expect(isStrictValidValue('family_name', '   ')).toBe(false)
  })
})

// 2026-05-21 FIX_TPS_STRICT_VALIDATOR_NORMALIZER tests.
// EAD evidence (prod 16e558c): AI Brain emits dob "01/01/1990" and
// ead_expiration_date "09/07/2024" in US format. The old strict validator
// dropped both → user saw "Не найдено" for fields that OCR actually read.
// The normalizer fixes UNAMBIGUOUS cases and refuses AMBIGUOUS ones
// (no guessing for critical fields).

describe('normalizeDate', () => {
  it('keeps already-ISO dates unchanged', () => {
    expect(normalizeDate('1990-01-01')).toBe('1990-01-01')
    expect(normalizeDate('2024-09-07')).toBe('2024-09-07')
  })

  it('normalizes US MM/DD/YYYY when unambiguous (day > 12)', () => {
    expect(normalizeDate('02/14/1990')).toBe('1990-02-14')
    expect(normalizeDate('12/31/2024')).toBe('2024-12-31')
    expect(normalizeDate('6/5/2024')).toBeNull() // ambiguous: both ≤ 12 → refuse
  })

  it('normalizes EU DD/MM/YYYY when unambiguous (day > 12 in first slot)', () => {
    expect(normalizeDate('14/02/1990')).toBe('1990-02-14')
    expect(normalizeDate('31/12/2024')).toBe('2024-12-31')
  })

  it('REFUSES ambiguous dates (both segments ≤ 12) — no guessing', () => {
    expect(normalizeDate('09/07/2024')).toBeNull() // could be Sep 7 OR Jul 9
    expect(normalizeDate('06/05/1990')).toBeNull()
    expect(normalizeDate('11/12/1985')).toBeNull()
  })

  it('handles YYYY/MM/DD slashes', () => {
    expect(normalizeDate('1990/01/01')).toBe('1990-01-01')
    expect(normalizeDate('2024-09-07')).toBe('2024-09-07')
  })

  it('rejects bogus inputs', () => {
    expect(normalizeDate('')).toBeNull()
    expect(normalizeDate('Date of birth')).toBeNull()
    expect(normalizeDate('13 CEP / AUG 60')).toBeNull() // booklet-style, not US/EU
    expect(normalizeDate('99/99/9999')).toBeNull()
    expect(normalizeDate('1986-13-32')).toBeNull() // month 13, day 32 → fail ISO regex
  })
})

describe('normalizeSex', () => {
  it('keeps canonical M/F/X', () => {
    expect(normalizeSex('M')).toBe('M')
    expect(normalizeSex('F')).toBe('F')
    expect(normalizeSex('X')).toBe('X')
  })

  it('maps Male/Female to M/F', () => {
    expect(normalizeSex('Male')).toBe('M')
    expect(normalizeSex('female')).toBe('F')
    expect(normalizeSex('MALE')).toBe('M')
  })

  it('maps Cyrillic abbreviations', () => {
    expect(normalizeSex('Ч')).toBe('M')
    expect(normalizeSex('Ж')).toBe('F')
    expect(normalizeSex('чол')).toBe('M')
    expect(normalizeSex('ЖЕНСК')).toBe('F')
  })

  it('returns null for unrecognized values', () => {
    expect(normalizeSex('')).toBeNull()
    expect(normalizeSex('other')).toBeNull()
    expect(normalizeSex('???')).toBeNull()
    expect(normalizeSex('Male/Female')).toBeNull()
  })
})

describe('normalizeAndValidate — combined pipeline', () => {
  it('rescues EAD AI-Brain US date for dob (regression for prod 16e558c)', () => {
    const r = normalizeAndValidate('dob', '02/14/1990')
    expect(r.ok).toBe(true)
    expect(r.value).toBe('1990-02-14')
  })

  it('rescues EAD AI-Brain US date for ead_expiration_date when unambiguous', () => {
    const r = normalizeAndValidate('ead_expiration_date', '12/31/2024')
    expect(r.ok).toBe(true)
    expect(r.value).toBe('2024-12-31')
  })

  it('REJECTS ambiguous US/EU date for ead_expiration_date (no guessing)', () => {
    const r = normalizeAndValidate('ead_expiration_date', '09/07/2024')
    expect(r.ok).toBe(false)
    expect(r.value).toBe('09/07/2024')
  })

  it('rescues Female → F for sex', () => {
    const r = normalizeAndValidate('sex', 'Female')
    expect(r.ok).toBe(true)
    expect(r.value).toBe('F')
  })

  it('still drops raw OCR garbage in DOB', () => {
    const r = normalizeAndValidate('dob', 'Date of birth 13 CEP / AUG 60')
    expect(r.ok).toBe(false)
  })

  it('preserves canonical inputs unchanged', () => {
    expect(normalizeAndValidate('dob', '1990-01-01')).toEqual({ ok: true, value: '1990-01-01' })
    expect(normalizeAndValidate('sex', 'M')).toEqual({ ok: true, value: 'M' })
    expect(normalizeAndValidate('passport_number', 'FA000000')).toEqual({ ok: true, value: 'FA000000' })
  })

  it('does not normalize fields without a rule', () => {
    const r = normalizeAndValidate('family_name', "О'Коннор")
    expect(r.ok).toBe(true)
    expect(r.value).toBe("О'Коннор")
  })
})
