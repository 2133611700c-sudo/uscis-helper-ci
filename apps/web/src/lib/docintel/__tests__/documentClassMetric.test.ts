import { describe, it, expect, afterEach } from 'vitest'
import { buildDocumentClassMetric, recordDocumentClassMetric } from '../documentClassMetric'

describe('buildDocumentClassMetric (PII-free)', () => {
  it('marks allowlist-eligible for handwritten birth class', () => {
    const m = buildDocumentClassMetric({ product: 'tps', docTypeId: 'ua_birth_certificate' })
    expect(m.kind).toBe('document_class_count')
    expect(m.doc_class).toBe('birth_certificate_handwritten')
    expect(m.anti_fabrication_allowlist_eligible).toBe(true)
    expect(m.self_consistency_eligible).toBe(true)
  })

  it('marks NOT eligible for passport / marriage / unknown', () => {
    expect(buildDocumentClassMetric({ product: 'reparole', docTypeId: 'ua_international_passport' }).anti_fabrication_allowlist_eligible).toBe(false)
    expect(buildDocumentClassMetric({ product: 'translation', docTypeId: 'ua_marriage_certificate' }).self_consistency_eligible).toBe(false)
    expect(buildDocumentClassMetric({ product: 'ead', docTypeId: 'some_unmapped' }).doc_class).toBe('unknown_document')
  })

  it('record contains ONLY class/eligibility — no PII keys', () => {
    const m = buildDocumentClassMetric({ product: 'tps', docTypeId: 'ua_birth_certificate' })
    const keys = Object.keys(m).sort()
    expect(keys).toEqual([
      'anti_fabrication_allowlist_eligible',
      'doc_class',
      'doc_type_id',
      'kind',
      'product',
      'self_consistency_eligible',
    ])
    // no identity-ish keys
    for (const k of keys) {
      expect(/name|dob|birth_date|address|patronymic|given|family|raw|text|file/i.test(k)).toBe(false)
    }
  })
})

describe('recordDocumentClassMetric (emit gating)', () => {
  const orig = process.env.DOCUMENT_CLASS_METRICS_ENABLED
  afterEach(() => {
    if (orig === undefined) delete process.env.DOCUMENT_CLASS_METRICS_ENABLED
    else process.env.DOCUMENT_CLASS_METRICS_ENABLED = orig
  })

  it('silent when flag OFF (never throws)', () => {
    delete process.env.DOCUMENT_CLASS_METRICS_ENABLED
    expect(() => recordDocumentClassMetric({ product: 'tps', docTypeId: 'ua_birth_certificate' })).not.toThrow()
  })

  it('does not throw when flag ON', () => {
    process.env.DOCUMENT_CLASS_METRICS_ENABLED = '1'
    expect(() => recordDocumentClassMetric({ product: 'tps', docTypeId: 'ua_birth_certificate' })).not.toThrow()
  })
})
