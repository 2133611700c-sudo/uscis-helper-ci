import { describe, it, expect, afterEach } from 'vitest'
import { applyOcrFieldSafety, classifyCriticality, isOcrFieldSafetyEnabled, type SafeField } from '../applyOcrFieldSafety'

describe('classifyCriticality', () => {
  it('identity fields', () => {
    for (const f of ['family_name', 'given_name', 'patronymic', 'child_patronymic', 'dob', 'date_of_birth', 'place_of_birth_city', 'sex'])
      expect(classifyCriticality(f)).toBe('critical_identity')
  })
  it('document numbers', () => {
    for (const f of ['passport_number', 'doc_number', 'a_number', 'i94_admission_number'])
      expect(classifyCriticality(f)).toBe('critical_document')
  })
  it('admin / optional', () => {
    expect(classifyCriticality('us_address_state')).toBe('admin')
    expect(classifyCriticality('some_note')).toBe('optional')
  })
})

describe('isOcrFieldSafetyEnabled — default OFF', () => {
  afterEach(() => { delete process.env.OCR_FIELD_SAFETY_ENABLED })
  it('absent → false', () => { delete process.env.OCR_FIELD_SAFETY_ENABLED; expect(isOcrFieldSafetyEnabled()).toBe(false) })
  it('"1" → true', () => { expect(isOcrFieldSafetyEnabled({ OCR_FIELD_SAFETY_ENABLED: '1' })).toBe(true) })
})

describe('applyOcrFieldSafety — downgrades unsafe critical, keeps safe, never mutates input', () => {
  const baseFields: SafeField[] = [
    { field: 'family_name', value: 'X', raw_cyrillic: 'Ха', confidence: 0.95 },
    { field: 'patronymic', value: 'Y', raw_cyrillic: 'ович', confidence: 0.95 },
    { field: 'us_address_state', value: 'CA', confidence: 0.99 },
  ]

  it('hard-case birth cert → critical identity become candidate-only (value→null, candidate kept), admin stays', () => {
    const input = JSON.parse(JSON.stringify(baseFields))
    const { fields, anyUnresolvedCritical } = applyOcrFieldSafety(input, {
      flow: 'translation_public', document_class: 'birth_certificate_handwritten',
    })
    const fam = fields.find((f) => f.field === 'family_name')!
    expect(fam.value).toBeNull()
    expect(fam.candidate_value).toBe('X')      // raw read preserved as candidate
    expect(fam.review_required).toBe(true)
    expect(fam.manual_required).toBe(true)
    const addr = fields.find((f) => f.field === 'us_address_state')!
    expect(addr.value).toBe('CA')              // admin safe → kept
    expect(anyUnresolvedCritical).toBe(true)
    // input not mutated
    expect(baseFields[0].value).toBe('X')
  })

  it('safe printed doc with strong anchor + good conf → critical stays final', () => {
    const input = JSON.parse(JSON.stringify(baseFields))
    const { fields, anyUnresolvedCritical } = applyOcrFieldSafety(input, {
      flow: 'tps_core', document_class: 'ua_internal_passport_booklet',
      source_doc_type: 'ua_internal_passport_booklet', expected_source_doc_type: 'ua_internal_passport_booklet',
      strong_source_anchor: true,
    })
    expect(fields.find((f) => f.field === 'family_name')!.value).toBe('X')
    expect(anyUnresolvedCritical).toBe(false)
  })

  it('source mismatch → critical not final', () => {
    const input = JSON.parse(JSON.stringify(baseFields))
    const { fields } = applyOcrFieldSafety(input, {
      flow: 'tps_legacy', document_class: 'ua_birth_certificate',
      source_doc_type: 'ua_birth_certificate', expected_source_doc_type: 'ua_internal_passport_booklet',
      strong_source_anchor: true,
    })
    expect(fields.find((f) => f.field === 'family_name')!.value).toBeNull()
  })

  it('legacy reader (no strong anchor) → critical candidate-only', () => {
    const input = JSON.parse(JSON.stringify(baseFields))
    const { fields } = applyOcrFieldSafety(input, { flow: 'legacy_ocr', legacy_reader: true })
    expect(fields.find((f) => f.field === 'patronymic')!.value).toBeNull()
    expect(fields.find((f) => f.field === 'patronymic')!.safety_reason_codes).toContain('legacy_reader_untrusted')
  })

  it('zero recognition → critical blocked/manual even with strong anchor', () => {
    const input: SafeField[] = [{ field: 'family_name', value: null, confidence: 0 }]
    const { fields, anyUnresolvedCritical } = applyOcrFieldSafety(input, {
      flow: 'translation_public', document_class: 'ua_internal_passport_booklet', strong_source_anchor: true,
    }, { zeroRecognition: true })
    expect(fields[0].value).toBeNull()
    expect(fields[0].manual_required).toBe(true)
    expect(anyUnresolvedCritical).toBe(true)
  })
})
