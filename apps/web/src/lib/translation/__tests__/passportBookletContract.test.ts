/**
 * Passport Booklet Contract Tests — Phases 2, 3, 5
 *
 * These tests are the authoritative guard for:
 *   Phase 2: Contract completeness — 11 critical fields present, 14 total
 *   Phase 3: Evidence policy — bbox_status: missing → review_required on critical fields
 *   Phase 4: Date cross-check — date_of_birth zone must not overlap date_of_issue zone
 *   Phase 5: Name safety — patronymic label, no silent transliteration, INTERNAL_TO_SPEC correctness
 *
 * If any of these tests fail, the passport module is NOT safe for production.
 */
import { describe, it, expect } from 'vitest'
import {
  PASSPORT_BOOKLET_CRITICAL_FIELDS,
  PASSPORT_BOOKLET_EXTENDED_FIELDS,
  PASSPORT_BOOKLET_ALL_FIELDS,
  PASSPORT_BOOKLET_FIELD_KEYS,
  PASSPORT_BOOKLET_CRITICAL_KEYS,
  INTERNAL_TO_SPEC,
  SPEC_TO_INTERNAL,
  getPassportFieldContract,
  isPassportBookletField,
  isCriticalPassportField,
  getDisplayLabel,
  crossCheckDateZones,
} from '../passport/passportBookletContract'
import {
  UKRAINIAN_MONTHS,
  RUSSIAN_MONTHS,
  ALL_MONTHS,
} from '../numericAccuracy/dateFieldLockValidator'
import { analyseNameField } from '../../ocr/nameNormalizer'

// ════════════════════════════════════════════════════════════════════════════════
// PHASE 2 — Contract Completeness
// ════════════════════════════════════════════════════════════════════════════════

describe('Contract completeness — field counts', () => {
  it('has exactly 11 critical fields', () => {
    expect(PASSPORT_BOOKLET_CRITICAL_FIELDS.length).toBe(11)
  })

  it('has exactly 3 extended fields', () => {
    expect(PASSPORT_BOOKLET_EXTENDED_FIELDS.length).toBe(3)
  })

  it('has exactly 14 fields in total', () => {
    expect(PASSPORT_BOOKLET_ALL_FIELDS.length).toBe(14)
  })

  it('critical keys Set has exactly 11 entries', () => {
    expect(PASSPORT_BOOKLET_CRITICAL_KEYS.size).toBe(11)
  })

  it('all-keys Set has exactly 14 entries', () => {
    expect(PASSPORT_BOOKLET_FIELD_KEYS.size).toBe(14)
  })

  it('has no duplicate field keys', () => {
    const keys = PASSPORT_BOOKLET_ALL_FIELDS.map(f => f.key)
    const unique = new Set(keys)
    expect(unique.size).toBe(keys.length)
  })
})

describe('Contract completeness — all 11 critical keys present', () => {
  const REQUIRED_CRITICAL_KEYS = [
    'document_type',
    'series',
    'number',
    'surname',
    'given_names',
    'patronymic',
    'date_of_birth',
    'place_of_birth',
    'sex',
    'issued_by',
    'date_of_issue',
  ]

  for (const key of REQUIRED_CRITICAL_KEYS) {
    it(`critical field '${key}' is present`, () => {
      expect(PASSPORT_BOOKLET_CRITICAL_KEYS.has(key)).toBe(true)
    })

    it(`critical field '${key}' has critical: true`, () => {
      const contract = getPassportFieldContract(key)
      expect(contract?.critical).toBe(true)
    })

    it(`critical field '${key}' has on_missing: 'block' or 'warn_review'`, () => {
      const contract = getPassportFieldContract(key)
      // Critical fields must never be silently skipped
      expect(contract?.on_missing).not.toBe('skip')
    })
  }
})

describe('Contract completeness — extended fields are non-blocking', () => {
  const EXTENDED_KEYS = ['nationality', 'date_of_expiry', 'record_number']

  for (const key of EXTENDED_KEYS) {
    it(`extended field '${key}' has critical: false`, () => {
      const contract = getPassportFieldContract(key)
      expect(contract?.critical).toBe(false)
    })

    it(`extended field '${key}' has on_missing: 'skip'`, () => {
      const contract = getPassportFieldContract(key)
      expect(contract?.on_missing).toBe('skip')
    })
  }
})

// ════════════════════════════════════════════════════════════════════════════════
// PHASE 3 — Evidence Policy
// ════════════════════════════════════════════════════════════════════════════════

describe('Evidence policy — critical fields must block on missing bbox', () => {
  /**
   * Policy: when a field has bbox_status: 'missing', the extraction pipeline
   * must set review_required = true for critical fields.
   * This test verifies the CONTRACT states this intent (on_missing: 'block').
   * The actual enforcement is in the bbox resolver, but the contract is the spec.
   */

  it('all critical fields have on_missing: "block" or "warn_review"', () => {
    for (const field of PASSPORT_BOOKLET_CRITICAL_FIELDS) {
      expect(
        field.on_missing === 'block' || field.on_missing === 'warn_review',
        `Field '${field.key}' has on_missing: '${field.on_missing}' — must not be 'skip' for critical fields`
      ).toBe(true)
    }
  })

  it('date_of_birth has on_missing: "block" (cannot skip DOB)', () => {
    const contract = getPassportFieldContract('date_of_birth')
    expect(contract?.on_missing).toBe('block')
  })

  it('date_of_issue has on_missing: "block" (cannot skip DOI)', () => {
    const contract = getPassportFieldContract('date_of_issue')
    expect(contract?.on_missing).toBe('block')
  })

  it('series has on_missing: "block" (cannot skip passport series)', () => {
    const contract = getPassportFieldContract('series')
    expect(contract?.on_missing).toBe('block')
  })

  it('number has on_missing: "block" (cannot skip passport number)', () => {
    const contract = getPassportFieldContract('number')
    expect(contract?.on_missing).toBe('block')
  })

  it('patronymic has on_missing: "warn_review" (present in old passports, may be absent)', () => {
    const contract = getPassportFieldContract('patronymic')
    expect(contract?.on_missing).toBe('warn_review')
  })
})

describe('Evidence policy — expected evidence types', () => {
  it('series has expected_evidence: ocr_bbox (single token)', () => {
    expect(getPassportFieldContract('series')?.expected_evidence).toBe('ocr_bbox')
  })

  it('number has expected_evidence: ocr_bbox (single token)', () => {
    expect(getPassportFieldContract('number')?.expected_evidence).toBe('ocr_bbox')
  })

  it('issued_by has expected_evidence: combined_ocr_bbox (multi-word authority name)', () => {
    expect(getPassportFieldContract('issued_by')?.expected_evidence).toBe('combined_ocr_bbox')
  })

  it('date_of_birth has expected_evidence: combined_ocr_bbox (DD місяць YYYY)', () => {
    expect(getPassportFieldContract('date_of_birth')?.expected_evidence).toBe('combined_ocr_bbox')
  })

  it('patronymic has expected_evidence: combined_ocr_bbox (label is multi-word)', () => {
    expect(getPassportFieldContract('patronymic')?.expected_evidence).toBe('combined_ocr_bbox')
  })
})

// ════════════════════════════════════════════════════════════════════════════════
// PHASE 4 — Date Cross-Check
// ════════════════════════════════════════════════════════════════════════════════

describe('crossCheckDateZones — date_of_birth must not overlap date_of_issue zones', () => {
  it('dob in birth_block + doi in issuance_block → no conflict (null)', () => {
    const result = crossCheckDateZones({
      date_of_birth_zone: 'birth_block',
      date_of_issue_zone: 'issuance_block',
    })
    expect(result).toBeNull()
  })

  it('dob in personal_data + doi in issue_block → no conflict', () => {
    const result = crossCheckDateZones({
      date_of_birth_zone: 'personal_data',
      date_of_issue_zone: 'issue_block',
    })
    expect(result).toBeNull()
  })

  it('dob in issuance_block → conflict detected (possible field swap)', () => {
    // date_of_birth coming from the issuance zone is a red flag
    const result = crossCheckDateZones({
      date_of_birth_zone: 'issuance_block',
      date_of_issue_zone: 'issuance_block',
    })
    expect(result).not.toBeNull()
    expect(result).toContain('overlap')
  })

  it('doi in birth_block → conflict detected (field swap)', () => {
    const result = crossCheckDateZones({
      date_of_birth_zone: 'birth_block',
      date_of_issue_zone: 'birth_block',
    })
    expect(result).not.toBeNull()
  })

  it('missing zones → null (no crash)', () => {
    expect(crossCheckDateZones({})).toBeNull()
    expect(crossCheckDateZones({ date_of_birth_zone: 'birth_block' })).toBeNull()
    expect(crossCheckDateZones({ date_of_issue_zone: 'issuance_block' })).toBeNull()
  })
})

describe('Date zone locks — contract zones match dateFieldLockValidator', () => {
  it('date_of_birth allowed_zones includes birth_block', () => {
    const contract = getPassportFieldContract('date_of_birth')
    expect(contract?.allowed_zones).toContain('birth_block')
  })

  it('date_of_birth allowed_zones includes personal_data', () => {
    const contract = getPassportFieldContract('date_of_birth')
    expect(contract?.allowed_zones).toContain('personal_data')
  })

  it('date_of_issue allowed_zones includes issuance_block', () => {
    const contract = getPassportFieldContract('date_of_issue')
    expect(contract?.allowed_zones).toContain('issuance_block')
  })

  it('date_of_issue allowed_zones includes issue_block', () => {
    const contract = getPassportFieldContract('date_of_issue')
    expect(contract?.allowed_zones).toContain('issue_block')
  })

  it('date_of_birth and date_of_issue allowed zones do not overlap', () => {
    const dobZones = new Set(getPassportFieldContract('date_of_birth')?.allowed_zones ?? [])
    const doiZones = getPassportFieldContract('date_of_issue')?.allowed_zones ?? []
    const overlap = doiZones.filter(z => dobZones.has(z))
    expect(overlap).toHaveLength(0)
  })
})

// ════════════════════════════════════════════════════════════════════════════════
// PHASE 5 — Name Safety
// ════════════════════════════════════════════════════════════════════════════════

describe('Patronymic field — NOT labeled as Middle Name', () => {
  it('patronymic display.en is "Patronymic" (not "Middle Name")', () => {
    const contract = getPassportFieldContract('patronymic')
    expect(contract?.display.en).toBe('Patronymic')
    expect(contract?.display.en).not.toMatch(/middle/i)
  })

  it('patronymic display.ru is "Отчество"', () => {
    const contract = getPassportFieldContract('patronymic')
    expect(contract?.display.ru).toBe('Отчество')
  })

  it('patronymic display.uk is "По батькові"', () => {
    const contract = getPassportFieldContract('patronymic')
    expect(contract?.display.uk).toBe('По батькові')
  })

  it('patronymic has name_normalize in validators', () => {
    const contract = getPassportFieldContract('patronymic')
    expect(contract?.validators).toContain('name_normalize')
  })

  it('patronymic source_labels include "ПО БАТЬКОВІ"', () => {
    const contract = getPassportFieldContract('patronymic')
    expect(contract?.source_labels).toContain('ПО БАТЬКОВІ')
  })
})

describe('Name safety — analyseNameField does NOT silently transliterate', () => {
  it('Cyrillic ІВАН stays Cyrillic after analysis (no silent Sergiy/Ivan)', () => {
    const result = analyseNameField('ІВАН')
    // nameNormalizer does title-casing only, never Cyrillic→Latin transliteration
    expect(result.normalized).toMatch(/[А-ЯЄІЇҐа-яєіїґ]/)  // still contains Cyrillic
    expect(result.normalized).not.toMatch(/^[A-Za-z]+$/)     // is NOT pure Latin
  })

  it('ТАРАС stays Cyrillic — no silent transliteration to TARAS', () => {
    const result = analyseNameField('ТАРАС')
    expect(result.normalized).toMatch(/[А-ЯЄІЇҐа-яєіїґ]/)
    expect(result.review_required).toBe(false)  // clean Cyrillic, no flag
  })

  it('pure Cyrillic ШЕВЧЕНКО → not flagged as suspicious', () => {
    const result = analyseNameField('ШЕВЧЕНКО')
    expect(result.review_required).toBe(false)
  })

  it('Latin lookalike TAPAC → flagged for review (not silently accepted)', () => {
    const result = analyseNameField('TAPAC')
    expect(result.review_required).toBe(true)
    // normalized is still applied (title-case) but the flag ensures human checks
    expect(result.review_reason).toBeTruthy()
  })

  it('analyseNameField does not switch Olena to other spelling', () => {
    // Input: Latin transliteration already provided by DeepSeek
    // normalizer should not alter the spelling variant
    const result = analyseNameField('Olena')
    expect(result.normalized).toBe('Olena')   // title-case preserves the spelling
    expect(result.normalized).not.toBe('Sergiy')
    expect(result.normalized).not.toBe('Ivan')
  })

  it('analyseNameField Dmytro-Ivan hyphen → both parts title-cased, not rewritten', () => {
    const result = analyseNameField('DMYTRO-IVAN')
    expect(result.normalized).toBe('Dmytro-Ivan')
    expect(result.review_required).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════════════════════
// INTERNAL_TO_SPEC and label correctness
// ════════════════════════════════════════════════════════════════════════════════

describe('INTERNAL_TO_SPEC — spec labels are correct for renamed fields', () => {
  it('series → passport_series', () => {
    expect(INTERNAL_TO_SPEC['series']).toBe('passport_series')
  })

  it('number → passport_number', () => {
    expect(INTERNAL_TO_SPEC['number']).toBe('passport_number')
  })

  it('given_names → given_name', () => {
    expect(INTERNAL_TO_SPEC['given_names']).toBe('given_name')
  })

  it('issued_by → issuing_authority', () => {
    expect(INTERNAL_TO_SPEC['issued_by']).toBe('issuing_authority')
  })

  it('INTERNAL_TO_SPEC covers all 14 fields', () => {
    expect(Object.keys(INTERNAL_TO_SPEC).length).toBe(14)
  })

  it('SPEC_TO_INTERNAL round-trips correctly for renamed fields', () => {
    expect(SPEC_TO_INTERNAL['passport_series']).toBe('series')
    expect(SPEC_TO_INTERNAL['passport_number']).toBe('number')
    expect(SPEC_TO_INTERNAL['given_name']).toBe('given_names')
    expect(SPEC_TO_INTERNAL['issuing_authority']).toBe('issued_by')
  })
})

describe('getDisplayLabel — multilingual labels', () => {
  it('given_names in English → "Given Name"', () => {
    expect(getDisplayLabel('given_names', 'en')).toBe('Given Name')
  })

  it('given_names in Ukrainian → "Ім\'я"', () => {
    expect(getDisplayLabel('given_names', 'uk')).toBe("Ім'я")
  })

  it('given_names in Russian → "Имя"', () => {
    expect(getDisplayLabel('given_names', 'ru')).toBe('Имя')
  })

  it('issued_by in English → "Issuing Authority"', () => {
    expect(getDisplayLabel('issued_by', 'en')).toBe('Issuing Authority')
  })

  it('unknown key → returns the key itself (fallback)', () => {
    expect(getDisplayLabel('nonexistent_field', 'en')).toBe('nonexistent_field')
  })

  it('defaults to English when locale not specified', () => {
    expect(getDisplayLabel('surname')).toBe('Surname')
  })
})

describe('Lookup helpers', () => {
  it('isPassportBookletField returns true for all 14 keys', () => {
    for (const field of PASSPORT_BOOKLET_ALL_FIELDS) {
      expect(isPassportBookletField(field.key)).toBe(true)
    }
  })

  it('isPassportBookletField returns false for unknown keys', () => {
    expect(isPassportBookletField('full_name')).toBe(false)
    expect(isPassportBookletField('')).toBe(false)
    expect(isPassportBookletField('__proto__')).toBe(false)
  })

  it('isCriticalPassportField returns true for all 11 critical keys', () => {
    for (const field of PASSPORT_BOOKLET_CRITICAL_FIELDS) {
      expect(isCriticalPassportField(field.key)).toBe(true)
    }
  })

  it('isCriticalPassportField returns false for extended fields', () => {
    expect(isCriticalPassportField('nationality')).toBe(false)
    expect(isCriticalPassportField('date_of_expiry')).toBe(false)
    expect(isCriticalPassportField('record_number')).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════════════════════
// Month Maps — Canonical Export Verification
// ════════════════════════════════════════════════════════════════════════════════

describe('UKRAINIAN_MONTHS export — canonical source of truth', () => {
  it('has exactly 12 Ukrainian month entries', () => {
    expect(Object.keys(UKRAINIAN_MONTHS).length).toBe(12)
  })

  it('all 12 Ukrainian months are present', () => {
    const required = ['січня','лютого','березня','квітня','травня','червня',
                      'липня','серпня','вересня','жовтня','листопада','грудня']
    for (const m of required) {
      expect(UKRAINIAN_MONTHS).toHaveProperty(m)
    }
  })

  it('values are English month names', () => {
    expect(UKRAINIAN_MONTHS['січня']).toBe('January')
    expect(UKRAINIAN_MONTHS['грудня']).toBe('December')
    expect(UKRAINIAN_MONTHS['листопада']).toBe('November')
  })
})

describe('RUSSIAN_MONTHS export — canonical source of truth', () => {
  it('has exactly 12 Russian month entries', () => {
    expect(Object.keys(RUSSIAN_MONTHS).length).toBe(12)
  })

  it('all 12 Russian months are present', () => {
    const required = ['января','февраля','марта','апреля','мая','июня',
                      'июля','августа','сентября','октября','ноября','декабря']
    for (const m of required) {
      expect(RUSSIAN_MONTHS).toHaveProperty(m)
    }
  })

  it('values are English month names', () => {
    expect(RUSSIAN_MONTHS['января']).toBe('January')
    expect(RUSSIAN_MONTHS['декабря']).toBe('December')
  })
})

describe('ALL_MONTHS — combined map has no key collision', () => {
  it('has exactly 24 entries (12 UK + 12 RU, no shared keys)', () => {
    expect(Object.keys(ALL_MONTHS).length).toBe(24)
  })

  it('Ukrainian keys and Russian keys do not overlap', () => {
    const ukKeys = new Set(Object.keys(UKRAINIAN_MONTHS))
    const ruKeys = Object.keys(RUSSIAN_MONTHS)
    const overlap = ruKeys.filter(k => ukKeys.has(k))
    expect(overlap).toHaveLength(0)
  })
})
