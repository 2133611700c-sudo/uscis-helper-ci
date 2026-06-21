/**
 * TranslationCandidateSafetyGuard unit tests.
 *
 * Verifies all blocking rules: forbidden phrases, Militsiya→Police, Middle Name,
 * Cyrillic leak, label-as-value, and clean-pass scenarios.
 */

import { describe, it, expect } from 'vitest'
import { guardTranslationCandidates, collectViolationStrings } from '../translationCandidateSafetyGuard'
import type { TranslationFieldSet } from '../translationExtractor'

function baseFields(overrides: Partial<TranslationFieldSet> = {}): TranslationFieldSet {
  return {
    family_name:      'Ivanenko',
    given_name:       'Ivan',
    patronymic:       'Petrovych',
    date_of_birth:    'January 1, 1990',
    sex:              'Male',
    passport_number:  'FU 262473',
    city_of_birth:    'Vinnytsia',
    province_of_birth: 'Vinnytsia Oblast',
    issued_by:        'Department of the State Migration Service of Ukraine in Vinnytsia Oblast',
    date_of_issue:    'August 12, 2019',
    _sources:         {},
    ...overrides,
  }
}

describe('guardTranslationCandidates — clean canonical input', () => {
  it('returns safe=true with 0 violations for clean canonical input', () => {
    const result = guardTranslationCandidates(baseFields())
    expect(result.safe).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('returns safe=true when all fields are null', () => {
    const result = guardTranslationCandidates(baseFields({
      family_name: null, given_name: null, patronymic: null,
      date_of_birth: null, sex: null, passport_number: null,
      city_of_birth: null, province_of_birth: null,
      issued_by: null, date_of_issue: null,
    }))
    expect(result.safe).toBe(true)
  })
})

describe('guardTranslationCandidates — forbidden phrases', () => {
  it('blocks "certified by AI" in any field', () => {
    const result = guardTranslationCandidates(baseFields({
      issued_by: 'certified by AI — automated',
    }))
    expect(result.safe).toBe(false)
    expect(result.violations.some((v) => v.rule.includes('certified by AI'))).toBe(true)
  })

  it('blocks "USCIS accepted" in any field', () => {
    const result = guardTranslationCandidates(baseFields({ issued_by: 'USCIS accepted' }))
    expect(result.safe).toBe(false)
  })

  it('blocks "CERTIFIED COPY" in any field', () => {
    const result = guardTranslationCandidates(baseFields({ issued_by: 'CERTIFIED COPY' }))
    expect(result.safe).toBe(false)
  })

  it('blocks "guaranteed acceptance" phrase', () => {
    const result = guardTranslationCandidates(baseFields({ issued_by: 'guaranteed acceptance by USCIS' }))
    expect(result.safe).toBe(false)
  })
})

describe('guardTranslationCandidates — Middle Name hard rule', () => {
  it('blocks "Middle Name" in any field (must be "Patronymic")', () => {
    const result = guardTranslationCandidates(baseFields({ patronymic: 'Middle Name: Petrovych' }))
    expect(result.safe).toBe(false)
    expect(result.violations.some((v) => v.rule.includes('Middle Name'))).toBe(true)
  })
})

describe('guardTranslationCandidates — Militsiya/Police rule (pre-2015)', () => {
  it('blocks "Police Department" in issued_by', () => {
    const result = guardTranslationCandidates(baseFields({ issued_by: 'Vinnytsia Police Department' }))
    expect(result.safe).toBe(false)
    expect(result.violations.some((v) => v.rule.includes('Police Department'))).toBe(true)
  })

  it('blocks "passport police" in issued_by', () => {
    const result = guardTranslationCandidates(baseFields({ issued_by: 'passport police' }))
    expect(result.safe).toBe(false)
  })

  it('blocks "Militia" (wrong transliteration — must be "Militsiya")', () => {
    const result = guardTranslationCandidates(baseFields({ issued_by: 'Vinnytsia Militia Department' }))
    expect(result.safe).toBe(false)
    expect(result.violations.some((v) => v.rule.includes('militi'))).toBe(true)
  })

  it('does NOT block "Militsiya" (correct transliteration)', () => {
    const result = guardTranslationCandidates(baseFields({
      issued_by: 'Department of Internal Affairs of Ukraine — Militsiya of Vinnytsia Oblast',
    }))
    expect(result.safe).toBe(true)
  })
})

describe('guardTranslationCandidates — Cyrillic leak', () => {
  it('blocks Cyrillic in family_name (must be Latin/KMU-55)', () => {
    const result = guardTranslationCandidates(baseFields({ family_name: 'Іваненко' }))
    expect(result.safe).toBe(false)
    expect(result.violations.some((v) => v.rule === 'cyrillic_in_latin_required_field')).toBe(true)
  })

  it('blocks Cyrillic in given_name', () => {
    const result = guardTranslationCandidates(baseFields({ given_name: 'Іван' }))
    expect(result.safe).toBe(false)
  })

  it('blocks Cyrillic in issued_by', () => {
    const result = guardTranslationCandidates(baseFields({ issued_by: 'Вінницька обл.' }))
    expect(result.safe).toBe(false)
  })

  it('does NOT block Cyrillic in date_of_birth (numeric, not in LATIN_REQUIRED)', () => {
    // date fields don't have LATIN_REQUIRED constraint — they use formatDobForTranslation
    const result = guardTranslationCandidates(baseFields({ date_of_birth: 'January 1, 1990' }))
    expect(result.safe).toBe(true)
  })
})

describe('guardTranslationCandidates — label-as-value', () => {
  it('blocks "Прізвище" as a name value (OCR returned label not data)', () => {
    const result = guardTranslationCandidates(baseFields({ family_name: 'Прізвище' }))
    expect(result.safe).toBe(false)
    expect(result.violations.some((v) => v.rule === 'label_as_value')).toBe(true)
  })

  it('blocks "surname" as a name value', () => {
    const result = guardTranslationCandidates(baseFields({ family_name: 'surname' }))
    expect(result.safe).toBe(false)
  })

  it('blocks "Date of Birth" as a dob value', () => {
    const result = guardTranslationCandidates(baseFields({ date_of_birth: 'Date of Birth' }))
    expect(result.safe).toBe(false)
  })
})

describe('collectViolationStrings', () => {
  it('returns human-readable violation strings', () => {
    const guardResult = guardTranslationCandidates(baseFields({ family_name: 'Іваненко' }))
    const strings = collectViolationStrings(guardResult)
    expect(strings.length).toBeGreaterThan(0)
    expect(strings[0]).toMatch(/\[block\].*family_name.*cyrillic/)
  })

  it('truncates long values at 60 chars', () => {
    const longValue = 'A'.repeat(100)
    const guardResult = guardTranslationCandidates(baseFields({ issued_by: `certified by AI: ${longValue}` }))
    const strings = collectViolationStrings(guardResult)
    expect(strings.some((s) => s.includes('…'))).toBe(true)
  })
})
