/**
 * core.test.ts — Document Core v1 spine: arbitration, readDocumentCore, benchmark.
 * Pure tests, no real documents.
 */
import { describe, it, expect } from 'vitest'
import { arbitrateField, arbitrateDocument, PASSPORT_MRZ_FIELDS } from '../arbitration'
import { readDocumentCore } from '../readDocumentCore'
import { scoreAgainstTruth, parseGroundTruth, type GroundTruth } from '../benchmark'
import type { FieldCandidate, CoreReaders } from '../types'

const c = (p: Partial<FieldCandidate> & { key: string; value: string; source: FieldCandidate['source'] }): FieldCandidate => ({
  confidence: 0.95,
  provider: 'test',
  ...p,
})

describe('Core arbitration — minimal authority policy', () => {
  it('valid MRZ controls a passport field (wins, no review)', () => {
    const f = arbitrateField('passport_number', [
      c({ key: 'passport_number', value: 'EK123456', source: 'mrz', mrzCheckValid: true }),
      c({ key: 'passport_number', value: 'EK128456', source: 'ai_vision' }), // disagrees — ignored
    ])!
    expect(f.normalizedValue).toBe('EK123456')
    expect(f.source).toBe('mrz')
    expect(f.reviewRequired).toBe(false)
    expect(f.evidence).toHaveLength(2) // both kept as evidence
  })

  it('invalid MRZ → review (red flag), not silent fallback', () => {
    const f = arbitrateField('passport_number', [
      c({ key: 'passport_number', value: 'EK123456', source: 'mrz', mrzCheckValid: false }),
    ])!
    expect(f.reviewRequired).toBe(true)
    expect(f.reviewReasons).toContain('mrz_check_failed')
  })

  it('a critical field with NO MRZ anchor → review', () => {
    const f = arbitrateField('family_name', [c({ key: 'family_name', value: 'Kovalenko', source: 'ai_vision' })])!
    expect(f.reviewRequired).toBe(true)
    expect(f.reviewReasons).toContain('critical_no_mrz_anchor')
  })

  it('material conflict on a critical field → review', () => {
    const f = arbitrateField('family_name', [
      c({ key: 'family_name', value: 'Kovalenko', source: 'ai_vision' }),
      c({ key: 'family_name', value: 'Kovalenenko', source: 'document_ocr' }),
    ])!
    expect(f.reviewReasons).toContain('provider_conflict')
    expect(f.reviewRequired).toBe(true)
  })

  it('a fuzzy candidate → review', () => {
    const f = arbitrateField('place_of_birth', [c({ key: 'place_of_birth', value: 'Vinnytsia', source: 'ai_vision', fuzzy: true })])!
    expect(f.reviewReasons).toContain('fuzzy_match')
  })

  it('no candidate → no field (Law 1)', () => {
    expect(arbitrateField('given_name', [])).toBeNull()
    expect(arbitrateField('given_name', [c({ key: 'given_name', value: '   ', source: 'ai_vision' })])).toBeNull()
  })

  it('a confident low-criticality field → no review', () => {
    const f = arbitrateField('document_color', [c({ key: 'document_color', value: 'blue', source: 'ai_vision', confidence: 0.99 })])!
    expect(f.reviewRequired).toBe(false)
  })

  it('PASSPORT_MRZ_FIELDS covers the passport identity set', () => {
    for (const k of ['passport_number', 'date_of_birth', 'sex', 'family_name', 'given_name']) {
      expect(PASSPORT_MRZ_FIELDS.has(k)).toBe(true)
    }
  })
})

describe('readDocumentCore — orchestrator', () => {
  const baseReq = { documentSessionId: 's', product: 'tps' as const, docType: 'passport', createdAt: '2026-05-30T00:00:00Z', file: {} }

  it('bad image → needs_better_photo (never garbage)', async () => {
    const readers: CoreReaders = {
      qualityGate: () => ({ ok: false, reason: 'too_blurry' }),
      visualRead: async () => [],
    }
    const r = await readDocumentCore(baseReq, readers)
    expect(r.status).toBe('needs_better_photo')
    if (r.status === 'needs_better_photo') expect(r.reason).toBe('too_blurry')
  })

  it('no recognized fields → needs_better_photo', async () => {
    const readers: CoreReaders = { qualityGate: () => ({ ok: true }), visualRead: async () => [] }
    const r = await readDocumentCore(baseReq, readers)
    expect(r.status).toBe('needs_better_photo')
  })

  it('passport: runs MRZ reader when expectMrz, MRZ wins', async () => {
    const readers: CoreReaders = {
      qualityGate: () => ({ ok: true }),
      visualRead: async () => [c({ key: 'passport_number', value: 'WRONG99', source: 'ai_vision' })],
      mrzRead: async () => [c({ key: 'passport_number', value: 'EK123456', source: 'mrz', mrzCheckValid: true })],
    }
    const r = await readDocumentCore({ ...baseReq, expectMrz: true }, readers)
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      const pn = r.result.fields.find((f) => f.key === 'passport_number')!
      expect(pn.normalizedValue).toBe('EK123456')
      expect(pn.source).toBe('mrz')
      expect(r.result.requiresReview).toBe(false)
    }
  })
})

describe('benchmark scorer — metric is critical_wrong_count', () => {
  const truth: GroundTruth = {
    document_id: 'd1',
    doc_type: 'passport',
    fields: {
      family_name: { value: 'Kovalenko', critical: true },
      passport_number: { value: 'EK123456', critical: true },
      place_of_birth: { value: 'Lviv', critical: false },
    },
  }

  it('correct critical fields → 0 wrong', () => {
    const s = scoreAgainstTruth(
      [{ key: 'family_name', value: 'KOVALENKO' }, { key: 'passport_number', value: 'EK123456' }],
      truth,
    )
    expect(s.critical_wrong_count).toBe(0)
    expect(s.critical_correct).toBe(2)
  })

  it('critical wrong + NOT flagged = a failure (counts)', () => {
    const s = scoreAgainstTruth([{ key: 'family_name', value: 'Petrenko', reviewRequired: false }], truth)
    expect(s.critical_wrong_count).toBe(1)
  })

  it('critical wrong but FLAGGED for review = NOT a failure (user catches it)', () => {
    const s = scoreAgainstTruth([{ key: 'family_name', value: 'Petrenko', reviewRequired: true }], truth)
    expect(s.critical_wrong_count).toBe(0)
  })

  it('critical missing → counted as missing, not wrong', () => {
    const s = scoreAgainstTruth([{ key: 'passport_number', value: 'EK123456' }], truth)
    expect(s.critical_missing).toBe(1) // family_name absent
    expect(s.critical_wrong_count).toBe(0)
  })

  it('parseGroundTruth validates shape', () => {
    expect(() => parseGroundTruth({ document_id: 'x', doc_type: 'y', fields: { a: { value: 'v' } } })).not.toThrow()
    expect(() => parseGroundTruth({ document_id: 'x' })).toThrow()
    expect(() => parseGroundTruth({ document_id: 'x', doc_type: 'y', fields: { a: { novalue: 1 } } })).toThrow()
  })
})
