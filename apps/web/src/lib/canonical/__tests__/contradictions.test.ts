/**
 * contradictions.test.ts — Cross-Document Contradiction Detector.
 */
import { describe, it, expect } from 'vitest'
import { findCrossDocumentContradictions, hasBlockingContradiction } from '../contradictions'
import { buildConfidence } from '../policy'
import type { CanonicalField, SourceKind } from '../types'

function field(key: string, value: string, source: SourceKind, provider = 'p'): CanonicalField {
  return {
    key,
    rawValue: value,
    normalizedValue: value,
    criticality: 'low',
    confidence: buildConfidence({ ocr: 0.9, field_match: null, normalization: null, source_match: null }),
    source,
    reviewRequired: false,
    reviewReasons: [],
    evidence: [{ value, source, confidence: 0.9, provider }],
  }
}

describe('Cross-Document Contradiction Detector', () => {
  it('agreement across documents → no contradiction', () => {
    const out = findCrossDocumentContradictions([
      field('date_of_birth', '1985-07-12', 'mrz'),
      field('date_of_birth', '1985-07-12', 'ead'),
    ])
    expect(out).toHaveLength(0)
  })

  it('a critical field differing across documents → blocking contradiction', () => {
    const out = findCrossDocumentContradictions([
      field('date_of_birth', '1985-07-12', 'mrz', 'passport'),
      field('date_of_birth', '1986-07-12', 'ead', 'ead_card'),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].key).toBe('date_of_birth')
    expect(out[0].blocking).toBe(true)
    // highest-authority source (MRZ) listed first
    expect(out[0].candidates[0].source).toBe('mrz')
    expect(out[0].candidates).toHaveLength(2)
    expect(hasBlockingContradiction([
      field('date_of_birth', '1985-07-12', 'mrz'),
      field('date_of_birth', '1986-07-12', 'ead'),
    ])).toBe(true)
  })

  it('a LOW-criticality field differing → reported but NOT blocking', () => {
    const out = findCrossDocumentContradictions([
      field('document_color', 'blue', 'mrz'),
      field('document_color', 'red', 'ead'),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].blocking).toBe(false)
  })

  it('case/whitespace differences are not contradictions', () => {
    const out = findCrossDocumentContradictions([
      field('family_name', 'Kovalenko', 'mrz'),
      field('family_name', 'KOVALENKO ', 'ead'),
    ])
    expect(out).toHaveLength(0)
  })

  it('a single source is never a contradiction', () => {
    expect(findCrossDocumentContradictions([field('passport_number', 'EK1', 'mrz')])).toHaveLength(0)
  })

  it('a canonicalizer collapses transliteration-equivalent values', () => {
    const canon = (s: string) => s.replace(/i/gi, 'y')
    const out = findCrossDocumentContradictions(
      [field('place_of_birth', 'Vasil', 'mrz'), field('place_of_birth', 'Vasyl', 'ead')],
      canon,
    )
    expect(out).toHaveLength(0)
  })
})
