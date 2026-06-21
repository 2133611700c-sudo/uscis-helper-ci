/**
 * tpsAdapter.test.ts — B1: canonical → TPS field adapter.
 *
 * Verifies: mapTpsHintToDocintelId, canonicalFieldToTpsField,
 * canonicalToTpsModuleResult. No I/O, no Gemini calls.
 */
import { describe, it, expect } from 'vitest'
import { mapTpsHintToDocintelId, canonicalFieldToTpsField, canonicalToTpsModuleResult } from '../tpsAdapter'
import type { CanonicalField } from '../../types'

function makeField(overrides: Partial<CanonicalField> & { key: string }): CanonicalField {
  return {
    rawValue: 'Kovalenko',
    normalizedValue: 'Kovalenko',
    criticality: 'critical',
    confidence: { ocr: 0.9, field_match: null, normalization: null, source_match: null, final: 0.9 },
    source: 'ai_vision',
    reviewRequired: true,
    reviewReasons: ['critical_no_mrz_anchor'],
    evidence: [],
    ...overrides,
  }
}

describe('mapTpsHintToDocintelId', () => {
  it('maps passport → ua_international_passport', () => {
    expect(mapTpsHintToDocintelId('passport')).toBe('ua_international_passport')
  })
  it('maps booklet → ua_internal_passport_booklet', () => {
    expect(mapTpsHintToDocintelId('booklet')).toBe('ua_internal_passport_booklet')
  })
  it('returns null for i94 (US form, no docintel mapping)', () => {
    expect(mapTpsHintToDocintelId('i94')).toBeNull()
  })
  it('returns null for ead', () => {
    expect(mapTpsHintToDocintelId('ead')).toBeNull()
  })
  it('returns null for dl', () => {
    expect(mapTpsHintToDocintelId('dl')).toBeNull()
  })
})

describe('canonicalFieldToTpsField', () => {
  it('produces TpsExtractedField with canonical_core source', () => {
    const f = makeField({ key: 'family_name' })
    const tps = canonicalFieldToTpsField(f, 'doc_123')
    expect(tps.field).toBe('family_name')
    expect(tps.extraction_source).toBe('canonical_core')
    expect(tps.raw_value).toBe('Kovalenko')
    expect(tps.normalized_value).toBe('Kovalenko')
    expect(tps.review_required).toBe(true)
    expect(tps.source_document_id).toBe('doc_123')
    expect(tps.bbox).toBeNull()
    expect(tps.ocr_word_ids).toEqual([])
  })

  it('review_required=false when Core did not flag it', () => {
    const f = makeField({ key: 'sex', reviewRequired: false, reviewReasons: [] })
    const tps = canonicalFieldToTpsField(f, 'doc_x')
    expect(tps.review_required).toBe(false)
  })

  it('preserves null normalized_value as raw_value fallback', () => {
    const f = makeField({ key: 'place_of_birth', normalizedValue: null })
    const tps = canonicalFieldToTpsField(f, 'doc_x')
    expect(tps.normalized_value).toBe('Kovalenko') // falls back to rawValue
  })

  it('mrz source → language_layer=mrz', () => {
    const f = makeField({ key: 'passport_number', source: 'mrz' })
    const tps = canonicalFieldToTpsField(f, 'doc_x')
    expect(tps.language_layer).toBe('mrz')
  })
})

describe('canonicalToTpsModuleResult', () => {
  it('converts fields and sets module name', () => {
    const fields = [
      makeField({ key: 'family_name' }),
      makeField({ key: 'given_name', reviewRequired: false, reviewReasons: [] }),
    ]
    const result = canonicalToTpsModuleResult(fields, 'booklet', 'doc_abc')
    expect(result.module).toBeDefined()
    expect(result.matched).toBe(true)
    expect(result.fields).toHaveLength(2)
    expect(result.manual_review_required).toBe(true) // family_name is review_required
  })

  it('matched=false and manual_review_required=false for empty fields', () => {
    const result = canonicalToTpsModuleResult([], 'passport', 'doc_x')
    expect(result.matched).toBe(false)
    expect(result.manual_review_required).toBe(false)
    expect(result.fields).toHaveLength(0)
  })

  it('all fields get extraction_source=canonical_core', () => {
    const fields = [makeField({ key: 'dob' }), makeField({ key: 'sex' })]
    const result = canonicalToTpsModuleResult(fields, 'passport', 'doc_y')
    expect(result.fields.every(f => f.extraction_source === 'canonical_core')).toBe(true)
  })
})
