import { describe, it, expect } from 'vitest'
import { mergeToCentralBrain } from '../centralBrain'
import type { TpsExtractedField } from '@/lib/tps/types'

function field(
  name: string,
  value: string,
  src: TpsExtractedField['extraction_source'] = 'ocr_mrz',
): TpsExtractedField {
  return {
    field: name,
    raw_value: value,
    normalized_value: value,
    extraction_source: src,
    source_document_id: 'test',
    source_zone: 'test',
    bbox: null,
    language_layer: 'latin',
    confidence: 0.95,
    review_required: false,
    ocr_word_ids: [],
    passes: [],
    failures: [],
    user_corrected: false,
  }
}

describe('centralBrain.mergeToCentralBrain', () => {
  it('merges passport fields into merged packet', () => {
    const result = mergeToCentralBrain({
      uploads: {
        passport: [
          field('family_name', 'Kovalenko'),
          field('given_name', 'Olena'),
          field('dob', '1990-03-15'),
        ],
      },
      manual: {},
    })
    expect(result.merged['family_name']?.value).toBe('Kovalenko')
    expect(result.merged['given_name']?.value).toBe('Olena')
    expect(result.merged['dob']?.value).toBe('1990-03-15')
  })

  it('rejects forbidden fields per contract', () => {
    const result = mergeToCentralBrain({
      uploads: {
        booklet: [
          field('given_name', 'SomeValue', 'ai_brain'),  // forbidden for booklet
          field('family_name', 'Kovalenko', 'dual_ocr_crossref'),  // allowed
        ],
      },
      manual: {},
    })
    expect(result.merged['family_name']?.value).toBe('Kovalenko')
    const givenNameRejected = result.rejected.some(
      (r) => r.field === 'given_name' && r.slot === 'booklet',
    )
    expect(givenNameRejected).toBe(true)
  })

  it('prefers passport MRZ over booklet dual_ocr_crossref for family_name', () => {
    const result = mergeToCentralBrain({
      uploads: {
        passport: [field('family_name', 'Kovalenko', 'ocr_mrz')],
        booklet: [field('family_name', 'Коваленко', 'dual_ocr_crossref')],
      },
      manual: {},
    })
    // MRZ (passport) wins over booklet crossref for STRONG_IDENTITY
    expect(result.merged['family_name']?.value).toBe('Kovalenko')
    expect(result.merged['family_name']?.source_slot).toBe('passport')
  })

  it('accepts manual fields at lowest priority', () => {
    const result = mergeToCentralBrain({
      uploads: {},
      manual: { family_name: 'Petrenko', dob: '1985-01-01' },
    })
    expect(result.merged['family_name']?.value).toBe('Petrenko')
  })

  it('blocks hallucinated garbage names', () => {
    const result = mergeToCentralBrain({
      uploads: {
        ead: [field('given_name', 'Saghi<><>BiRH', 'ai_brain')],
      },
      manual: {},
    })
    // Garbage name should be rejected by hallucination guard
    const blocked = result.rejected.some((r) => r.field === 'given_name')
    expect(blocked).toBe(true)
  })

  it('reports missing required fields in readiness gate', () => {
    const result = mergeToCentralBrain({ uploads: {}, manual: {} })
    expect(result.readiness.ready).toBe(false)
    expect(result.readiness.missing_required).toContain('family_name')
    expect(result.readiness.missing_required).toContain('passport_number')
  })

  it('reports ready=true when all required fields present', () => {
    const result = mergeToCentralBrain({
      uploads: {
        passport: [
          field('family_name', 'Kovalenko'),
          field('given_name', 'Olena'),
          field('dob', '1990-03-15'),
          field('sex', 'F'),
          field('passport_number', 'FA000000'),
          field('passport_expiration_date', '2030-01-01'),
          field('country_of_nationality', 'Ukraine'),
        ],
        i94: [
          field('last_entry_date', '2022-09-09', 'ocr_keyword'),
          field('status_at_last_entry', 'UHP', 'ocr_keyword'),
        ],
      },
      manual: {},
    })
    expect(result.readiness.ready).toBe(true)
    expect(result.readiness.missing_required).toHaveLength(0)
  })
})
