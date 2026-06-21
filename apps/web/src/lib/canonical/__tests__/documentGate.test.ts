/**
 * documentGate.test.ts — Document-Type Confidence Gate + Provider Output Quarantine.
 */
import { describe, it, expect } from 'vitest'
import { applyDocumentTypeGate, partitionQuarantine, DOC_TYPE_GATE_THRESHOLD } from '../documentGate'
import { buildConfidence } from '../policy'
import type { CanonicalDocumentResult, CanonicalField } from '../types'

function field(key: string, reviewRequired = false): CanonicalField {
  return {
    key,
    rawValue: 'v',
    normalizedValue: 'v',
    criticality: 'low',
    confidence: buildConfidence({ ocr: 0.99, field_match: 0.99, normalization: null, source_match: null }),
    source: 'document_ocr',
    reviewRequired,
    reviewReasons: reviewRequired ? ['low_final_confidence'] : [],
    evidence: [],
  }
}

function doc(fields: CanonicalField[], requiresReview = false): CanonicalDocumentResult {
  return {
    documentSessionId: 's',
    product: 'tps',
    docType: 'unknown',
    fields,
    hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
    createdAt: '2026-05-30T00:00:00Z',
    requiresReview,
  }
}

describe('Document-Type Confidence Gate', () => {
  it('low doc-type confidence quarantines EVERY field for review', () => {
    const out = applyDocumentTypeGate(doc([field('document_color'), field('sex')]), 0.4)
    expect(out.requiresReview).toBe(true)
    expect(out.fields.every((f) => f.reviewRequired)).toBe(true)
    expect(out.fields.every((f) => f.reviewReasons.includes('unknown_document_type'))).toBe(true)
  })

  it('confident doc type leaves the result unchanged', () => {
    const input = doc([field('document_color')])
    const out = applyDocumentTypeGate(input, 0.95)
    expect(out).toBe(input)
  })

  it('threshold boundary: exactly at threshold passes (unchanged)', () => {
    const input = doc([field('document_color')])
    expect(applyDocumentTypeGate(input, DOC_TYPE_GATE_THRESHOLD)).toBe(input)
  })

  it('does not duplicate the reason if already gated', () => {
    const out = applyDocumentTypeGate(applyDocumentTypeGate(doc([field('sex')]), 0.4), 0.4)
    const reasons = out.fields[0].reviewReasons.filter((r) => r === 'unknown_document_type')
    expect(reasons.length).toBe(1)
  })
})

describe('Provider Output Quarantine', () => {
  it('splits accepted (no review) vs quarantined (review required)', () => {
    const { accepted, quarantined } = partitionQuarantine(
      doc([field('document_color', false), field('family_name', true)]),
    )
    expect(accepted.map((f) => f.key)).toEqual(['document_color'])
    expect(quarantined.map((f) => f.key)).toEqual(['family_name'])
  })

  it('after a failed doc-type gate, NOTHING is accepted', () => {
    const gated = applyDocumentTypeGate(doc([field('document_color'), field('sex')]), 0.3)
    const { accepted, quarantined } = partitionQuarantine(gated)
    expect(accepted).toHaveLength(0)
    expect(quarantined).toHaveLength(2)
  })
})
