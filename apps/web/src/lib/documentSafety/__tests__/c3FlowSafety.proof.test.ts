/**
 * C3 flag-ON local proof — demonstrates the safety outcome each WIRED flow produces when
 * OCR_FIELD_SAFETY_ENABLED=1, using the exact guard/helper the routes call. (Route-level HTTP /
 * browser proof is the owner's canary step.) Synthetic data only, no PII.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { applyOcrFieldSafety, classifyCriticality, isOcrFieldSafetyEnabled } from '../applyOcrFieldSafety'
import { protectOcrField, hasUnresolvedCriticalForOutput } from '../ocrFieldSafetyGate'

describe('C3 flag gate — OFF means no enforcement (routes skip), ON means enforce', () => {
  afterEach(() => { delete process.env.OCR_FIELD_SAFETY_ENABLED })
  it('OFF (absent) → isOcrFieldSafetyEnabled false → routes skip the guard (byte-identical)', () => {
    delete process.env.OCR_FIELD_SAFETY_ENABLED
    expect(isOcrFieldSafetyEnabled()).toBe(false)
  })
  it('ON → enforcement active', () => {
    process.env.OCR_FIELD_SAFETY_ENABLED = '1'
    expect(isOcrFieldSafetyEnabled()).toBe(true)
  })
})

describe('FLOW 1 — Translation public (hard-case birth cert): critical → candidate-only, never final', () => {
  it('vision-extract transform: family/given/patronymic become candidate-only + manual', () => {
    const fields = [
      { field: 'family_name', value: 'A', raw_cyrillic: 'А', confidence: 0.95 },
      { field: 'given_name', value: 'B', raw_cyrillic: 'Б', confidence: 0.95 },
      { field: 'patronymic', value: 'C', raw_cyrillic: 'ович', confidence: 0.95 },
    ]
    const { fields: out, anyUnresolvedCritical } = applyOcrFieldSafety(fields, {
      flow: 'translation_public', document_class: 'birth_certificate_handwritten',
    })
    for (const f of out) {
      expect(f.value).toBeNull()                 // not final
      expect(f.candidate_value).not.toBeNull()   // candidate preserved
      expect(f.review_required).toBe(true)
      expect(f.manual_required).toBe(true)
    }
    expect(anyUnresolvedCritical).toBe(true)
  })
  it('zero recognition → manual_required, not silent success', () => {
    const r = protectOcrField({ flow: 'translation_public', field_name: 'family_name', criticality: 'critical_identity', value_present: false, zero_usable_recognition: true })
    expect(r.final_value_allowed).toBe(false)
    expect(r.manual_required).toBe(true)
    expect(r.reason_codes).toContain('zero_usable_recognition')
  })
})

describe('FLOW 2 — TPS merge: legacy/source-mismatch critical → not final', () => {
  it('legacy reader truncated patronymic → not final (candidate/manual)', () => {
    const r = protectOcrField({ flow: 'tps_legacy', field_name: 'patronymic', criticality: 'critical_identity', value_present: true, legacy_reader: true, strong_source_anchor: false })
    expect(r.final_value_allowed).toBe(false)
    expect(r.reason_codes).toContain('legacy_reader_untrusted')
  })
  it('birth cert cannot fill an internal-passport-expected field (source mismatch)', () => {
    const r = protectOcrField({ flow: 'tps_core', field_name: 'family_name', criticality: 'critical_identity', value_present: true, source_doc_type: 'ua_birth_certificate', expected_source_doc_type: 'ua_internal_passport_booklet', strong_source_anchor: true })
    expect(r.final_value_allowed).toBe(false)
    expect(r.reason_codes).toContain('source_doc_type_mismatch')
  })
})

describe('FLOW 3 — Legacy OCR boundary: critical legacy → candidate-only', () => {
  it('legacy critical (no strong anchor) not final; admin passes', () => {
    expect(protectOcrField({ flow: 'legacy_ocr', field_name: 'passport_number', criticality: 'critical_document', value_present: true, legacy_reader: true }).final_value_allowed).toBe(false)
    expect(protectOcrField({ flow: 'legacy_ocr', field_name: 'us_address_state', criticality: 'admin', value_present: true, legacy_reader: true }).final_value_allowed).toBe(true)
  })
})

describe('FLOW 4 — PDF/payment: unresolved critical blocks; admin does not', () => {
  it('unresolved critical blocks output', () => {
    expect(hasUnresolvedCriticalForOutput([{ criticality: 'critical_identity', review_required: true }])).toBe(true)
  })
  it('confirmed critical + unresolved admin → output allowed', () => {
    expect(hasUnresolvedCriticalForOutput([
      { criticality: 'critical_identity', review_required: true, confirmed: true },
      { criticality: 'admin', manual_required: true },
    ])).toBe(false)
  })
})

describe('classifyCriticality sanity for the wired routes', () => {
  it('identity vs document vs admin', () => {
    expect(classifyCriticality('patronymic')).toBe('critical_identity')
    expect(classifyCriticality('passport_number')).toBe('critical_document')
    expect(classifyCriticality('us_address_zip')).toBe('admin')
  })
})
