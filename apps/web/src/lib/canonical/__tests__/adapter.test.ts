/**
 * adapter.test.ts — P2.2: readCanonicalDocumentFromTps maps the existing TPS
 * reader into a CanonicalDocumentResult, honoring the two invariants:
 *   1. never lower a source module's review flag;
 *   2. never drop a candidate — disagreement surfaces as review + retained evidence.
 */
import { describe, it, expect } from 'vitest'
import {
  toCanonicalField,
  mergeCanonicalByKey,
  readCanonicalDocumentFromTps,
} from '../adapter'
import type { TpsExtractedField } from '@/lib/tps/types'

/** Minimal TpsExtractedField factory — only the fields the adapter reads matter. */
function tf(p: Partial<TpsExtractedField> & { field: string; raw_value: string }): TpsExtractedField {
  return {
    field: p.field,
    raw_value: p.raw_value,
    normalized_value: p.normalized_value ?? p.raw_value,
    extraction_source: p.extraction_source ?? 'ocr_keyword',
    source_document_id: p.source_document_id ?? 'doc1',
    source_zone: p.source_zone ?? 'zone',
    bbox: null,
    language_layer: p.language_layer ?? 'latin',
    confidence: p.confidence ?? 0.95,
    review_required: p.review_required ?? false,
    ocr_word_ids: [],
    passes: p.passes ?? [],
    failures: p.failures ?? [],
    user_corrected: p.user_corrected ?? false,
  }
}

describe('P2.2 adapter — source + confidence mapping', () => {
  it('maps ocr_mrz → mrz with high source_match when the check digit passed', () => {
    const c = toCanonicalField(tf({ field: 'passport_number', raw_value: 'EK123456', extraction_source: 'ocr_mrz', passes: ['mrz_check_digit'], confidence: 0.9 }))
    expect(c.source).toBe('mrz')
    expect(c.confidence.source_match).toBe(0.99)
    expect(c.confidence.final).toBe(0.9) // min(ocr 0.9, source 0.99)
  })

  it('an MRZ check-digit FAILURE drags final down and forces review', () => {
    const c = toCanonicalField(tf({ field: 'passport_number', raw_value: 'EK123456', extraction_source: 'ocr_mrz', failures: ['mrz_check_digit'], confidence: 0.95 }))
    expect(c.confidence.source_match).toBe(0.3)
    expect(c.confidence.final).toBe(0.3)
    expect(c.reviewRequired).toBe(true)
  })

  it('user-entered values map to the lowest authority (manual_user_entry)', () => {
    const c = toCanonicalField(tf({ field: 'place_of_birth', raw_value: 'Lviv', extraction_source: 'user_input' }))
    expect(c.source).toBe('manual_user_entry')
  })
})

describe('P2.2 adapter — invariant 1: never lower the module review flag', () => {
  it('a module-flagged field stays reviewRequired even at perfect confidence', () => {
    const c = toCanonicalField(tf({ field: 'sex', raw_value: 'M', review_required: true, confidence: 1 }))
    expect(c.reviewRequired).toBe(true)
    expect(c.reviewReasons).toContain('source_module_review_required')
  })
})

describe('P2.2 adapter — invariant 2: keep candidates, surface disagreement', () => {
  it('two materially different readings of a critical field → review + both retained', () => {
    const merged = mergeCanonicalByKey([
      toCanonicalField(tf({ field: 'family_name', raw_value: 'KOVALENKO', normalized_value: 'Kovalenko', extraction_source: 'ocr_mrz', passes: ['mrz_check_digit'] })),
      toCanonicalField(tf({ field: 'family_name', raw_value: 'KOVALENENKO', normalized_value: 'Kovalenenko', extraction_source: 'ai_brain' })),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].evidence).toHaveLength(2) // nothing dropped
    expect(merged[0].reviewRequired).toBe(true)
    expect(merged[0].reviewReasons).toContain('provider_disagreement')
    // higher authority (MRZ) is the primary value
    expect(merged[0].source).toBe('mrz')
  })

  it('two AGREEING readings (after norm) do not force a disagreement review', () => {
    const merged = mergeCanonicalByKey([
      toCanonicalField(tf({ field: 'date_of_issue', raw_value: '2020-01-01', extraction_source: 'ocr_keyword', confidence: 0.95 })),
      toCanonicalField(tf({ field: 'date_of_issue', raw_value: '2020-01-01', extraction_source: 'ai_brain', confidence: 0.95 })),
    ])
    expect(merged[0].reviewReasons).not.toContain('provider_disagreement')
  })
})

describe('P2.2 adapter — document assembly', () => {
  it('builds a CanonicalDocumentResult; requiresReview true when a critical field is present', () => {
    const doc = readCanonicalDocumentFromTps({
      documentSessionId: 's1',
      product: 'tps',
      docType: 'passport',
      createdAt: '2026-05-30T00:00:00Z',
      fields: [
        tf({ field: 'family_name', raw_value: 'KOVALENKO', normalized_value: 'Kovalenko', extraction_source: 'ocr_mrz', passes: ['mrz_check_digit'] }),
        tf({ field: 'document_color', raw_value: 'blue', confidence: 0.99 }),
      ],
    })
    expect(doc.product).toBe('tps')
    expect(doc.fields).toHaveLength(2)
    // family_name is critical → always requires review → doc requiresReview
    expect(doc.requiresReview).toBe(true)
    expect(doc.hashes.canonicalResultHash).toBeNull() // hashing is a later phase
  })

  it('a doc with only low-criticality confident fields does NOT require review', () => {
    const doc = readCanonicalDocumentFromTps({
      documentSessionId: 's2',
      product: 'tps',
      docType: 'other',
      createdAt: '2026-05-30T00:00:00Z',
      fields: [tf({ field: 'document_color', raw_value: 'blue', confidence: 0.99 })],
    })
    expect(doc.requiresReview).toBe(false)
  })
})
