/**
 * liveShadow.test.ts — the single-stack TPS shadow summary used behind
 * ONE_BRAIN_SHADOW. PII-free, deterministic, surfaces the review shift.
 */
import { describe, it, expect } from 'vitest'
import { summarizeTpsReviewShift } from '../liveShadow'
import type { TpsExtractedField } from '@/lib/tps/types'

function tf(p: Partial<TpsExtractedField> & { field: string; raw_value: string }): TpsExtractedField {
  return {
    field: p.field,
    raw_value: p.raw_value,
    normalized_value: p.normalized_value ?? p.raw_value,
    extraction_source: p.extraction_source ?? 'ocr_keyword',
    source_document_id: 'doc',
    source_zone: 'zone',
    bbox: null,
    language_layer: 'latin',
    confidence: p.confidence ?? 0.95,
    review_required: p.review_required ?? false,
    ocr_word_ids: [],
    passes: p.passes ?? [],
    failures: p.failures ?? [],
    user_corrected: false,
  }
}

const meta = { documentSessionId: 's', docType: 'passport', createdAt: '2026-05-30T00:00:00Z' }

describe('liveShadow — summarizeTpsReviewShift', () => {
  it('surfaces +review when the canonical policy flags a critical field the live brain did not', () => {
    // live: family_name NOT flagged; canonical: critical → always review
    const s = summarizeTpsReviewShift([tf({ field: 'family_name', raw_value: 'Kovalenko', review_required: false })], meta)
    expect(s).toContain('+review=1')
    expect(s).toContain('family_name')
    expect(s).toContain('requiresReview=true')
  })

  it('never DROPS a live review flag (-review is always 0)', () => {
    const s = summarizeTpsReviewShift([tf({ field: 'document_color', raw_value: 'blue', review_required: true })], meta)
    expect(s).toContain('-review=0')
  })

  it('a confident low-criticality field adds no review', () => {
    const s = summarizeTpsReviewShift([tf({ field: 'document_color', raw_value: 'blue', confidence: 0.99 })], meta)
    expect(s).toContain('+review=0')
    expect(s).toContain('requiresReview=false')
  })

  it('is PII-free — keys appear, values do not', () => {
    const s = summarizeTpsReviewShift([tf({ field: 'family_name', raw_value: 'Kovalenko' })], meta)
    expect(s).toContain('family_name')
    expect(s).not.toContain('Kovalenko')
  })
})
