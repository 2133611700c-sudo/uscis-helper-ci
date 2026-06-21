/**
 * shadow.test.ts — P2.3: the parity diff that will prove/disprove the two-brain
 * problem with numbers, and the OFF-by-default ONE_BRAIN_SHADOW flag.
 */
import { describe, it, expect } from 'vitest'
import { diffCanonical, isShadowEnabled, summarizeParity } from '../shadow'
import type { CanonicalDocumentResult, CanonicalField } from '../types'
import { buildConfidence } from '../policy'

function field(key: string, value: string): CanonicalField {
  return {
    key,
    rawValue: value,
    normalizedValue: value,
    criticality: 'low',
    confidence: buildConfidence({ ocr: 0.9, field_match: null, normalization: null, source_match: null }),
    source: 'document_ocr',
    reviewRequired: false,
    reviewReasons: [],
    evidence: [],
  }
}

function doc(fields: CanonicalField[]): CanonicalDocumentResult {
  return {
    documentSessionId: 's',
    product: 'tps',
    docType: 'passport',
    fields,
    hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
    createdAt: '2026-05-30T00:00:00Z',
    requiresReview: false,
  }
}

describe('P2.3 shadow — diffCanonical', () => {
  it('identical docs → 100% parity, no disagreements', () => {
    const a = doc([field('family_name', 'Kovalenko'), field('date_of_birth', '1985-07-12')])
    const r = diffCanonical(a, doc([field('family_name', 'Kovalenko'), field('date_of_birth', '1985-07-12')]))
    expect(r.parityRate).toBe(1)
    expect(r.disagree).toBe(0)
    expect(r.criticalDisagreements).toBe(0)
  })

  it('case/whitespace differences still count as agreement', () => {
    const r = diffCanonical(doc([field('family_name', 'Kovalenko')]), doc([field('family_name', 'KOVALENKO ')]))
    expect(r.disagree).toBe(0)
    expect(r.agree).toBe(1)
  })

  it('a critical-field value difference is a critical disagreement', () => {
    const r = diffCanonical(doc([field('family_name', 'Kovalenko')]), doc([field('family_name', 'Kovalenenko')]))
    expect(r.disagree).toBe(1)
    expect(r.criticalDisagreements).toBe(1) // family_name is critical
    expect(r.parityRate).toBe(0)
  })

  it('left_only / right_only fields are counted, not silently ignored', () => {
    const r = diffCanonical(doc([field('a_number', '123456789')]), doc([field('passport_number', 'EK1')]))
    expect(r.leftOnly).toBe(1)
    expect(r.rightOnly).toBe(1)
    expect(r.agree).toBe(0)
  })

  it('a canonicalizer treats transliteration-equivalent values as equal', () => {
    const canon = (s: string) => s.replace(/i/gi, 'y')
    const r = diffCanonical(doc([field('place_of_birth', 'Vasil')]), doc([field('place_of_birth', 'Vasyl')]), canon)
    expect(r.disagree).toBe(0)
  })

  it('summary is PII-free (counts + keys only, never values)', () => {
    const r = diffCanonical(doc([field('family_name', 'Kovalenko')]), doc([field('family_name', 'Petrenko')]))
    const s = summarizeParity(r)
    expect(s).toContain('critical_disagree=1')
    expect(s).toContain('family_name') // key is safe
    expect(s).not.toContain('Kovalenko') // value is NOT logged
    expect(s).not.toContain('Petrenko')
  })
})

describe('P2.3 shadow — flag is OFF by default', () => {
  it('absent / other values → disabled', () => {
    expect(isShadowEnabled({})).toBe(false)
    expect(isShadowEnabled({ ONE_BRAIN_SHADOW: '0' })).toBe(false)
    expect(isShadowEnabled({ ONE_BRAIN_SHADOW: 'off' })).toBe(false)
  })
  it('only an explicit 1/true enables it', () => {
    expect(isShadowEnabled({ ONE_BRAIN_SHADOW: '1' })).toBe(true)
    expect(isShadowEnabled({ ONE_BRAIN_SHADOW: 'true' })).toBe(true)
  })
})
