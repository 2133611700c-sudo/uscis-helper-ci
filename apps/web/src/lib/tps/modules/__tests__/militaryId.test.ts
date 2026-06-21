/**
 * Unit tests for Military ID extraction module.
 *
 * Tests:
 *   - Core identity field extraction from typical OCR text
 *   - review_required=true always
 *   - No immigration fields (I-94, A-number, EAD)
 *   - Service page does not overwrite identity page fields
 *   - Date parsing with Ukrainian month names
 *   - Serial number parsing
 */

import { describe, it, expect } from 'vitest'
import { extractMilitaryId, parseUkrainianDate, runMilitaryIdModule, isLikelyPatronymicOrLabel, isAuthorityOcrGarbage } from '../militaryId'
import { lookupAuthority } from '@uscis-helper/knowledge'

// Typical military ID identity page OCR text (from real document test)
const TYPICAL_IDENTITY_OCR = `ВІЙСЬКОВИЙ КВИТОК
Серія Со № 845621
Іваненко
Іван
По батькові: Петрович
01 січня 1990 р.
Вінниця
Виданий Вінницьким РВК`

// Service page — should not contaminate identity fields
const SERVICE_PAGE_OCR = `Відомості про проходження служби
Дата призову: 15 жовтня 2005 р.
Частина: 34-а окрема бригада`

describe('extractMilitaryId', () => {
  it('extracts family_name from military ID raw text', () => {
    const result = extractMilitaryId(TYPICAL_IDENTITY_OCR)
    expect(result.family_name_cyrillic).toBe("Іваненко")
  })

  it('extracts given_name from military ID raw text', () => {
    const result = extractMilitaryId(TYPICAL_IDENTITY_OCR)
    expect(result.given_name_cyrillic).toBe('Іван')
  })

  it('extracts patronymic from "По батькові" label', () => {
    const result = extractMilitaryId(TYPICAL_IDENTITY_OCR)
    expect(result.patronymic_cyrillic).toBe('Петрович')
  })

  it('parses date_of_birth from Ukrainian month name format', () => {
    const result = extractMilitaryId(TYPICAL_IDENTITY_OCR)
    expect(result.date_of_birth).toBe('1990-01-01')
  })

  it('extracts military_id_number in Серія+№ format', () => {
    const result = extractMilitaryId(TYPICAL_IDENTITY_OCR)
    expect(result.military_id_number).toBe('Со 845621')
  })

  it('extracts military_id_series separately', () => {
    const result = extractMilitaryId(TYPICAL_IDENTITY_OCR)
    expect(result.military_id_series).toBe('Со')
  })

  it('review_required is always true', () => {
    const result = extractMilitaryId(TYPICAL_IDENTITY_OCR)
    expect(result.review_required).toBe(true)
  })

  it('review_required is true even for perfect OCR', () => {
    // Verify this is a hard constant, not computed from confidence
    const result = extractMilitaryId('ВІЙСЬКОВИЙ КВИТОК\nСерія АА № 123456\nПетренко\nВасиль\nПо батькові: Васильович\n01 січня 1990 р.')
    expect(result.review_required).toBe(true)
  })

  it('detects identity source page', () => {
    const result = extractMilitaryId(TYPICAL_IDENTITY_OCR)
    expect(result.source_page).toBe('identity')
  })

  it('detects service source page', () => {
    const result = extractMilitaryId(SERVICE_PAGE_OCR)
    expect(result.source_page).toBe('service')
  })
})

describe('extractMilitaryId — immigration fields must not be populated', () => {
  it('does not populate i94_admission_number from military ID', () => {
    // Verify by checking TpsModuleResult from runMilitaryIdModule
    const result = runMilitaryIdModule(
      { raw_text: TYPICAL_IDENTITY_OCR, lines: TYPICAL_IDENTITY_OCR.split('\n').filter(Boolean).map(t => ({ text: t })) },
      { document_id: 'test' }
    )
    const fieldNames = result.fields.map(f => f.field)
    expect(fieldNames).not.toContain('i94_admission_number')
    expect(fieldNames).not.toContain('a_number')
    expect(fieldNames).not.toContain('ead_category_on_card')
    expect(fieldNames).not.toContain('ead_expiration_date')
    expect(fieldNames).not.toContain('us_address_street')
  })

  it('all module fields have review_required=true', () => {
    const result = runMilitaryIdModule(
      { raw_text: TYPICAL_IDENTITY_OCR, lines: TYPICAL_IDENTITY_OCR.split('\n').filter(Boolean).map(t => ({ text: t })) },
      { document_id: 'test' }
    )
    for (const field of result.fields) {
      expect(field.review_required).toBe(true)
    }
  })

  it('module manual_review_required is always true', () => {
    const result = runMilitaryIdModule(
      { raw_text: TYPICAL_IDENTITY_OCR, lines: TYPICAL_IDENTITY_OCR.split('\n').filter(Boolean).map(t => ({ text: t })) },
      { document_id: 'test' }
    )
    expect(result.manual_review_required).toBe(true)
  })
})

describe('extractMilitaryId — service page does not overwrite identity fields', () => {
  it('service page OCR produces no family_name', () => {
    const result = extractMilitaryId(SERVICE_PAGE_OCR)
    // Service page has no identity fields — should not produce name fields
    expect(result.family_name_cyrillic).toBeNull()
    expect(result.given_name_cyrillic).toBeNull()
  })

  it('service page does not produce a date_of_birth (призову ≠ народження)', () => {
    // "15 жовтня 2005" is призову date not birth date
    const result = extractMilitaryId(SERVICE_PAGE_OCR)
    // Birth year 2005 is outside plausible range (< 1920 || > 2010 in birth-year filter)
    // so dob should be null
    expect(result.date_of_birth).toBeNull()
  })
})

// ── PHASE 1 guards: given_name rejection + authority quality ─────────────────

describe('isLikelyPatronymicOrLabel — guard for OCR-label-as-given-name', () => {
  it('rejects "По батьковим Іванови" (patronymic label OCR confusion)', () => {
    expect(isLikelyPatronymicOrLabel('По батьковим Іванови')).toBe(true)
  })

  it('rejects "По батькові" (label text)', () => {
    expect(isLikelyPatronymicOrLabel('По батькові')).toBe(true)
  })

  it('rejects "по батьков" prefix variants', () => {
    expect(isLikelyPatronymicOrLabel('по батьков')).toBe(true)
  })

  it('accepts "Іван" (normal given name)', () => {
    expect(isLikelyPatronymicOrLabel('Іван')).toBe(false)
  })

  it('accepts "Василь" (normal given name)', () => {
    expect(isLikelyPatronymicOrLabel('Василь')).toBe(false)
  })

  it('rejects text longer than 35 chars (too long for a given name)', () => {
    expect(isLikelyPatronymicOrLabel('АБВГДЄЖЗИІЙКЛМНОПРСТУФХЦЧШЩЬЮЯАБВГДа')).toBe(true)
  })
})

describe('given_name guard: patronymic OCR confusion rejected in extraction', () => {
  it('given_name "По батьковим Іванови" is not emitted by extraction (inline tail)', () => {
    // OCR where "ім'я" label and patronymic text land on the same line (inline confusion)
    const ocr = `ВІЙСЬКОВИЙ КВИТОК
Серія Со № 845621
Іваненко
ім'я По батьковим Іванови
01 січня 1990 р.
Виданий Вінницьким РВК`
    const result = runMilitaryIdModule(
      { raw_text: ocr, lines: ocr.split('\n').filter(Boolean).map(t => ({ text: t })) },
      { document_id: 'test' }
    )
    const fn = result.fields.find(f => f.field === 'given_name')
    // Must not store the patronymic label confusion
    if (fn) {
      expect(fn.raw_value).not.toMatch(/по батьк/i)
      expect(fn.raw_value).not.toMatch(/батьков/i)
    }
    // Warning must be emitted
    expect(result.warnings).toContain('military_id_given_name_rejected_patronymic_or_label')
  })

  it('given_name "Іван" is accepted and emitted', () => {
    const result = extractMilitaryId(TYPICAL_IDENTITY_OCR)
    expect(result.given_name_cyrillic).toBe('Іван')
  })
})

describe('isAuthorityOcrGarbage — guard for bad OCR authority text', () => {
  it('rejects "гровоградськельковим" (OCR garbled single token)', () => {
    expect(isAuthorityOcrGarbage('гровоградськельковим')).toBe(true)
  })

  it('rejects empty string', () => {
    expect(isAuthorityOcrGarbage('')).toBe(true)
  })

  it('rejects text shorter than 5 chars', () => {
    expect(isAuthorityOcrGarbage('РВК')).toBe(true)
  })

  it('accepts "Вінницький РВК" (known good authority)', () => {
    expect(isAuthorityOcrGarbage('Вінницький РВК')).toBe(false)
  })

  it('accepts "ТЦК Вінниці" (short valid format)', () => {
    expect(isAuthorityOcrGarbage('ТЦК Вінниці')).toBe(false)
  })

  it('rejects a concatenated Cyrillic word longer than 20 chars (OCR noise pattern)', () => {
    expect(isAuthorityOcrGarbage('кіровоградськельковим додаток')).toBe(true)
  })
})

describe('dob normalization: "01 січня 1990 р." → "1990-01-01"', () => {
  it('parseUkrainianDate normalizes dob from military booklet format', () => {
    expect(parseUkrainianDate('01 січня 1990 р.')).toBe('1990-01-01')
  })

  it('runMilitaryIdModule correctly normalizes dob field', () => {
    const result = runMilitaryIdModule(
      { raw_text: TYPICAL_IDENTITY_OCR, lines: TYPICAL_IDENTITY_OCR.split('\n').filter(Boolean).map(t => ({ text: t })) },
      { document_id: 'test' }
    )
    const dob = result.fields.find(f => f.field === 'dob')
    expect(dob?.normalized_value).toBe('1990-01-01')
  })
})

// ── PHASE 5: Agency registry — historical Militsiya must not become "Police" ──

describe('agency registry: Міліція → Militsiya (not Police)', () => {
  it('historical Міліція (1986 doc) → "Militsiya", never "Police"', () => {
    const result = lookupAuthority('Міліція', '1986')
    if (result.matched && result.official_en) {
      expect(result.official_en).toBe('Militsiya')
      expect(result.official_en).not.toMatch(/police/i)
      expect(result.official_en).not.toMatch(/militia/i) // USCIS uses "Militsiya" not "Militia"
    } else {
      // If not matched, review_required must be true — never silently wrong
      expect(result.review_required).toBe(true)
    }
  })

  it('2020 doc with "Міліція" → era mismatch flagged, review_required=true', () => {
    const result = lookupAuthority('Міліція', '2020')
    expect(result.review_required).toBe(true)
  })
})

describe('parseUkrainianDate', () => {
  it('parses written-out Ukrainian month', () => {
    expect(parseUkrainianDate('01 січня 1990 р.')).toBe('1990-01-01')
    expect(parseUkrainianDate('1 січня 2000 р.')).toBe('2000-01-01')
    expect(parseUkrainianDate('15 грудня 1975')).toBe('1975-12-15')
  })

  it('parses all 12 Ukrainian month names', () => {
    const months = [
      ['січня', '01'], ['лютого', '02'], ['березня', '03'], ['квітня', '04'],
      ['травня', '05'], ['червня', '06'], ['липня', '07'], ['серпня', '08'],
      ['вересня', '09'], ['жовтня', '10'], ['листопада', '11'], ['грудня', '12'],
    ]
    for (const [month, num] of months) {
      expect(parseUkrainianDate(`1 ${month} 1986`)).toBe(`1986-${num}-01`)
    }
  })

  it('parses numeric date formats', () => {
    expect(parseUkrainianDate('01.01.1990')).toBe('1990-01-01')
    expect(parseUkrainianDate('14/02/1990')).toBe('1990-02-14')
    expect(parseUkrainianDate('14-02-1990')).toBe('1990-02-14')
  })

  it('returns null for unparseable input', () => {
    expect(parseUkrainianDate('')).toBeNull()
    expect(parseUkrainianDate('not a date')).toBeNull()
    expect(parseUkrainianDate('ВІЙСЬКОВИЙ КВИТОК')).toBeNull()
  })

  it('rejects implausible months', () => {
    expect(parseUkrainianDate('31 тринадцятого 1986')).toBeNull() // no month match
  })
})
