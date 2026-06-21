/**
 * adapterTranslation.test.ts — the Translation half of the canonical adapter, plus
 * the cross-brain payoff: a TPS-canonical and a Translation-canonical for the SAME
 * document can now be measured against each other with diffCanonical.
 */
import { describe, it, expect } from 'vitest'
import {
  toCanonicalFieldFromTranslation,
  readCanonicalDocumentFromTranslation,
} from '../adapterTranslation'
import { readCanonicalDocumentFromTps } from '../adapter'
import { diffCanonical } from '../shadow'
import type { ExtractedField } from '@/lib/translation/types'
import type { TpsExtractedField } from '@/lib/tps/types'

function ef(p: Partial<ExtractedField> & { field: string; raw_value: string }): ExtractedField {
  return {
    field: p.field,
    source_label: p.source_label ?? 'label',
    source_zone: p.source_zone ?? 'visual',
    bbox: p.bbox ?? [0, 0, 0, 0],
    raw_value: p.raw_value,
    normalized_value: p.normalized_value ?? p.raw_value,
    language_layer: p.language_layer ?? 'uk',
    confidence: p.confidence ?? 0.95,
    review_required: p.review_required ?? false,
    passes: p.passes,
    user_corrected: p.user_corrected,
  }
}

function tf(p: Partial<TpsExtractedField> & { field: string; raw_value: string }): TpsExtractedField {
  return {
    field: p.field,
    raw_value: p.raw_value,
    normalized_value: p.normalized_value ?? p.raw_value,
    extraction_source: p.extraction_source ?? 'ocr_keyword',
    source_document_id: 'doc',
    source_zone: p.source_zone ?? 'zone',
    bbox: null,
    language_layer: p.language_layer ?? 'latin',
    confidence: p.confidence ?? 0.95,
    review_required: p.review_required ?? false,
    ocr_word_ids: [],
    passes: p.passes ?? [],
    failures: p.failures ?? [],
    user_corrected: false,
  }
}

describe('Translation adapter — source + invariants', () => {
  it('defaults to ai_vision; an MRZ zone → mrz; a user correction → manual', () => {
    expect(toCanonicalFieldFromTranslation(ef({ field: 'place_of_birth', raw_value: 'Lviv' })).source).toBe('ai_vision')
    expect(toCanonicalFieldFromTranslation(ef({ field: 'passport_number', raw_value: 'EK1', source_zone: 'mrz_line_2', passes: ['mrz_check_digit'] })).source).toBe('mrz')
    expect(toCanonicalFieldFromTranslation(ef({ field: 'family_name', raw_value: 'X', user_corrected: true })).source).toBe('manual_user_entry')
  })

  it('never lowers the reader review flag', () => {
    const c = toCanonicalFieldFromTranslation(ef({ field: 'sex', raw_value: 'M', review_required: true, confidence: 1 }))
    expect(c.reviewRequired).toBe(true)
    expect(c.reviewReasons).toContain('source_module_review_required')
  })

  it('builds a CanonicalDocumentResult with product=translation', () => {
    const doc = readCanonicalDocumentFromTranslation({
      documentSessionId: 's', docType: 'passport', createdAt: '2026-05-30T00:00:00Z',
      fields: [ef({ field: 'family_name', raw_value: 'Kovalenko' })],
    })
    expect(doc.product).toBe('translation')
    expect(doc.requiresReview).toBe(true) // family_name critical
  })
})

describe('cross-brain parity (the two-brain measurement)', () => {
  const session = 's1'
  const at = '2026-05-30T00:00:00Z'

  it('both brains agreeing on the same document → 100% parity, 0 critical disagreements', () => {
    const tps = readCanonicalDocumentFromTps({
      documentSessionId: session, product: 'tps', docType: 'passport', createdAt: at,
      fields: [
        tf({ field: 'family_name', raw_value: 'KOVALENKO', normalized_value: 'Kovalenko', extraction_source: 'ocr_mrz', passes: ['mrz_check_digit'] }),
        tf({ field: 'date_of_birth', raw_value: '1985-07-12', extraction_source: 'ocr_mrz', passes: ['mrz_check_digit'] }),
      ],
    })
    const tr = readCanonicalDocumentFromTranslation({
      documentSessionId: session, docType: 'passport', createdAt: at,
      fields: [
        ef({ field: 'family_name', raw_value: 'Kovalenko', source_zone: 'mrz_line_1', passes: ['mrz_check_digit'] }),
        ef({ field: 'date_of_birth', raw_value: '1985-07-12', source_zone: 'mrz_line_2', passes: ['mrz_check_digit'] }),
      ],
    })
    const report = diffCanonical(tps, tr)
    expect(report.parityRate).toBe(1)
    expect(report.criticalDisagreements).toBe(0)
  })

  it('the two brains disagreeing on a critical field is caught as a critical disagreement', () => {
    const tps = readCanonicalDocumentFromTps({
      documentSessionId: session, product: 'tps', docType: 'passport', createdAt: at,
      fields: [tf({ field: 'family_name', raw_value: 'KOVALENKO', normalized_value: 'Kovalenko', extraction_source: 'ocr_mrz', passes: ['mrz_check_digit'] })],
    })
    const tr = readCanonicalDocumentFromTranslation({
      documentSessionId: session, docType: 'passport', createdAt: at,
      fields: [ef({ field: 'family_name', raw_value: 'Kovalenenko' })],
    })
    const report = diffCanonical(tps, tr)
    expect(report.disagree).toBe(1)
    expect(report.criticalDisagreements).toBe(1)
  })
})
