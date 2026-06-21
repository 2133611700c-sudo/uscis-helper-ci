import { describe, it, expect } from 'vitest'
import {
  resolveField,
  resolveAllFields,
  ExtractedCandidate,
  FIELD_CLASS,
} from '../fieldArbiter'

describe('Field Arbiter v0', () => {
  // CASE 1: MRZ wins over weaker OCR
  it('MRZ identity lock: Ivan wins over Saghi', () => {
    const candidates: ExtractedCandidate[] = [
      { field: 'given_name', value: 'Ivan', sourceDoc: 'passport', sourceType: 'ocr_mrz', confidence: 0.99, reviewRequired: false },
      { field: 'given_name', value: 'Saghi', sourceDoc: 'ead', sourceType: 'ai_brain', confidence: 0.7, reviewRequired: true },
    ]
    const result = resolveField('given_name', candidates)
    expect(result.chosenValue).toBe('Ivan')
    expect(result.locked).toBe(true)
    expect(result.conflict).toBe(true)
    expect(result.rejectedCandidates).toHaveLength(1)
    expect(result.rejectedCandidates[0].value).toBe('Saghi')
    expect(result.notes).toContain('mrz_locked')
  })

  // CASE 2: booklet garbage rejected
  it('weak booklet garbage: null chosen, review required', () => {
    const candidates: ExtractedCandidate[] = [
      { field: 'city_of_birth', value: null, sourceDoc: 'booklet', sourceType: 'ai_brain', confidence: 0.9, reviewRequired: true },
    ]
    const result = resolveField('city_of_birth', candidates)
    expect(result.chosenValue).toBeNull()
    expect(result.reviewRequired).toBe(true)
  })

  // CASE 3: EAD gives valid a_number
  it('a_number from EAD wins', () => {
    const candidates: ExtractedCandidate[] = [
      { field: 'a_number', value: '000-000-000', sourceDoc: 'ead', sourceType: 'ai_brain', confidence: 0.9, reviewRequired: false },
    ]
    const result = resolveField('a_number', candidates)
    expect(result.chosenValue).toBe('000-000-000')
    expect(result.chosenSourceDoc).toBe('ead')
  })

  // CASE 4: I-94 entry fields
  it('I-94 fields from I-94 source', () => {
    const candidates: ExtractedCandidate[] = [
      { field: 'last_entry_date', value: '2022-09-09', sourceDoc: 'i94', sourceType: 'ocr_keyword', confidence: 0.95, reviewRequired: false },
    ]
    const result = resolveField('last_entry_date', candidates)
    expect(result.chosenValue).toBe('2022-09-09')
    expect(result.chosenSourceDoc).toBe('i94')
  })

  // CASE 5: DL address wins for address fields
  it('DL address wins over manual', () => {
    const candidates: ExtractedCandidate[] = [
      { field: 'us_address_street', value: '1213 Gordon St', sourceDoc: 'dl', sourceType: 'ocr_keyword', confidence: 0.9, reviewRequired: false },
      { field: 'us_address_street', value: '123 Main St', sourceDoc: 'manual', sourceType: 'manual', confidence: null, reviewRequired: false },
    ]
    const result = resolveField('us_address_street', candidates)
    expect(result.chosenValue).toBe('1213 Gordon St')
    expect(result.chosenSourceDoc).toBe('dl')
  })

  // CASE 6: user correction always wins
  it('user correction overrides MRZ', () => {
    const candidates: ExtractedCandidate[] = [
      { field: 'given_name', value: 'Ivan', sourceDoc: 'passport', sourceType: 'ocr_mrz', confidence: 0.99, reviewRequired: false },
      { field: 'given_name', value: 'Ivan', sourceDoc: 'manual', sourceType: 'user_corrected', confidence: null, reviewRequired: false },
    ]
    const result = resolveField('given_name', candidates)
    expect(result.chosenValue).toBe('Ivan')
    expect(result.locked).toBe(false) // user correction, not MRZ
  })

  // CASE 7: resolveAllFields batch test
  it('resolveAllFields: full packet resolution', () => {
    const result = resolveAllFields({
      uploads: {
        passport: [
          { field: 'family_name', value: 'Ivanenko', sourceDoc: 'passport', sourceType: 'ocr_mrz', confidence: 0.99, reviewRequired: false },
          { field: 'given_name', value: 'Ivan', sourceDoc: 'passport', sourceType: 'ocr_mrz', confidence: 0.99, reviewRequired: false },
          { field: 'dob', value: '1990-01-01', sourceDoc: 'passport', sourceType: 'ocr_mrz', confidence: 0.99, reviewRequired: false },
          { field: 'passport_expiration_date', value: '2030-01-01', sourceDoc: 'passport', sourceType: 'ocr_mrz', confidence: 0.99, reviewRequired: false },
        ],
        ead: [
          { field: 'given_name', value: 'Saghi', sourceDoc: 'ead', sourceType: 'ai_brain', confidence: 0.7, reviewRequired: true },
          { field: 'a_number', value: '231853474', sourceDoc: 'ead', sourceType: 'ai_brain', confidence: 0.9, reviewRequired: false },
        ],
        i94: [
          { field: 'last_entry_date', value: '2022-09-09', sourceDoc: 'i94', sourceType: 'ocr_keyword', confidence: 0.95, reviewRequired: false },
          { field: 'i94_admission_number', value: '000000000A0', sourceDoc: 'i94', sourceType: 'ocr_keyword', confidence: 0.95, reviewRequired: false },
        ],
        booklet: [
          { field: 'city_of_birth', value: 'Vinnytsia', sourceDoc: 'booklet', sourceType: 'ai_brain', confidence: 0.9, reviewRequired: true },
        ],
      },
      manual: {},
    })

    // MRZ identity locked
    expect(result.resolvedFields.given_name.chosenValue).toBe('Ivan')
    expect(result.resolvedFields.given_name.locked).toBe(true)
    expect(result.lockedFields).toContain('given_name')

    // Saghi rejected
    expect(result.allRejected.given_name).toBeDefined()
    expect(result.allRejected.given_name[0].value).toBe('Saghi')

    // A-number from EAD
    expect(result.resolvedFields.a_number.chosenValue).toBe('231853474')

    // I-94 fields
    expect(result.resolvedFields.last_entry_date.chosenValue).toBe('2022-09-09')

    // Weak booklet field
    expect(result.resolvedFields.city_of_birth.chosenValue).toBe('Vinnytsia')
    expect(result.resolvedFields.city_of_birth.reviewRequired).toBe(true)

    // Passport expiration
    expect(result.resolvedFields.passport_expiration_date.chosenValue).toBe('2030-01-01')

    // Conflict count
    expect(result.conflictCount).toBe(1) // given_name conflict
  })

  // CASE 8: field class mapping
  it('field classes are correctly defined', () => {
    expect(FIELD_CLASS.family_name).toBe('STRONG_IDENTITY')
    expect(FIELD_CLASS.a_number).toBe('STRONG_DOCUMENT')
    expect(FIELD_CLASS.city_of_birth).toBe('WEAK_REVIEW')
  })

  // CASE 9: no candidates → null + review required
  it('no candidates: returns null with review required', () => {
    const result = resolveField('middle_name', [])
    expect(result.chosenValue).toBeNull()
    expect(result.reviewRequired).toBe(true)
  })

  // CASE 10: same value from multiple sources = no conflict
  it('same value from multiple sources: no conflict', () => {
    const candidates: ExtractedCandidate[] = [
      { field: 'family_name', value: 'Ivanenko', sourceDoc: 'passport', sourceType: 'ocr_mrz', confidence: 0.99, reviewRequired: false },
      { field: 'family_name', value: 'IVANENKO', sourceDoc: 'i94', sourceType: 'ocr_keyword', confidence: 0.9, reviewRequired: false },
    ]
    const result = resolveField('family_name', candidates)
    expect(result.chosenValue).toBe('Ivanenko')
    expect(result.conflict).toBe(false) // same value, different case
    expect(result.locked).toBe(true)
  })
})
